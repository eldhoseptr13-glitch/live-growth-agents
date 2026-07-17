---
name: budget-pacing-alert
description: Live budget pacing monitor for Google Ads and Meta — projects end-of-month (or end-of-quarter) spend from the observed run rate, weekday/weekend weighted and capped by daily budgets, and flags overspend (>105% pace) or underspend (<90% pace) before it happens.
---

# Budget Pacing Alert

Projects where spend will land at end of month (or quarter) from **live campaign daily
data** on Google Ads and Meta, and flags pacing problems early. All math is done in code
from real API rows — findings carry `source: "code"`.

## How it projects

- **Period** — month pacing by default; quarter pacing via toggle (EOM/EOQ labels follow).
- **Run-rate basis** — period-to-date by default; can be pinned to last 7/14/30 days or a
  custom window instead.
- **Weekday/weekend weighting** — weekends are weighted at a configurable percentage of a
  weekday (default **60%**), so a Monday check isn't fooled by a quiet weekend.
- **Budget-capped** — the projection never exceeds `daily budget × remaining days`; a
  campaign can't be projected to overspend a cap it physically can't exceed.
- **Paused campaigns excluded** — only ENABLED (Google) / ACTIVE (Meta) campaigns project
  forward.
- **Low-confidence marker** — fewer than 3 active days of data → the projection is labeled
  low-confidence rather than presented as solid.

## Alert thresholds

| Pace vs plan | Status |
|--------------|--------|
| > 105% | 🔴 Pacing over — projected overspend |
| 90–105% | 🟢 On pace (no findings emitted) |
| < 90% | 🟡 Pacing under — projected underspend |

Optional result targets (`targetLeads`, `targetCpa`) add two more checks: projected
results shortfall and CPA-over-target for the period.

## Findings emitted

Structured findings (deterministic ids, `windowType: "projection"` — the window is the
future horizon, the `basisWindow` records the observed run-rate window):

- `overspend-projection-<period>` / `underspend-projection-<period>`
- `daily-cap-limiting-volume` — a capped campaign is the thing throttling delivery
- `results-shortfall-<period>` / `cpa-over-target-<period>` (when targets are set)

## Output

Per channel: period budget vs projected landing, pace %, the run-rate basis used, and the
top campaigns driving the projection. When on pace: no alert noise — the agent stays quiet.

## Scheduling

No hardcoded schedule — frequency comes from the per-agent config in the dashboard
(default manual; can be set to recur). Honesty rule: if a channel isn't configured,
report "Insufficient data" for it, never a fabricated projection.
