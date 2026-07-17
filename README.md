# Live Growth Agents

Production-grade **Claude agent skills for paid-media operations** — live-data auditing and
always-on monitoring for Google Ads and Meta. These are the public skills from a larger
agent "Mission Control" dashboard I build and run; each one is written to be dropped into
Claude Code / Cowork as a skill folder.

## Design principles

These skills are built around rules that keep AI marketing agents trustworthy:

- **Live data or silence.** Every number comes from a real API row (Google Ads GAQL,
  Meta Graph API, PageSpeed/CrUX). A check with no data says
  *"Insufficient data for this check"* — never best-practice filler, never invented numbers.
- **Read-only by construction.** Connectors hold read scopes only. Agents flag, rank, and
  hand you a paste list; a human makes the change in Ads Manager.
- **Deterministic where it counts.** Statistics run in code (exact z-tests, Poisson-rate
  cost tests, SRM guardrails) — the same inputs always give the same verdict. The model
  narrates; it doesn't do the math.
- **Loud failure.** Expired credentials don't silently degrade to sample data wearing a
  green checkmark — degraded runs are classified and surfaced.

## The skills

| Skill | What it does |
|-------|--------------|
| [google-ads-audit-live](skills/google-ads-audit-live/) | Full read-only Google Ads account audit from live GAQL data — search terms, budgets/bidding, conversion quality, Quality Score, PMax, landing pages. Ships with its own zero-install setup guide and a `--dry` mode that previews the exact GAQL at $0. |
| [web-vitals-agent](skills/web-vitals-agent/) | Core Web Vitals health reports (lab via Lighthouse/PSI + field via CrUX p75) for a page or a whole site, with a ranked fix plan. |
| [roas-cpa-threshold-alert](skills/roas-cpa-threshold-alert/) | Tiered CPA/ROAS profitability alerts per campaign; auto-computes targets from the trailing 14-day median CPA when none are set; explains *why* CPA moved (CPC vs conv-rate vs CTR). |
| [budget-pacing-alert](skills/budget-pacing-alert/) | Projects end-of-month/quarter spend from the live run rate — weekday/weekend weighted, capped by daily budgets — and flags over/under-pacing before it happens. |
| [auto-pause-bad-ads](skills/auto-pause-bad-ads/) | Read-only waste detector: zero-result spend, CPA blowouts, weak CTR, Meta creative fatigue. Safety guards for new ads, learning phase, and brand campaigns. |
| [ab-test-analyzer](skills/ab-test-analyzer/) | Exact-stats experiment analysis with a bundled, dependency-free JS engine (runnable: `node scripts/analyze.mjs`). Ship / iterate / keep-running verdicts across ad-creative, email, landing-page, and revenue tests. |
| [google-ads-daily-alert](skills/google-ads-daily-alert/) | Daily digest of yesterday's Google Ads performance from live GAQL. |
| [meta-ads-daily-alert](skills/meta-ads-daily-alert/) | Daily Meta ads digest from the live Graph API, with the degraded-run detection born from a real silent-outage incident. |

## Using a skill

Each folder is a standard Claude skill: a `SKILL.md` with frontmatter (name +
description) and the agent's operating instructions, plus any scripts it needs. Drop a
folder into your project's skills directory (e.g. `.claude/skills/`) and Claude picks it
up. `google-ads-audit-live` needs one-time API credentials — its
[SETUP-COWORK.md](skills/google-ads-audit-live/SETUP-COWORK.md) is an all-browser setup
walkthrough; secrets live in a local `.env` (a `.env.example` template is included, and
no real credentials exist anywhere in this repo).

Try the A/B engine right now (no install, no keys):

```bash
cd skills/ab-test-analyzer
node scripts/analyze.mjs '{"testType":"generic","arms":[{"name":"Control","visitors":10000,"conversions":250},{"name":"Variant","visitors":10000,"conversions":300}]}'
```

## About

Built by Athul — growth marketing + AI agent systems. The monitoring skills document
agents that run against live ad accounts inside a larger orchestrator (run engine,
event log, structured findings with deterministic ids, durable NDJSON sink) that isn't
part of this repo.
