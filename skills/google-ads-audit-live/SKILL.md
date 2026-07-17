---
name: google-ads-audit-live
description: Run a LIVE, read-only Google Ads account audit by pulling real account data via the Google Ads API and producing a grounded, evidence-based audit. Use when the user wants to audit a connected Google Ads account, check wasted spend, review search terms, conversion tracking, Quality Score, budgets/bidding, or asks for a full account health check against live data. Requires one-time credential setup (see SETUP-COWORK.md).
---

# Google Ads Audit — Live (Cowork)

Pulls **real** data from a connected Google Ads account and writes a grounded audit. This skill
is **read-only**: it only ever runs GAQL `searchStream` (reads). It never changes bids, budgets,
status, or anything in the account. It needs no Anthropic API key — **you (the Cowork session)
write the audit** from the data the helper returns.

## Before the first run — is it configured?

1. Check that a `.env` file exists in the working folder with the Google Ads credentials.
   If it does not, **stop and walk the user through `SETUP-COWORK.md`** — it is an all-browser,
   no-install setup (Google Cloud OAuth client, an MCC developer token, and a refresh token
   minted in Google's OAuth Playground). Never ask the user to paste secrets into the chat —
   they put them directly into `.env`.
2. To sanity-check config without spending anything, run a dry run (below) — it needs the plan
   only, not live access.

## How to run

The helper script prints ONE JSON blob to stdout. Run it with `node`:

```
node scripts/gads.mjs --list                                   # workflows + modules, no calls
node scripts/gads.mjs --workflow full_audit --range last30 --dry   # plan + exact GAQL, NO API calls/credits
node scripts/gads.mjs --workflow full_audit --range last30         # LIVE pull
node scripts/gads.mjs --workflow search_term_audit --range last7
node scripts/gads.mjs --modules search_terms,quality_score --range custom --start 2026-06-01 --end 2026-06-30
node scripts/gads.mjs --account 1234567890 --workflow full_audit --range last30   # audit a different account
```

**Workflows:** `performance_report`, `search_term_audit`, `conversion_tracking`, `full_audit`,
`eom_projection`. **Ranges:** `yesterday`, `last7`, `last14`, `last30`, `last90`, `mtd`, `custom`
(with `--start`/`--end`). You can also hand-pick modules with `--modules` (comma-separated):
`search_terms`, `budget_bidding`, `conversion_quality`, `quality_score`, `ads_assets`,
`pmax_shopping`, `segmentation`, `landing_pages`.

## Workflow when the user asks for an audit

1. **Clarify only what's needed:** which account (default `GOOGLE_ADS_CUSTOMER_ID` in `.env`),
   which workflow (default `full_audit`), date range (default `last30`), and — only if they want
   brand vs non-brand analysis — their **brand terms** (e.g. "Brand terms: acme, acme pro").
2. **Offer a dry run first** (`--dry`) so they can preview the exact GAQL and modules at $0. Show it.
3. **Run live.** Parse the JSON. Then write the audit from the returned rows only.
4. **Offer exports** (Markdown / Word / Excel / PDF) — the `docx`, `pptx`, `pdf`, and `xlsx`
   skills are available in Cowork if the user wants a file.

## Reading the JSON

- `data.basePerformance.current` / `.previous` → campaign rows for the range and the immediately
  preceding equal-length comparison period. Use them for **movement/deltas**.
- `data.modules[]` → one entry per selected module, each with `queries[]`. A query returns either
  `{ rows: [...] }` or `{ error: "..." }`.
- Cost comes back in **micros** — divide `costMicros` by 1,000,000. REST returns nested camelCase
  fields (e.g. `row.campaign.name`, `row.metrics.costMicros`).
- `data.no_gaql_source` → checks that have no GAQL source; report those as "Insufficient data".
- **`hint`** (top level) → present when config is incomplete or a live call was rejected. It's a
  plain-English fix (usually a developer-token access-level or permissions issue). **Relay it to
  the user verbatim** and help them resolve it before retrying.
- **`allQueriesFailed: true`** → every query was rejected (almost always the token access level).
  Lead with the `hint` and do **not** produce an audit — there's no real data.

## Auditor rules (follow exactly — this is what keeps it trustworthy)

- **Cover only the selected modules** plus base performance. Never invent a module the user
  didn't select.
- **Ground every finding in the returned rows.** If a query is EMPTY or returned an `error`, or a
  check has no data source, write exactly **"Insufficient data for this check."** — never generic
  best-practice filler, never invented numbers.
- **Search Terms:** compare the search-terms list against the **existing keywords** (don't suggest
  adding a term that's already a keyword) and against **existing negatives** (don't suggest a
  negative that already exists). Flag converting terms not yet added, and zero-conversion spend to
  negate.
- **Movement:** use the comparison period to report deltas; if it's absent or empty, say so.
- **Brand vs non-brand:** classify ONLY using the brand-terms rule the user supplied. If none was
  given, mark brand/non-brand checks "Insufficient data for this check."
- **Read-only integrity:** never propose that the skill make changes — it only reads. Recommend
  actions for the user to take themselves.

## Output format

Default: **Executive summary** (3–6 bullets) + **Prioritized action list** (table with Impact +
Effort, most impactful first). Add detailed narrative / data tables / Slack- or email-ready
versions on request. End with a footer noting the account, date range, modules run, whether a
comparison period was used, and that empty/unavailable checks were reported as insufficient data.

## Safety

Read-only. Only `googleAds:searchStream` is ever called. If the account isn't configured, say so
plainly and point to `SETUP-COWORK.md` — never fabricate data to fill a gap.
