---
name: roas-cpa-threshold-alert
description: Live profitability monitor for Google Ads and Meta — tiered CPA/ROAS alerts per campaign with auto-computed targets (trailing 14-day median CPA) when none are set, minimum-spend gates against noise, waste estimates, and a "why" decomposition (CPC vs conversion rate vs CTR).
---

# ROAS & CPA Threshold Alert

Watches every campaign's profitability on **live Google Ads and Meta data** and raises
tiered alerts when campaigns fall below target. All numbers are computed in code from
real API rows — findings carry `source: "code"`.

## Targets

- **Manual per channel:** `googleTargetCpa` / `googleTargetRoas`, `metaTargetCpa` /
  `metaTargetRoas`, plus optional plain-English per-segment rules (`targetRules`).
- **Auto-target fallback:** with no target set, the agent computes the channel's trailing
  **14-day median CPA** and uses warn = 1.5× median, critical = 2× median — so the agent
  is useful on day one with zero configuration.

## Alert tiers

| Tier | CPA rule | ROAS rule |
|------|----------|-----------|
| 🟡 Warning | CPA above target | ROAS below target |
| 🔴 Critical | CPA above 1.5× target | — |
| 🔴 Zero results | conversions = 0 AND spend ≥ gate | — |

The zero-result **gate** is `max(minSpend, warn CPA)` — a campaign must have spent real
money before it can be called out, which kills small-budget noise.

## What each alert includes

- **Lookback** — default last 30 days (7/14/90/custom supported), compared against the
  previous equal-length period (or month/quarter baseline).
- **Waste estimate** — zero-result spend plus conversions × (CPA − warn CPA).
- **Confidence label** — ≥ 30 conversions High, ≥ 10 Medium, else Low; thin data is never
  presented as a confident verdict.
- **"Why" decomposition** — when a comparison baseline exists, attributes a CPA move to
  CPC vs conversion-rate vs CTR changes, so the user knows whether to fix bids, landing
  pages, or creative.

## Findings emitted

Structured findings with deterministic ids (same persisting issue → same id run-over-run):
`zero-result-spend`, `over-target-cpa`, `below-target-roas`, `cpa-trend`.

## Output

Per channel: flagged campaigns ranked by waste, each with tier, spend, results, CPA/ROAS
vs target, confidence, and the why-breakdown. On-target campaigns produce **no alert** —
the agent stays quiet when everything is fine.

## Honesty rules

- Unconfigured channel → "Insufficient data", never invented rows.
- Read-only: recommends pause/fix actions for the user to take; it cannot and does not
  change the account.
