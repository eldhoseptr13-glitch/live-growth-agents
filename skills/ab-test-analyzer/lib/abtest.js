// Experiment Analyzer — exact, deterministic statistics across channels.
// Standardizes A/B analysis for Meta/Google ad creatives, email, landing pages,
// and generic tests: multiple metrics per test, each significance-tested (two-
// proportion z, direction-aware), reconciled into a continue / pause / iterate
// verdict — with power, weak-sample callouts, and a plain-English glossary.
// No AI, no fabrication — the same inputs always give the same answer.

const table = (head, rows) => `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
const pctS = (x, d = 1) => (x == null || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + x.toFixed(d) + "%");
const ratePct = (x) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(2) + "%");
const intFmt = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString());

// ── normal helpers ──
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function invNorm(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425, ph = 1 - pl; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
const pFromZ = (z, oneSided) => oneSided ? 1 - normCdf(Math.abs(z)) : 2 * (1 - normCdf(Math.abs(z)));
const CHI_001 = { 1: 10.83, 2: 13.82, 3: 16.27, 4: 18.47, 5: 20.52, 6: 22.46 };

// ── channel presets: which metrics matter, and their direction ──
// metric: { key, label, num, den, dir: "up"|"down", primary? }  · fields = per-arm inputs · base = the split-integrity denominator
const PRESETS = {
  meta_creative: {
    label: "Meta / Google ad creative", base: "impressions",
    fields: [["impressions", "Impressions"], ["clicks", "Clicks"], ["conversions", "Conversions"], ["spend", "Spend (optional)"]],
    metrics: [
      { key: "ctr", label: "CTR", num: "clicks", den: "impressions", dir: "up", type: "proportion" },
      { key: "cvrclick", label: "Conv. rate (per click)", num: "conversions", den: "clicks", dir: "up", type: "proportion" },
      { key: "cpc", label: "CPC", count: "clicks", exposure: "spend", dir: "down", type: "cost" },
      { key: "cpa", label: "CPA", count: "conversions", exposure: "spend", dir: "down", type: "cost", primary: true },
      { key: "cvrimpr", label: "Conversions / impression", num: "conversions", den: "impressions", dir: "up", type: "proportion", primary: true },
    ],
    mixedNote: "more clicks but the money metric (CPA / conversions-per-impression) didn't improve — the extra clicks aren't converting. Iterate the offer/landing (or the audience) rather than just scaling the higher-CTR creative.",
  },
  email: {
    label: "Email", base: "delivered",
    fields: [["delivered", "Delivered"], ["opens", "Opens"], ["clicks", "Clicks"], ["conversions", "Conversions"]],
    metrics: [
      { key: "open", label: "Open rate", num: "opens", den: "delivered", dir: "up" },
      { key: "click", label: "Click rate", num: "clicks", den: "delivered", dir: "up" },
      { key: "cvr", label: "Conversion rate", num: "conversions", den: "delivered", dir: "up", primary: true },
    ],
    mixedNote: "the subject line earns opens/clicks but the body or offer doesn't convert — iterate the email content, not the subject.",
  },
  landing: {
    label: "Landing page", base: "visitors",
    fields: [["visitors", "Visitors"], ["conversions", "Conversions"], ["bounces", "Bounces"]],
    metrics: [
      { key: "cvr", label: "Conversion rate", num: "conversions", den: "visitors", dir: "up", primary: true },
      { key: "bounce", label: "Bounce rate", num: "bounces", den: "visitors", dir: "down" },
    ],
    mixedNote: "fewer bounces but not more conversions — the page holds attention better yet the offer/CTA still isn't closing. Iterate the CTA/offer.",
  },
  generic: {
    label: "Generic / VWO", base: "visitors",
    fields: [["visitors", "Visitors"], ["conversions", "Conversions"]],
    metrics: [{ key: "cvr", label: "Conversion rate", num: "conversions", den: "visitors", dir: "up", primary: true }],
    mixedNote: "",
  },
};

// Two-proportion test on a rate = num/den. Direction-aware ("win" respects dir).
function rateTest(numC, denC, numV, denV, alpha, oneSided, dir) {
  if (!denC || !denV) return null;
  const p1 = numC / denC, p2 = numV / denV, diff = p2 - p1, lift = p1 ? diff / p1 * 100 : null;
  const pPool = (numC + numV) / (denC + denV);
  const seNull = Math.sqrt(pPool * (1 - pPool) * (1 / denC + 1 / denV));
  const seAlt = Math.sqrt(p1 * (1 - p1) / denC + p2 * (1 - p2) / denV);
  const z = seNull ? diff / seNull : 0, p = pFromZ(z, oneSided);
  const zc = invNorm(oneSided ? 1 - alpha : 1 - alpha / 2), zB = invNorm(0.8);
  const ciLo = diff - zc * seAlt, ciHi = diff + zc * seAlt;
  const power = seAlt ? normCdf((Math.abs(diff) - zc * seNull) / seAlt) : 0;
  const nReq = diff ? Math.ceil(Math.pow(zc * Math.sqrt(2 * pPool * (1 - pPool)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / (diff * diff)) : null;
  const improvement = dir === "down" ? diff < 0 : diff > 0;
  const sig = p < alpha;
  return { p1, p2, diff, lift, liftLo: p1 ? ciLo / p1 * 100 : null, liftHi: p1 ? ciHi / p1 * 100 : null, p, power, nReq, sig, improvement, win: sig && improvement, worse: sig && !improvement, minDen: Math.min(denC, denV), minNum: Math.min(numC, numV) };
}

function welchTest(ctrl, vAr, alpha, oneSided) {
  const diff = vAr.mean - ctrl.mean, lift = ctrl.mean ? diff / ctrl.mean * 100 : null;
  const se = Math.sqrt((ctrl.sd * ctrl.sd) / ctrl.n + (vAr.sd * vAr.sd) / vAr.n);
  const z = se ? diff / se : 0, p = pFromZ(z, oneSided), zc = invNorm(oneSided ? 1 - alpha : 1 - alpha / 2);
  return { p1: ctrl.mean, p2: vAr.mean, diff, lift, liftLo: ctrl.mean ? (diff - zc * se) / ctrl.mean * 100 : null, liftHi: ctrl.mean ? (diff + zc * se) / ctrl.mean * 100 : null, p, power: null, nReq: null, sig: p < alpha, improvement: diff > 0, win: p < alpha && diff > 0, worse: p < alpha && diff < 0, minDen: Math.min(ctrl.n, vAr.n), minNum: Math.min(ctrl.n, vAr.n) };
}

// Cost-per-outcome test (CPA, CPC). Cost = spend/count is a ratio, not a
// proportion — so we test conversions-per-dollar via the two-Poisson-rate
// (conditional-binomial) test, and translate to a CPA/CI via the delta method.
// dir is "down" (lower cost is better). Returns {p1,p2}=cost values.
function costTest(countC, spendC, countV, spendV, alpha, oneSided) {
  if (!spendC || !spendV || (countC + countV) === 0) return null;
  const K = countC + countV, w = spendC / (spendC + spendV);
  const seNull = Math.sqrt(K * w * (1 - w));
  const z = seNull ? (countC - K * w) / seNull : 0, p = pFromZ(z, oneSided);
  const cpaC = countC ? spendC / countC : null, cpaV = countV ? spendV / countV : null;
  const zc = invNorm(oneSided ? 1 - alpha : 1 - alpha / 2);
  let lift = null, liftLo = null, liftHi = null;
  if (cpaC && cpaV) { const logR = Math.log(cpaV / cpaC), se = Math.sqrt(1 / (countC || 1) + 1 / (countV || 1)); lift = (cpaV / cpaC - 1) * 100; liftLo = (Math.exp(logR - zc * se) - 1) * 100; liftHi = (Math.exp(logR + zc * se) - 1) * 100; }
  const sig = p < alpha, improvement = cpaV != null && cpaC != null && cpaV < cpaC; // lower CPA = better
  return { cost: true, p1: cpaC, p2: cpaV, diff: (cpaV || 0) - (cpaC || 0), lift, liftLo, liftHi, p, power: null, nReq: null, sig, improvement, win: sig && improvement, worse: sig && !improvement, minNum: Math.min(countC, countV) };
}

function srm(arms, base) {
  const total = arms.reduce((s, a) => s + (Number(a[base]) || 0), 0); if (!total) return null;
  const exp = total / arms.length; let chi = 0; arms.forEach((a) => { chi += Math.pow((Number(a[base]) || 0) - exp, 2) / exp; });
  const df = arms.length - 1, crit = CHI_001[df] || (df + 3 * Math.sqrt(2 * df));
  return { chi, df, flagged: chi > crit };
}

export function analyze(input = {}, cfg = {}) {
  const X = { ...(cfg || {}), ...(input || {}) };
  const conf = [90, 95, 99].includes(Number(X.confidence)) ? Number(X.confidence) : 95;
  const alpha0 = (100 - conf) / 100, oneSided = X.tail === "one";
  const continuous = X.testType === "revenue";
  const preset = PRESETS[X.testType] || PRESETS.generic;

  // arms
  let arms = Array.isArray(X.arms) && X.arms.length ? X.arms.slice(0, 6) : null;
  if (!arms) { const pp = (s) => (String(s || "").split(/[\/,]/).map((x) => Number(String(x).replace(/[^\d.]/g, "")) || 0)); const c = pp(X.control), v = pp(X.variant); arms = [{ name: "Control", visitors: c[0], conversions: c[1] }, { name: "Variant", visitors: v[0], conversions: v[1] }]; }
  arms = arms.map((a, i) => ({ ...a, name: a.name || (i === 0 ? "Control" : "Variant " + i) }));
  const ctrl = arms[0], variants = arms.slice(1);
  if (!variants.length) return { output: `# 🧪 Experiment Analyzer\n\nEnter a control and at least one variant.`, summary: "Experiment — insufficient input", mode: "live" };

  const nVar = variants.length;
  const alpha = nVar > 1 ? alpha0 / nVar : alpha0;

  // ── per-variant, per-metric results ──
  const perVariant = variants.map((v) => {
    if (continuous) { const r = welchTest({ mean: Number(ctrl.mean) || 0, sd: Number(ctrl.sd) || 0, n: Number(ctrl.n) || 0 }, { mean: Number(v.mean) || 0, sd: Number(v.sd) || 0, n: Number(v.n) || 0 }, alpha, oneSided); return { v, metrics: { value: r }, prim: r }; }
    const metrics = {};
    for (const m of preset.metrics) {
      const r = m.type === "cost"
        ? costTest(Number(ctrl[m.count]) || 0, Number(ctrl[m.exposure]) || 0, Number(v[m.count]) || 0, Number(v[m.exposure]) || 0, alpha, oneSided)
        : rateTest(Number(ctrl[m.num]) || 0, Number(ctrl[m.den]) || 0, Number(v[m.num]) || 0, Number(v[m.den]) || 0, alpha, oneSided, m.dir);
      if (r) metrics[m.key] = r;
    }
    // primary = first primary metric that actually computed (so CPA wins when spend given, else conv/impression)
    const primKey = (preset.metrics.find((m) => m.primary && metrics[m.key]) || preset.metrics.filter((m) => m.primary).slice(-1)[0] || preset.metrics.slice(-1)[0]).key;
    return { v, metrics, prim: metrics[primKey], primKey };
  });

  const L = [`# 🧪 Experiment Analyzer — ${continuous ? "Revenue / continuous" : preset.label}`, `_${conf}% confidence · ${oneSided ? "one" : "two"}-sided${nVar > 1 ? ` · Bonferroni across ${nVar} variants (α=${alpha.toFixed(4)})` : ""} · read-only, exact stats_`, ""];

  // ── reconciled verdict per variant ──
  L.push(`## Verdict`);
  const daily = Number(X.dailyTraffic) || 0;
  const decide = (pv) => {
    const prim = pv.prim, name = pv.v.name;
    const primLabel = continuous ? "the metric" : (preset.metrics.find((m) => m.key === pv.primKey) || {}).label;
    if (!prim) return `- **${name}:** ⚠️ not enough data to judge the primary metric.`;
    if (prim.win) {
      const caveats = continuous ? [] : preset.metrics.filter((m) => !m.primary && pv.metrics[m.key] && pv.metrics[m.key].worse).map((m) => m.label + " got worse");
      return `- **${name}:** ✅ **Ship** — ${primLabel} ${pctS(prim.lift)} (p=${prim.p.toFixed(4)}, significant).${caveats.length ? ` ⚠️ but ${caveats.join(", ")} — verify before scaling.` : ""}`;
    }
    if (prim.worse) return `- **${name}:** 🔴 **Keep control** — ${primLabel} is significantly *worse* (${pctS(prim.lift)}).`;
    // primary not significant — look at secondary signals
    const secWins = continuous ? [] : preset.metrics.filter((m) => !m.primary && pv.metrics[m.key] && pv.metrics[m.key].win).map((m) => m.label);
    if (secWins.length) return `- **${name}:** 🔁 **Iterate (mixed signal)** — ${secWins.join(", ")} improved but ${primLabel} didn't move.${preset.mixedNote ? " " + preset.mixedNote : ""}`;
    const underpowered = ((prim.power || 0) < 0.8 && prim.nReq) || (prim.nReq == null && prim.minNum < 50);
    if (underpowered) { const need = prim.nReq ? prim.nReq * arms.length - arms.reduce((s, a) => s + (Number(a[preset.base]) || 0), 0) : 0; const days = daily && need > 0 ? Math.ceil(need / daily) : null; return `- **${name}:** ⏳ **Keep running** — ${primLabel} is directionally ${pctS(prim.lift)} but not significant yet${prim.nReq ? `; underpowered (need ~${intFmt(prim.nReq)}/arm${days ? `, ~${days} more day${days > 1 ? "s" : ""}` : ""})` : " (thin conversion counts — let it accumulate)"}.`; }
    return `- **${name}:** ⏸ **No real difference** — stop; ${primLabel} isn't moving. Test a bolder change.`;
  };
  perVariant.forEach((pv) => L.push(decide(pv)));

  // ── per-variant metric tables ──
  for (const pv of perVariant) {
    L.push(`\n## ${pv.v.name} vs ${ctrl.name}`);
    if (continuous) {
      const r = pv.prim;
      L.push(table(["Metric", ctrl.name, pv.v.name, "Change", `${conf}% CI`, "p", "Call"],
        [["Mean value", (Number(ctrl.mean) || 0).toFixed(2), (Number(pv.v.mean) || 0).toFixed(2), pctS(r.lift), `[${pctS(r.liftLo)}, ${pctS(r.liftHi)}]`, r.p.toFixed(4), r.win ? "✅ better" : r.worse ? "🔴 worse" : "⚠️ n.s."]]));
    } else {
      const fv = (r, m) => m.type === "cost" ? (r.p1 == null ? "—" : (Math.round(r.p1 * 100) / 100).toString()) : ratePct(r.p1);
      const fv2 = (r, m) => m.type === "cost" ? (r.p2 == null ? "—" : (Math.round(r.p2 * 100) / 100).toString()) : ratePct(r.p2);
      const rows = preset.metrics.filter((m) => pv.metrics[m.key] && pv.metrics[m.key] === pv.metrics[m.key]).map((m) => { const r = pv.metrics[m.key]; const isPrim = m.key === pv.primKey; return [m.label + (isPrim ? " ★" : "") + (m.dir === "down" ? " (↓ better)" : ""), fv(r, m), fv2(r, m), pctS(r.lift), r.liftLo != null ? `[${pctS(r.liftLo)}, ${pctS(r.liftHi)}]` : "—", r.p.toFixed(4), r.win ? "✅ better" : r.worse ? "🔴 worse" : "⚠️ n.s."]; });
      L.push(table(["Metric", ctrl.name, pv.v.name, "Change", `${conf}% CI`, "p", "Call"], rows));
      // weak-sample callouts
      const weak = preset.metrics.filter((m) => pv.metrics[m.key]).filter((m) => { const r = pv.metrics[m.key]; return r.minNum < 30 || (r.power != null && r.power < 0.5); });
      if (weak.length) L.push(`_⚠️ Thin data on ${weak.map((m) => m.label).join(", ")} (< 30 events or < 50% power) — treat those calls as tentative._`);
    }
  }

  // ── guardrails ──
  const g = [];
  const s = continuous ? null : srm(arms, preset.base);
  if (s && s.flagged) g.push(`🔴 **Sample-ratio mismatch** (χ²=${s.chi.toFixed(1)}) — the ${preset.base} split is off from an even split; suspect a targeting/logging bug before trusting anything.`);
  if (!daily && !continuous) g.push(`ℹ️ Add **daily traffic** for a days-to-significance estimate.`);
  if (g.length) { L.push(`\n## Guardrails`); g.forEach((x) => L.push(`- ${x}`)); }

  // ── what to do ──
  L.push(`\n## What to do`);
  const anyShip = perVariant.some((pv) => pv.prim && pv.prim.win);
  const anyIterate = perVariant.some((pv) => pv.prim && !pv.prim.win && !pv.prim.worse && !continuous && preset.metrics.some((m) => !m.primary && pv.metrics[m.key] && pv.metrics[m.key].win));
  if (anyShip) L.push(`- ▶ **Continue / ship** the significant winner(s) above; roll out and start the next test.`);
  if (anyIterate) L.push(`- 🔁 **Iterate** the mixed-signal variant(s) — the upper-funnel metric moved but the conversion didn't; fix the gap, don't ship.`);
  if (!anyShip && !anyIterate) L.push(`- ⏸ **Pause / keep running** — no variant is a clear winner yet. ${perVariant.some((pv) => pv.prim && (pv.prim.power || 0) < 0.8) ? "Let it reach the required sample before iterating." : "Well-powered and flat — test a bolder change."}`);

  // ── glossary ──
  if (X.explain !== false) {
    L.push(`\n## What the terms mean`);
    L.push(`- **★ primary metric** — the one that decides the test (the money/goal metric); others add context.`);
    L.push(`- **Change** — relative movement vs control (e.g. +15%). For "↓ better" metrics like bounce, a negative change is good.`);
    L.push(`- **p-value** — chance the gap is luck; below ${alpha0.toFixed(2)} = significant at ${conf}%.`);
    L.push(`- **CI** — the realistic range the true change sits in.`);
    L.push(`- **n.s.** — "not significant": directional but could be noise.`);
  }
  L.push(`\n_Paste the **results of a test you already ran** (from Meta/Google experiments, an ESP, GA4, VWO, or a manual split). Each metric is significance-tested exactly in code; the verdict weighs the primary (goal) metric and reads the secondary metrics for context — no AI, no estimates._`);

  const shipV = perVariant.find((pv) => pv.prim && pv.prim.win);
  const summary = shipV ? `Experiment — ship ${shipV.v.name} (${(preset.metrics.find((m) => m.key === shipV.primKey) || {}).label || "metric"} ${pctS(shipV.prim.lift)})` : anyIterate ? `Experiment — mixed signal, iterate` : `Experiment — no clear winner (${nVar} variant${nVar > 1 ? "s" : ""})`;
  return { output: L.join("\n"), summary, mode: "live" };
}
