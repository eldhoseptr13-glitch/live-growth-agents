---
name: google-ads-daily-alert
description: Daily Google Ads performance digest from live GAQL data — yesterday's spend, clicks, conversions, CPA, active campaign count, and top spender, delivered to the dashboard.
---

# Google Ads Daily Alert

A lightweight daily digest of yesterday's Google Ads performance, pulled **live** from
the Google Ads API and delivered as a dashboard task result + alert.

## What it pulls

One GAQL query over enabled campaigns for `YESTERDAY`:

- Total spend, clicks, conversions (cost comes back in micros and is converted)
- Cost per conversion
- Active-campaign count
- Top spender (campaign with the highest spend yesterday)

## Output

Short markdown digest:

```
☀️ Google Ads — yesterday
💰 Spend: $XXX · 👆 Clicks: XXX · 🎯 Conversions: XX · 📊 CPA: $XX.XX
📣 X active campaigns · Top spender: [Campaign] ($XX)
```

Delivered as the run's output in the dashboard task list; the run engine also raises a
dashboard alert for daily runners. (No external messaging channel is wired — earlier
drafts of this agent described Telegram delivery; the current implementation is
dashboard-native.)

## Failure behavior — read this

- Credentials absent → the live path is not attempted and the run falls back to clearly
  labeled sample data; the run engine marks such runs **DEGRADED** (connectors configured
  but live data not served) so silent credential failures are visible.
- No spend yesterday → say "No spend yesterday", don't invent numbers.

## Notes

- Read-only: only GAQL `searchStream` reads, never mutations.
- This digest emits no structured findings — it is a formatter over live rows. The
  deeper monitors (roas-cpa-threshold-alert, budget-pacing-alert, auto-pause-bad-ads)
  are the ones that write findings to the durable sink.
