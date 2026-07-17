---
name: meta-ads-daily-alert
description: Daily Meta (Facebook/Instagram) ads digest from the live Graph API — yesterday's spend, conversions, CPA, impressions, clicks, CTR, top spender, and a top-campaign table, delivered to the dashboard.
---

# Meta Ads Daily Alert

A daily digest of yesterday's Meta ads performance, pulled **live** from the Graph API
(campaign-level insights, `date_preset: yesterday`) and delivered as a dashboard task
result + alert. Uses the account's own currency.

## What it pulls

- Total spend, impressions, clicks, CTR
- Conversions and cost per conversion
- Active-campaign count and top spender
- Breakdown table of the top 8 campaigns

## Output

```
📘 Meta Ads — yesterday
💰 Spend: XXX · 👀 Impressions: XX,XXX · 👆 Clicks: XXX (CTR X.X%)
🎯 Conversions: XX · 📊 CPA: XX.XX
📣 X active campaigns · Top spender: [Campaign]

| Campaign | Spend | Conv | CPA | CTR |
|----------|-------|------|-----|-----|
...top 8 rows...
```

Dashboard-native delivery (task output + alert), same as the Google digest. No external
messaging channel is wired.

## Failure behavior — read this

The hard lesson behind this agent's design: on 2026-07-07 a Meta "API access blocked"
outage sat invisible inside error rows until a human read a report. The engine now guards
against that failure mode:

- Credentials absent or rejected → the live path fails and the run falls back to clearly
  labeled sample data; the run engine classifies such runs **DEGRADED** (connector
  configured but live data not served) instead of letting them wear a green "completed".
- Graph API error code 190 / OAuthException is surfaced as "Meta token invalid/expired" —
  relay that to the user; do not summarize sample data as if it were live.
- No spend yesterday → "No Meta spend yesterday", never invented numbers.

## Notes

- Read-only: the Meta connector holds only the `ads_read` scope; it cannot change anything.
- This digest emits no structured findings — it formats live rows. The threshold and
  pacing monitors are the ones that write findings to the durable sink.
