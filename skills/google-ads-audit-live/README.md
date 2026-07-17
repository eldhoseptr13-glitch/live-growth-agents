# Google Ads Audit — Live (Cowork skill)

A self-contained Claude **Cowork** skill that runs a **live, read-only** Google Ads audit against
any account the authorizing Google user can access. Built to run entirely in the **web version of
Cowork** — no desktop app, no local server, no Anthropic API key.

## What's in this folder
```
google-ads-audit-live/
├── SKILL.md            # the skill definition + auditor rules (Claude reads this)
├── SETUP-COWORK.md     # one-time, all-browser credential setup (no install)
├── .env.example        # credential template — copy to .env
├── README.md           # this file
└── scripts/
    └── gads.mjs        # zero-dependency read-only GAQL puller (Node 18+)
```

## How to hand this off (share with a friend)
1. Send them **this whole folder** (zip it).
2. In their Cowork session, they place it under the workspace's skills directory (or open the
   folder and let Cowork pick up `SKILL.md`).
3. They follow **SETUP-COWORK.md** once (Google Cloud OAuth client → MCC developer token →
   OAuth Playground refresh token → `.env`).
4. They ask Cowork: *"Run a full Google Ads audit for last 30 days."* Claude runs `gads.mjs`,
   gets the live data, and writes the audit.

## Design notes (why it differs from the desktop build spec)
- **Runtime = Claude.** In Cowork web, the session model writes the audit, so there's no Anthropic
  key and no Express app calling the API. `gads.mjs` only pulls data; `SKILL.md` tells Claude how
  to turn it into the audit.
- **Browser-only OAuth.** The cloud sandbox has no reachable `localhost`, so the refresh token is
  minted in Google's **OAuth Playground** (redirect `https://developers.google.com/oauthplayground`)
  instead of the local `connect-google-ads.js` helper.
- **Read-only, grounded.** Only `googleAds:searchStream` is called. Empty/errored queries become
  "Insufficient data for this check." — never invented numbers.

## The one thing that can gate "going live"
It's the developer token's **access level** (from the MCC's **Admin → API Center** — Google moved
it out of Tools). A brand-new token is **Test** level (production blocked). Google *sometimes
auto-upgrades* it to **Explorer**, which **can** read production accounts (~2,880 ops/day — an
audit needs only a handful), so you may be live immediately. If it stays Test, apply for **Basic**
— in 2026 that review runs **weeks, not days** (backlog); completing **advertiser verification** on
an account under the MCC speeds it up. See SETUP-COWORK.md Step 4.

## Quick commands
```
node scripts/gads.mjs --list                                     # workflows + modules
node scripts/gads.mjs --workflow full_audit --range last30 --dry # preview plan + GAQL, $0
node scripts/gads.mjs --workflow full_audit --range last30       # live
```
