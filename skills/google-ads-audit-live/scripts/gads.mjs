#!/usr/bin/env node
// gads.mjs — READ-ONLY Google Ads audit data puller for Claude Cowork (zero dependencies).
//
// What it does: resolves a workflow + date range, builds the exact GAQL for the selected
// modules, runs them against the live account, and prints ONE JSON blob to stdout. Claude
// (the Cowork session) turns that JSON into the audit narrative — this script writes nothing.
//
// SAFETY: only ever calls googleAds:searchStream (read). No mutate endpoints. No writes.
//
// Usage:
//   node scripts/gads.mjs --list                      # show workflows + modules, no calls
//   node scripts/gads.mjs --workflow full --dry       # print the plan + exact GAQL, NO API calls
//   node scripts/gads.mjs --workflow full --range last30            # live pull
//   node scripts/gads.mjs --workflow search_term_audit --range last7
//   node scripts/gads.mjs --modules search_terms,quality_score --range custom --start 2026-06-01 --end 2026-06-30
//   node scripts/gads.mjs --account 1234567890 ...    # override GOOGLE_ADS_CUSTOMER_ID for this run
//
// Reads credentials from .env in the current folder (see .env.example). No dotenv needed.

import { readFileSync, existsSync } from "node:fs";

/* ------------------------- tiny .env loader (no dependency) ------------------------- */
(function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v24";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const digits = (s) => String(s || "").replace(/[^0-9]/g, "");

function config() {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    customerId: digits(process.env.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
  };
}
function missingSecrets() {
  const c = config();
  return ["developerToken", "clientId", "clientSecret", "refreshToken", "customerId"].filter((k) => !c[k]);
}

/* ------------------------------- OAuth + read-only search ------------------------------- */
let cached = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 30000) return cached.value;
  const c = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret,
      refresh_token: c.refreshToken, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  cached = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.value;
}

// Run a GAQL query -> array of result rows. READ-ONLY (searchStream).
async function search(gaql, customerId) {
  const c = config();
  const cid = digits(customerId) || c.customerId;
  const token = await accessToken();
  const headers = {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
    "developer-token": c.developerToken,
  };
  if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId;
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query: gaql }) });
  if (!res.ok) throw new Error(`Google Ads API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const batches = await res.json(); // [{ results:[...] }, ...]
  const rows = [];
  for (const b of batches) if (b.results) rows.push(...b.results);
  return rows;
}

/* -------------------------------- date-range resolution -------------------------------- */
function iso(d) { return d.toISOString().slice(0, 10); }
function resolveRange(p, customStart, customEnd) {
  const today = new Date();
  const back = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  let start, end = new Date(today), label = p;
  if (p === "yesterday") { start = back(1); end = back(1); label = "Yesterday"; }
  else if (p === "last7") { start = back(6); label = "Last 7 days"; }
  else if (p === "last14") { start = back(13); label = "Last 14 days"; }
  else if (p === "last30") { start = back(29); label = "Last 30 days"; }
  else if (p === "last90") { start = back(89); label = "Last 90 days"; }
  else if (p === "mtd") { start = new Date(today.getFullYear(), today.getMonth(), 1); label = "Month to date"; }
  else if (p === "custom" && customStart && customEnd) { start = new Date(customStart); end = new Date(customEnd); label = `${customStart} -> ${customEnd}`; }
  else { start = back(29); label = "Last 30 days"; }
  const lenDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const cmpEnd = new Date(start); cmpEnd.setDate(cmpEnd.getDate() - 1);
  const cmpStart = new Date(cmpEnd); cmpStart.setDate(cmpStart.getDate() - (lenDays - 1));
  return { start: iso(start), end: iso(end), label, cmpStart: iso(cmpStart), cmpEnd: iso(cmpEnd) };
}
function validateCustom(p, s, e) {
  if (p !== "custom") return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!s) return "Start date is required for a custom range (--start YYYY-MM-DD).";
  if (!e) return "End date is required for a custom range (--end YYYY-MM-DD).";
  if (e < s) return "End date cannot be earlier than Start date.";
  if (e > todayIso) return "End date cannot be in the future.";
  return null;
}

/* ------------------------------- GAQL module query library ------------------------------- */
// {{S}} / {{E}} are replaced with the resolved start/end. Every query is read-only.
const dc = "segments.date BETWEEN '{{S}}' AND '{{E}}'";

const BASE_CURRENT = `SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${dc} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 50`;

const MODULES = {
  search_terms: {
    label: "Search Terms",
    queries: [
      { name: "search_terms", gaql: `SELECT search_term_view.search_term, campaign.name, search_term_view.status, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 120` },
      { name: "existing_keywords", gaql: `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.conversions FROM keyword_view WHERE ${dc} LIMIT 500` },
      { name: "existing_negatives", gaql: `SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE LIMIT 500` },
    ],
  },
  budget_bidding: {
    label: "Budget & Bidding",
    queries: [
      { name: "budget_bidding", gaql: `SELECT campaign.name, campaign.bidding_strategy_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.conversions, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE ${dc} AND campaign.status = 'ENABLED' ORDER BY metrics.cost_micros DESC LIMIT 60` },
    ],
  },
  conversion_quality: {
    label: "Conversion Tracking & Quality",
    queries: [
      { name: "conversion_actions", gaql: `SELECT conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.type, conversion_action.primary_for_goal FROM conversion_action LIMIT 200` },
      { name: "conversion_by_action", gaql: `SELECT segments.conversion_action_name, metrics.all_conversions, metrics.conversions FROM customer WHERE ${dc}` },
    ],
  },
  quality_score: {
    label: "Quality Score",
    queries: [
      { name: "quality_score", gaql: `SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, metrics.clicks FROM keyword_view WHERE ${dc} ORDER BY metrics.clicks DESC LIMIT 120` },
    ],
  },
  ads_assets: {
    label: "Ads & Assets",
    queries: [
      { name: "ad_strength", gaql: `SELECT campaign.name, ad_group_ad.ad_strength, ad_group_ad.ad.type, metrics.clicks, metrics.conversions FROM ad_group_ad WHERE ${dc} AND ad_group_ad.status = 'ENABLED' ORDER BY metrics.clicks DESC LIMIT 100` },
      { name: "campaign_assets", gaql: `SELECT campaign.name, campaign_asset.field_type, asset.type FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' LIMIT 300` },
    ],
  },
  pmax_shopping: {
    label: "PMax / Shopping",
    queries: [
      { name: "asset_groups", gaql: `SELECT asset_group.name, asset_group.status, campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 60` },
      { name: "shopping_products", gaql: `SELECT segments.product_item_id, metrics.cost_micros, metrics.conversions FROM shopping_performance_view WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 80` },
    ],
  },
  segmentation: {
    label: "Segmentation",
    queries: [
      { name: "by_device", gaql: `SELECT campaign.name, segments.device, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${dc} AND campaign.status = 'ENABLED'` },
      { name: "by_network", gaql: `SELECT campaign.name, segments.ad_network_type, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${dc} AND campaign.status = 'ENABLED'` },
      { name: "by_day_of_week", gaql: `SELECT campaign.name, segments.day_of_week, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${dc} AND campaign.status = 'ENABLED'` },
      { name: "by_geo", gaql: `SELECT geographic_view.country_criterion_id, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE ${dc} LIMIT 80` },
      { name: "by_match_type", gaql: `SELECT ad_group_criterion.keyword.match_type, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${dc} LIMIT 200` },
    ],
  },
  landing_pages: {
    label: "Landing Pages",
    queries: [
      { name: "landing_pages", gaql: `SELECT landing_page_view.unexpanded_final_url, metrics.clicks, metrics.conversions, metrics.cost_micros FROM landing_page_view WHERE ${dc} ORDER BY metrics.clicks DESC LIMIT 80` },
    ],
  },
};

const WORKFLOWS = {
  performance_report: { title: "Performance Report", modules: [], note: "Base performance only, with movement vs the comparison period." },
  search_term_audit: { title: "Search Term Audit", modules: ["search_terms"], note: "Converting search terms not yet keywords + wasted-spend terms to negate." },
  conversion_tracking: { title: "Conversion Tracking & Quality", modules: ["conversion_quality"], note: "Are conversions set up correctly and counted once?" },
  full_audit: { title: "Full Account Audit", modules: ["search_terms", "budget_bidding", "conversion_quality", "quality_score", "ads_assets", "segmentation"], note: "The complete health check." },
  eom_projection: { title: "End of Month Projection", modules: [], note: "Project MTD run-rate to month end (run with --range mtd)." },
};

// Modules whose failure/absence maps to an explicit "Insufficient data" note, never invented.
const NO_GAQL_SOURCE = [
  "Smart-bidding learning-mode status",
  "Qualified-lead / lead-quality gap (needs CRM data)",
  "Product disapprovals (needs Merchant Center feed)",
  "Landing-page broken/slow/mobile (needs an external validator — not in this skill)",
  "Brand vs non-brand (only if an explicit brand-term rule is supplied in the request)",
];

/* ----------------------------------------- CLI ----------------------------------------- */
function parseArgs(argv) {
  const a = { modules: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--list") a.list = true;
    else if (t === "--dry") a.dry = true;
    else if (t === "--workflow") a.workflow = argv[++i];
    else if (t === "--modules") a.modules = argv[++i];
    else if (t === "--range") a.range = argv[++i];
    else if (t === "--start") a.start = argv[++i];
    else if (t === "--end") a.end = argv[++i];
    else if (t === "--account") a.account = argv[++i];
    else if (t === "--help" || t === "-h") a.help = true;
  }
  return a;
}

function fill(gaql, r) { return gaql.replaceAll("{{S}}", r.start).replaceAll("{{E}}", r.end); }

function selectedModuleKeys(a) {
  if (a.modules) return a.modules.split(",").map((s) => s.trim()).filter(Boolean);
  const wf = WORKFLOWS[a.workflow || "full_audit"];
  return wf ? wf.modules : [];
}

// Turn a raw API error string into an actionable, plain-English hint for the user.
function diagnose(errors, cid) {
  const all = errors.join(" | ").toLowerCase();
  if (/developer.?token|not.?approved/.test(all))
    return "Developer-token access level too low for production. A brand-new token is TEST level, which blocks production accounts. In the MCC open Admin → API Center (https://ads.google.com/aw/apicenter) and check the level next to the token: Explorer, Basic, or Standard can read production accounts — Explorer (~2,880 API ops/day) is more than enough for an audit. If it still says Test, click 'Apply for Basic access' and complete advertiser verification on an account under this MCC to speed the review (multi-week backlog in 2026). See SETUP-COWORK.md Step 4.";
  if (/permission_denied|doesn.?t have permission|user .*permission|not have access/.test(all))
    return `Permission denied on customer ${cid}. The Google user you authorized as (OAuth Playground step) must have access to this account — or, if you reach it through the MCC, set GOOGLE_ADS_LOGIN_CUSTOMER_ID to the manager's 10-digit id in .env. See SETUP-COWORK.md Step 5.`;
  if (/invalid_grant/.test(all))
    return "OAuth refresh failed (invalid_grant): the refresh token is wrong or was revoked — re-mint it in the OAuth Playground. See SETUP-COWORK.md Step 6.";
  if (/ 404|not found/.test(all))
    return `Got HTTP 404 — the API version (${API_VERSION}) may be sunset. Set GOOGLE_ADS_API_VERSION to a current version in .env.`;
  return null;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));

  if (a.help) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 22).join("\n").replace(/^\/\/ ?/gm, ""));
    return;
  }
  if (a.list) {
    console.log(JSON.stringify({
      workflows: Object.fromEntries(Object.entries(WORKFLOWS).map(([k, v]) => [k, { title: v.title, modules: v.modules, note: v.note }])),
      modules: Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, { label: v.label, queries: v.queries.map((q) => q.name) }])),
      ranges: ["yesterday", "last7", "last14", "last30", "last90", "mtd", "custom"],
      no_gaql_source: NO_GAQL_SOURCE,
    }, null, 2));
    return;
  }

  const workflow = a.workflow || (a.modules ? "custom_modules" : "full_audit");
  const rangeKey = a.range || (workflow === "eom_projection" ? "mtd" : "last30");
  const customErr = validateCustom(rangeKey, a.start, a.end);
  if (customErr) { console.log(JSON.stringify({ ok: false, error: customErr })); process.exitCode = 1; return; }
  const range = resolveRange(rangeKey, a.start, a.end);
  const modKeys = selectedModuleKeys(a).filter((k) => MODULES[k]);
  const unknown = selectedModuleKeys(a).filter((k) => !MODULES[k]);

  // Build the plan (exact GAQL each selected module would run, with dates injected).
  const plan = {
    workflow, workflowTitle: (WORKFLOWS[workflow] && WORKFLOWS[workflow].title) || "Custom module set",
    note: (WORKFLOWS[workflow] && WORKFLOWS[workflow].note) || "",
    range, modules: modKeys, unknownModules: unknown,
    basePerformance: { current: fill(BASE_CURRENT, range), previous: fill(BASE_CURRENT, { start: range.cmpStart, end: range.cmpEnd }) },
    moduleQueries: modKeys.map((k) => ({ module: k, label: MODULES[k].label, queries: MODULES[k].queries.map((q) => ({ name: q.name, gaql: fill(q.gaql, range) })) })),
    no_gaql_source: NO_GAQL_SOURCE,
  };

  // DRY RUN: no API calls, no credits — just the plan.
  if (a.dry) {
    console.log(JSON.stringify({ ok: true, mode: "dry", account: a.account || config().customerId, plan }, null, 2));
    return;
  }

  // LIVE RUN: verify credentials first.
  const miss = missingSecrets();
  if (miss.length && !(a.account && miss.length === 1 && miss[0] === "customerId")) {
    console.log(JSON.stringify({
      ok: false, mode: "live",
      error: `Not configured — missing .env values: ${miss.join(", ")}. See SETUP-COWORK.md.`,
      missing: miss,
      hint: "Once these are filled, a LIVE production audit also needs the developer token to be Explorer, Basic, or Standard level (not Test). Check it in the MCC → Admin → API Center; a new token often starts at Test and is blocked on real accounts. See SETUP-COWORK.md Step 4.",
    }));
    process.exitCode = 1;
    return;
  }

  const cid = a.account || config().customerId;
  const errors = [];
  const runQ = async (gaql) => { try { return { rows: await search(gaql, cid) }; } catch (e) { const msg = String(e.message || e); errors.push(msg); return { error: msg }; } };

  const out = { ok: true, mode: "live", account: cid, loginCustomerId: config().loginCustomerId || null, apiVersion: API_VERSION, plan: { workflow, workflowTitle: plan.workflowTitle, note: plan.note, range, modules: modKeys }, data: {} };

  out.data.basePerformance = {
    current: await runQ(plan.basePerformance.current),
    previous: await runQ(plan.basePerformance.previous),
  };
  out.data.modules = [];
  for (const k of modKeys) {
    const queries = [];
    for (const q of MODULES[k].queries) queries.push({ name: q.name, ...(await runQ(fill(q.gaql, range))) });
    out.data.modules.push({ module: k, label: MODULES[k].label, queries });
  }
  out.data.no_gaql_source = NO_GAQL_SOURCE;

  // If any live query was rejected, attach an actionable hint (access level, permissions, etc.).
  const hint = diagnose(errors, cid);
  if (hint) out.hint = hint;
  // If EVERY query failed, flag it so Claude leads with the fix instead of an empty audit.
  const totalQ = 2 + out.data.modules.reduce((n, m) => n + m.queries.length, 0);
  const failedQ = (out.data.basePerformance.current.error ? 1 : 0) + (out.data.basePerformance.previous.error ? 1 : 0) + out.data.modules.reduce((n, m) => n + m.queries.filter((q) => q.error).length, 0);
  if (failedQ === totalQ) out.allQueriesFailed = true;

  console.log(JSON.stringify(out));
}

main().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e.message || e) })); process.exitCode = 1; });
