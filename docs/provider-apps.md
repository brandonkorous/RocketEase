# Provider app registrations & approval status

Where each social platform's developer app stands, what is already configured, and exactly what to do
when an approval lands. Registration work was done 2026-08-29.

**Nothing here has been exercised against a live account.** Every adapter in `packages/providers` is
written and unit-tested against stubbed HTTP; the credentials below make the OAuth flows *possible*,
not proven. The mock provider (`PROVIDERS_ENABLE_MOCK=1`) remains the only end-to-end path.

Credentials live in `apps/platform/.env` (gitignored) and, for production, in Key Vault. No secret
appears in this file.

## Production status — verified 2026-08-30

Key Vault holds all 16 provider secrets and `platform-env` carries 21 keys. Deploy `fc9eded` rolled
them out; `/api/webhooks/{provider}` now answers:

| Result | Providers | Meaning |
|---|---|---|
| `200` + echoed challenge | meta | verify token matches; **ready for Meta to subscribe** |
| `403` | meta (wrong token), tiktok, linkedin, youtube, google_business | provider is configured; rejecting on token/signature, which is correct |
| `404 unknown provider` | pinterest, x | genuinely not configured — no credentials yet |

A `404` here always means "no credentials in this deployment" (`lib/providers.ts` only registers a
provider when its client id is present), never a routing fault. That distinction cost an afternoon.

## Next action

**Subscribe Meta's webhook fields** in the app dashboard (Products → Webhooks), now that the callback
verifies. Callback `https://app.rocketease.com/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`.
Fields the adapter maps live in `packages/providers/src/meta/` — subscribe those, not the full list.
That is the last configuration step before Meta App Review, which gates Facebook and Instagram entirely.

Then, in rough order: TikTok Sandbox → record the demo video (B2) and write the scope explanation (B3);
Shopify for conversion tracking; Bluesky adapter. Waiting on reviewers: LinkedIn CMA, Pinterest.

## Entities

| Where | Name | Note |
|---|---|---|
| Registered company | **WizeWorks LLC** | California; 3727 East Paradise Ave, Visalia, CA 93292. Source of truth: `apps/web/lib/site.ts`. |
| Meta business portfolio | WizeWork LLC | Spelled **without** the `s`. Business verification already complete under that name. Worth reconciling — Meta's verification is bound to the portfolio name. |
| LinkedIn Company Page | WizeWorks | Page names need not match the legal name. |
| TikTok organization | WizeWorks | org id `7667130898638324754` |
| Google Cloud org | wize.works | project `rocketease` |

## Status by platform

| Platform | App / project | Credentials in `.env` | State |
|---|---|---|---|
| Meta (Facebook, Instagram, Messenger) | RocketEase — App ID `1488577546410666` | ✅ `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Configured, **Unpublished**. All 15 adapter scopes `Ready for testing` (fixed 2026-08-30). Dev-mode connect works for app-role users. Webhooks not yet subscribed. |
| Threads | separate App ID `1558790839312850` | ❌ none | Use case enabled on the Meta app, **no adapter exists**. |
| LinkedIn (member + identity) | RocketEase — client `86fk181ipt6rb5` (app `263549053`) | ✅ `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Company-verified. *Sign In with OpenID Connect* provisioned. |
| LinkedIn (organization) | RocketEase Community Management — client `86jcpr1hj2u7hi` (app `263545132`) | — (throwaway app) | **Development Tier form submitted 2026-08-29.** Awaiting Microsoft Vetting Services. |
| TikTok | RocketEase — app `7679511401195653138`, client key `aw0hmw00gt9blqwz` | ✅ `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | **Draft.** Domain verified. Blocked on a demo video. |
| YouTube / Google Business / GA4 | Google Cloud project `rocketease` (`920126186446`), OAuth client `rocketease-providers` | ✅ `YOUTUBE_*`, `GOOGLE_BUSINESS_*`, `GA4_*` (one client serves all three) | APIs enabled. Consent screen in **Testing**. |
| Pinterest | WizeWorks RocketEase | ❌ none until approved | Connect App form submitted. |
| X | — | ❌ | **Deferred**: `tweet.write` needs a paid tier (~$100/mo). Not worth it before traction. |
| Bluesky | — | ❌ | No developer console exists. Needs an adapter plus a hosted `client_metadata.json`. |
| Shopify (tracking) | — | ❌ `SHOPIFY_CLIENT_ID/SECRET` | Not started. |

## What is configured, per platform

### Meta
- Use cases: Manage everything on your Page · Manage messaging & content on Instagram · Engage with
  customers on Messenger · Measure ad performance data with Marketing API (`ads_read` only, no ad-write)
  · Access the Threads API.
- Redirect URI `https://app.rocketease.com/api/connect/meta/callback`; deauthorize callback
  `…/api/connect/meta/deauthorize`.
- Privacy `rocketease.com/privacy`, Terms `rocketease.com/terms`, data-deletion **instructions** URL
  `rocketease.com/data-deletion`.
- App domain `rocketease.com`, Website platform `https://app.rocketease.com/`, category Business and pages.

### LinkedIn
- Both apps bound to the **WizeWorks** Company Page — LinkedIn states this "can't be undone".
- Redirect URLs on the main app: production **and** `http://localhost:5001/api/connect/linkedin/callback`
  (LinkedIn accepts localhost; Meta does not).
- Access form answers: use cases **Page management + Page analytics** only.

### TikTok
- Products: Login Kit · Content Posting API (**Direct Post** on) · Webhooks.
- Scopes granted: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish`,
  `video.upload`, `video.list`.
- Redirect `https://app.rocketease.com/api/connect/tiktok/callback`; webhook
  `https://app.rocketease.com/api/webhooks/tiktok`.
- `rocketease.com` verified by DNS TXT record.

### Google
- APIs enabled: YouTube Data v3, YouTube Analytics, Analytics Data, Analytics Admin, My Business
  Account Management, My Business Business Information, Business Profile Performance.
- One OAuth client with six redirect URIs — `/api/connect/youtube/callback`,
  `/api/connect/google_business/callback` (note the **underscore**), `/api/tracking/ga4/callback`,
  each on production and `localhost:5001`.
- Sign-in client `rocketease-web` is separate and unchanged.

## Blockers, and who can clear them

| # | Blocker | Owner | Blocks |
|---|---|---|---|
| ~~B1~~ | ~~Provider env vars not in the running container~~ — **resolved 2026-08-30.** Two causes: the six Google secrets were absent from Key Vault, and `envFrom.secretRef` is read once at pod start so a rebuilt Secret was never picked up. Fixed by adding the secrets and by hashing `platform-env` into a `rocketease.works/env-hash` pod-template annotation (`fc9eded`) | — | — |
| B2 | TikTok demo video showing the real integration | us, after B1 + Sandbox | TikTok app review |
| B3 | TikTok "explain each product and scope" write-up (1000 chars) | us | TikTok app review |
| B4 | LinkedIn Community Management review | LinkedIn | all organization posting |
| B5 | Pinterest access review | Pinterest | Pinterest entirely |
| B6 | Google app verification (every scope used is *sensitive*) | Google | anyone outside the test-user list |
| B7 | Google Business Profile API access request — the three APIs ship with **quota 0** even when enabled | Google | Business Profile entirely |
| B8 | DMCA designated agent not registered with the U.S. Copyright Office | us | §512(c) safe harbour (not a provider gate) |

## When an approval lands — resume here

**LinkedIn Community Management approved (B4).** The throwaway app is only a vehicle. Next:
1. On app `263545132`, complete the **Standard Tier** request: form plus a screencast of each use case.
2. Once Standard Tier is granted, request Community Management API **on the main app** (`263549053`),
   entering `86jcpr1hj2u7hi` as the client ID to skip most questions.
3. Then request *Share on LinkedIn* on the main app for `w_member_social`.
4. The throwaway app can be discarded. No `.env` change — the main app's credentials are already set.
5. Verify `packages/providers/src/linkedin/index.ts` `DEFAULT_SCOPES` matches what was actually granted.

**TikTok approved.** Credentials are already in `.env`; nothing to copy. Confirm the granted scope set
against `SCOPES` in `packages/providers/src/tiktok/client.ts` — see the gap below.

**Pinterest approved.** Copy App ID and secret into `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`, then
add the redirect URI `https://app.rocketease.com/api/connect/pinterest/callback`.

**Google verification passed (B6).** Switch the consent screen from Testing to In production
(`console.cloud.google.com/auth/audience?project=rocketease`). Until then only listed test users can
complete *any* Google OAuth flow; `brandon@wize.works` is the only one.

**Meta review.** Set the Data Deletion Request **callback** URL
(`…/api/connect/meta/data-deletion`) in Facebook Login settings, replacing the instructions URL, once
B1 is cleared and the endpoint answers. Then configure webhooks and submit for review.

## Gaps between granted scopes and what the adapters ask for

- **TikTok does not offer** `comment.list`, `comment.list.manage` or `video.insights` at this tier —
  they were not in the scope picker. `packages/providers/src/tiktok/client.ts` declares them under
  `SCOPES.comments`, `SCOPES.reply` and `SCOPES.insights`. **TikTok inbox and insights cannot work**
  until those are granted separately; check `capsFor()` degrades rather than throwing.
- **LinkedIn `r_member_social` is closed** — LinkedIn is not accepting requests. Not in
  `DEFAULT_SCOPES`, so nothing to change; do not add it.
- **Threads** has an app ID but no adapter and no env var.

## Console gotchas worth remembering

- **Adding a Meta use case does NOT add its permissions.** The use case appears configured while most of
  its permissions sit at `Add` rather than `Ready for testing`, and the login dialog then fails with
  *Invalid Scopes* naming exactly those. Open each use case → Permissions and add every scope the adapter
  requests. Adding one often pulls in its dependents (`instagram_basic` brought in content_publish,
  manage_comments and manage_insights); a scope shared with another use case shows a confirmation modal
  first. Verify by loading the authorize URL directly — a good dialog shows "Continue as …", not an error.
- **Synthetic `.click()` does not work in the Meta console** (as in Google Cloud). Compute coordinates from
  `getBoundingClientRect()` and click for real, or the Add silently does nothing.
- **Meta silently discards `http://localhost` redirect URIs.** Enforce HTTPS is locked on; the page
  still says "Changes saved" and the URI is simply gone on reload. Use the mock provider locally, or an
  HTTPS tunnel.
- **Meta discards App domains unless a matching Website platform exists.** Add platform → Website with
  a Site URL first, then the domain chip persists.
- **Meta's Facebook Login settings need the bottom `Save Changes` button.** The per-field "Changes
  saved" toast does not commit the form — reload to confirm.
- **LinkedIn's Community Management API refuses to coexist with any other product**, which is why a
  second app exists. See the resume steps above.
- **TikTok requires the app icon to be exactly 1024×1024.** `images/icon.png` is 1254px; resize first.

## Related

- `packages/providers/README.md` — per-provider scopes, endpoints and tier/quota gates.
- `docs/tracking.md` — GA4 / Shopify / webhook conversion sources.
- `docs/IMPLEMENTATION_PLAN.md` §Milestone 11 — the legal pages these registrations depend on.
