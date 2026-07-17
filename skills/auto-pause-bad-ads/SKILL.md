---
name: auto-pause-bad-ads
description: Read-only waste detector for Google Ads and Meta — flags ads that should be paused (zero-result spend, CPA over threshold, weak CTR, creative fatigue) and produces a copy-paste pause list. It never mutates the account; the human pauses in Ads Manager.
---

# Auto-Pause Candidates (Read-Only)

Flags money-wasting ads across **Google Ads and Meta** from live API data and hands the
user a prioritized, copy-paste pause list. **This agent is strictly read-only** — the
connectors have no write scopes (`ads_read` on Meta, GAQL reads on Google), so it cannot
pause anything itself. Every flagged number is computed in code from real API rows
(findings carry `source: "code"`), never model-authored.

## Data

- Ad-level stats from both channels (`gads.adStats()` / `meta.adInsights()`), or ad-set
  level aggregation when ad-level detail is toggled off.
- Runs on whichever channels are configured; either one alone is enough.

## Flag rules (per ad)

1. **Zero results** — conversions = 0 → waste = full spend.
2. **CPA over threshold** — CPA above the max → waste = conversions × (CPA − max CPA).
3. **Weak CTR** — CTR below the minimum (default **1.0%**) adds a reason.
4. **Creative fatigue (Meta only)** — frequency ≥ cap (default **3**) AND CTR below the
   account's median CTR.

**Auto-thresholds when the user sets none:** max CPA defaults to **2× the median CPA of
converting ads** in the account; min CTR defaults to 1.0%. Users can override per channel
(`googleMaxCpa`, `googleMinCtr`, `metaMaxCpa`, `metaMinCtr`) or write plain-English
per-segment rules (`pauseRules`).

## Safety guards

- **New-ad hold** — Meta ads younger than `newAdDays` (default **3**) are held out, not flagged.
- **Learning-phase skip** — optional; drops rows with < 500 impressions.
- **Sustained-only** — optional; flags only ads that were bad in BOTH the current and the
  comparison period (kills one-bad-day false positives).
- **Noise floor** — `minWaste` hides trivial amounts.
- **Brand handling** — brand campaigns (auto-detected tokens + account name) can be
  excluded via the `include_brand` toggle.
- **Caps** — findings are deduped and capped at 50; rendered lists cap at the top offenders
  (paste list ≤ 40 rows).

## Output

1. Header stating the read-only contract ("flags & gives a paste list, can't pause").
2. Ranked table of pause candidates: ad, campaign, spend, results, CPA/CTR, reason, waste.
3. **Copy-paste pause list** for Ads Manager.
4. Held-back counts (new ads, learning phase) so nothing disappears silently.

Structured findings: `agentId: "auto-pause-bad-ads"`, `kind: "pause-candidate"`, with
deterministic finding ids so the same ad re-flagged tomorrow keeps the same id.

## Honesty rules

- If a channel isn't configured, say "Insufficient data" for it — never invent rows.
- Never claim the agent paused something; it can't. Recommend, show the paste list, stop.
