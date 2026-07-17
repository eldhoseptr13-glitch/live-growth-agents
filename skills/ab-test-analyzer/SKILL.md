---
name: ab-test-analyzer
description: Exact, deterministic A/B test analysis — no LLM math. Runs a bundled statistics engine (two-proportion z-tests, Poisson-rate cost tests, Welch test for revenue) over ad-creative, email, landing-page, or generic experiment results and reconciles every metric into a ship / iterate / keep-running verdict. Use when feeding test results, checking statistical significance, comparing variants, or deciding whether to ship, pause, or keep a test running.
---

# A/B Test Analyzer (Exact Stats)

Analyze experiment results with a **deterministic code engine** — the same inputs always
produce the same answer. Never compute significance by hand or estimate p-values in prose:
run the bundled engine and write the readout from its output.

## How to run

The engine is `lib/abtest.js` (pure ES module, no dependencies). Call it via the CLI:

```
node scripts/analyze.mjs input.json        # or inline: node scripts/analyze.mjs '{...}'
```

It prints a complete markdown report: verdicts, per-metric tables with confidence
intervals and p-values, guardrails, next actions, and a plain-English glossary.

## Input schema

```json
{
  "testType": "meta_creative | email | landing | generic | revenue",
  "confidence": 95,
  "tail": "two",
  "dailyTraffic": 1200,
  "arms": [
    { "name": "Control", "impressions": 50000, "clicks": 900, "conversions": 42, "spend": 610 },
    { "name": "Variant A", "impressions": 50400, "clicks": 1010, "conversions": 55, "spend": 598 }
  ]
}
```

`confidence`: 90 | 95 | 99 (default 95). `tail`: "one" | "two" (default two-sided).
`dailyTraffic` is optional — it enables the days-to-significance estimate. The first arm
is the control; up to 6 arms are supported.

Per-arm fields by channel preset:

| testType | Arm fields | Metrics tested (★ = primary) |
|----------|-----------|------------------------------|
| `meta_creative` (Meta/Google ad creative) | impressions, clicks, conversions, spend (optional) | CTR, conv-rate per click, CPC, **CPA ★**, **conversions/impression ★** |
| `email` | delivered, opens, clicks, conversions | open rate, click rate, **conversion rate ★** |
| `landing` | visitors, conversions, bounces | **conversion rate ★**, bounce rate (lower = better) |
| `generic` (VWO etc.) | visitors, conversions | **conversion rate ★** |
| `revenue` (continuous) | mean, sd, n | **mean value ★** (Welch test) |

## What the engine does (so you can explain it, not redo it)

- **Rate metrics** — two-proportion z-test, pooled SE under the null, unpooled SE for the
  confidence interval. Direction-aware: for "lower is better" metrics (bounce, CPA), a
  significant *decrease* counts as the win.
- **Cost metrics (CPA/CPC)** — cost is a ratio, not a proportion, so it tests
  conversions-per-dollar with the two-Poisson-rate (conditional binomial) test and derives
  the CPA lift CI on the log scale (delta method).
- **Revenue / continuous** — Welch unequal-variance test on mean, sd, n.
- **Multiple variants** — up to 6 arms with Bonferroni correction (α / number of variants).
- **Power & sample size** — achieved power per metric, required n per arm, and — with
  `dailyTraffic` — an estimate of how many more days the test needs.
- **Guardrails** — sample-ratio-mismatch χ² check on the split (flags targeting/logging
  bugs), thin-data callouts (< 30 events or < 50% power → "treat as tentative").

## Verdict logic (reconciled across metrics)

Per variant, the engine weighs the **primary (money) metric** and reads secondaries for context:

- ✅ **Ship** — primary metric significantly better (warns if a secondary got worse).
- 🔴 **Keep control** — primary metric significantly worse.
- 🔁 **Iterate (mixed signal)** — a secondary (e.g. CTR) won but the primary didn't move;
  includes a channel-specific diagnosis (e.g. "extra clicks aren't converting — fix the
  offer/landing, don't scale the creative").
- ⏳ **Keep running** — directional but underpowered; states the required sample and days remaining.
- ⏸ **No real difference** — well-powered and flat; recommend a bolder test.

## Your job as the agent

1. **Collect inputs** — identify the channel preset, get per-arm counts (and spend if
   available). Results can come from Meta/Google experiments, an ESP, GA4, VWO, or a manual split.
2. **Run the engine** — never substitute your own arithmetic for it.
3. **Present the report** — you may add business context (what the variant changed, what to
   test next), but every number, p-value, and verdict must come from the engine's output.
4. **Honesty rules** — if the SRM guardrail fires, lead with it: the split is broken and no
   result can be trusted. If data is thin, say so. Never invent segment breakdowns you
   weren't given.
