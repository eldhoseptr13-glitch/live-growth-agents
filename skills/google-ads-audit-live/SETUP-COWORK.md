# Setup — Live Google Ads Audit in Claude Cowork (web, no app install)

Everything here is done **in a browser**. Nothing is installed on the laptop. When you finish,
the audit runs entirely inside your Cowork session.

**Time:** ~25–40 minutes of setup. The one thing that can gate a **live production** audit is the
developer token's **access level** (Step 4): a brand-new token starts at **Test** (production
blocked). If Google auto-upgrades it to **Explorer** — which *can* read production accounts and is
plenty for audits — you're live right away. If it stays Test, you apply for **Basic**, and in 2026
that review is running **weeks, not days** (backlog). See Step 4 for how to check and speed it up.

> 🔐 **Never paste secrets into the Cowork chat.** You type them into the `.env` file (Step 6).
> Claude runs the code; you own the credentials.

---

## What you need
- A **Google account with access to the Google Ads account** you want to audit (your company
  email that's already attached to the account is perfect — you'll authorize **as that email**).
- A **Google Ads manager (MCC) account** — free; needed to issue a developer token. If your
  company account isn't under an MCC, create one (Step 4). The MCC can be a different Google
  account than the one with account access; that's fine.
- A **Google Cloud** account — free; for the OAuth client.
- Your Cowork session open in a folder where this skill lives.

You do **not** need an Anthropic API key — Claude in Cowork writes the audit.

---

## Step 1 — Google Cloud project + enable the API · ~5 min
1. Open **https://console.cloud.google.com**.
2. Top bar → project dropdown → **New Project** → name it (e.g. `ads-audit`) → **Create** → select it.
3. **APIs & Services → Library** → search **"Google Ads API"** → open → **Enable**.
- ✔ Done when the Google Ads API page shows "API Enabled".

## Step 2 — OAuth consent screen · ~5 min
Google renamed this to the **"Google Auth Platform"** (tabs: Overview · Branding · Audience ·
Clients · Data Access). Open **APIs & Services → OAuth consent screen** and, if prompted, click
**Get started** to run the short wizard:
1. **App Information** → **App name** = any label you'll recognize (e.g. `Ads Audit`); **User
   support email** = pick your own email from the dropdown.
2. **Audience** → **User type = External**.
3. **Contact Information** → **Developer email** = your email → **Finish / Create**.
4. Then open the **Audience** tab → **Test users → + Add Users** → add the **Google email that has
   Ads access** → **Save**.
5. Leave **Publishing status = "Testing"** (no Google verification needed for test users).
- ✔ Done when that email appears under **Audience → Test users**.

> 💡 Simplest path: log into Google Cloud Console with the **same company email that has Ads
> access**, so the app name owner, support/developer email, and test user are all one address.
> (Only the **Test user** must have Ads access — that's the identity you authorize as in Step 6.)

## Step 3 — OAuth client (client id + secret) · ~3 min
1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID** (or the new
   **Google Auth Platform → Clients → Create client** — same thing).
2. Application type → **Web application**.
3. **Authorized redirect URIs → + Add URI** → paste **exactly**:
   `https://developers.google.com/oauthplayground`
   *(This is what makes the browser-only token minting in Step 6 work — no localhost needed.)*
4. **Create**. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and **Client secret**.
- ✔ Done when you've saved both.

## Step 4 — Developer token (from an MCC) · ~10 min (+ review wait for production access)
The API Center **only exists inside a Google Ads *manager* (MCC) account**, and Google moved it to
the **Admin** menu (it's no longer under Tools).

1. **Need an MCC?** If your company account isn't a manager account, create one (free): open
   **https://ads.google.com/home/tools/manager-accounts/** → **Create a manager account** → name
   it, pick "manage other accounts", country, time zone, and a permanent **currency** → submit.
   (The MCC can be a different Google login than the one with account access — that's fine.)
2. Signed into the MCC, open **Admin → API Center** — or go straight to
   **https://ads.google.com/aw/apicenter**.
3. Complete the short **API access form** (working company website URL + a regularly-monitored
   contact email) and accept the terms. Copy the **Developer token** (a 22-character string).
4. **Check the access level shown next to the token — this decides live access:**
   - **Test** — production accounts are **blocked** (test accounts only). New tokens start here.
   - **Explorer** — **can read production accounts** (~2,880 API ops/day). An audit uses only a
     handful of read calls, so Explorer is **more than enough**. Google *sometimes auto-upgrades*
     a new token to Explorer — if yours shows Explorer, you're ready to audit a live account now.
   - **Basic / Standard** — also production, higher limits; require an application.
5. **If it's still Test:** click **Apply for Basic access** in API Center. In 2026 this review is
   backlogged (**weeks, not the old ~2 days**). To speed it up, Google asks you to complete
   **advertiser verification** on at least one account under this MCC, and to state your use case
   ("read-only account auditing") clearly in the form.
- ✔ Ready for live when the token's level is **Explorer, Basic, or Standard**. (Everything else in
  this setup can be finished while a Basic application is pending — only the live *production* pull
  needs the upgraded level.)

## Step 5 — Identify the account · ~2 min
1. Open the target account in **Google Ads** — the **customer ID** is the 10-digit number at top
   right (e.g. `123-456-7890`). Use **digits only** → `1234567890`.
2. Access — the Google email you'll authorize with (Step 6) must be able to see this account in
   the Ads UI. Options if it can't: the owner adds that email under **Admin → Access and security
   → Users** (read-only is enough), or links the account to your MCC.
- ✔ Done when the authorizing email can open the account in Google Ads.

## Step 6 — Mint the refresh token in the browser (OAuth Playground) · ~4 min
This replaces the localhost OAuth helper from the desktop build — it works with **no install**.
1. Open **https://developers.google.com/oauthplayground**.
2. Click the **gear ⚙ (top right)** → check **"Use your own OAuth credentials"** → paste your
   **Client ID** and **Client secret** from Step 3 → close the panel.
3. In the left **"Input your own scopes"** box, paste:
   `https://www.googleapis.com/auth/adwords` → click **Authorize APIs**.
4. **Sign in as the Google email that has Ads access** (Step 5) → **Allow**.
   *(If it warns the app is unverified, that's expected in Testing — continue as the test user.)*
5. Back in the Playground, click **"Exchange authorization code for tokens"**.
6. Copy the **Refresh token** value (a long string). This is what the skill uses.
- ✔ Done when you have a non-empty refresh token.
- 💡 No refresh token shown? Revoke prior access at **https://myaccount.google.com/permissions**
  for this app, then redo Steps 3–6 (the Playground only returns a refresh token on first consent).

## Step 7 — Fill in `.env` · ~2 min
In the Cowork file tree, copy `.env.example` to `.env` and set:
```
GOOGLE_ADS_DEVELOPER_TOKEN=...              # Step 4
GOOGLE_ADS_CLIENT_ID=...apps.googleusercontent.com   # Step 3
GOOGLE_ADS_CLIENT_SECRET=...               # Step 3
GOOGLE_ADS_REFRESH_TOKEN=...               # Step 6
GOOGLE_ADS_CUSTOMER_ID=1234567890          # Step 5 — digits only, the account to audit
GOOGLE_ADS_LOGIN_CUSTOMER_ID=              # only if you reach the account THROUGH the MCC — put the MCC's 10-digit id
GOOGLE_ADS_API_VERSION=v24                 # bump if a version is sunset (HTTP 404 from the API)
```
- ✔ Done when every value except the two optional ones is filled. Save the file.
- 🔐 `.env` holds live secrets — keep it out of any shared repo / `.gitignore` it.

## Step 8 — Verify: dry-run → live-run · ~3 min
Ask Claude in Cowork to:
1. **Dry run** — `node scripts/gads.mjs --workflow full_audit --range last30 --dry` → shows the
   plan + exact GAQL, **no API calls, no cost**.
2. **Live run** — `node scripts/gads.mjs --workflow full_audit --range last30` → returns real rows.
- ✔ Ready to go live when the live run shows real campaign numbers (not "Not configured" or an error).

---

## Troubleshooting
- **"developer-token is not approved / DEVELOPER_TOKEN_NOT_APPROVED"** → your token is still **Test**
  level, so production accounts are blocked. Check the level in **Admin → API Center**; if it's not
  already **Explorer**, apply for **Basic access** and complete advertiser verification to speed the
  review (Step 4). This is the usual blocker on real accounts.
- **"User doesn't have permission on customer …" / PERMISSION_DENIED** → the authorizing email
  lacks access to that account (Step 5), or you're going through an MCC but didn't set
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID` to the MCC id.
- **"invalid_grant" on refresh** → the refresh token is wrong/revoked — redo Step 6.
- **HTTP 404 from the API** → bump `GOOGLE_ADS_API_VERSION` to a current version.
- **Cowork can't reach googleapis.com** → the sandbox is blocking outbound network; enable network
  access for the session, then re-run.
- **Auditing another account later** → change `GOOGLE_ADS_CUSTOMER_ID` (and
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID` if via the MCC), as long as the authorizing email has access. No
  code changes, or just pass `--account 1234567890` on the command.
