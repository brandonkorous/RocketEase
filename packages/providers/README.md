# @make-it-social/providers

Adapter contract for social networks (`src/types.ts`, `inbox-types.ts`, `insights-types.ts`) plus one adapter per provider. Capabilities are declared **per channel** from what the account actually granted; the UI and workers never assume parity between networks. Anything a provider does not offer is declared `false` with a `reasons` entry rather than implemented speculatively.

```
pnpm --filter @make-it-social/providers test        # vitest (fixtures are hand-written from the official webhook/API references)
pnpm --filter @make-it-social/providers typecheck
```

## Contract → provider mapping

| Contract method | Mock | Meta (Facebook Page / Instagram Business) | LinkedIn (Organization Page) | TikTok |
| --- | --- | --- | --- | --- |
| `exchangeCode` | in-memory code | `/oauth/access_token` then `fb_exchange_token` (60-day user token; Page tokens derived from it do not expire) | `/oauth/v2/accessToken` (60-day access token) | `/v2/oauth/token/` (24 h access token) |
| `refresh` | new token | long-lived exchange again | `grant_type=refresh_token` — requires the app to have **programmatic refresh tokens** enabled (365-day refresh token), otherwise reconnect | `grant_type=refresh_token` (365-day refresh token, rotates) |
| `revoke` | local | `DELETE /me/permissions` | `POST /oauth/v2/revoke` | `POST /v2/oauth/revoke/` |
| `healthCheck` | token + read-only flag | `/me/permissions` + `GET /{channel}?fields=id` with the channel token | `GET /rest/organizations/{id}` (member: `/v2/userinfo`) | `GET /v2/user/info/` |
| `listChannels` | 3 demo profiles | `/me/accounts` (Pages + linked IG business accounts) | `/v2/userinfo` (member) + `organizationAcls?role=ADMINISTRATOR` | `/v2/user/info/` (one account per login) |
| `publish` | store | Page: `/feed`, `/photos`, `/videos`, album via `attached_media`; IG: container → `media_publish` | Posts API `/rest/posts` + Images/Videos upload | Content Posting API `video/init` (video) or `content/init` (photo carousel), polled via `status/fetch` |
| `findPublication` | key lookup | scan last 25 posts/media for the key marker in text | scan `posts?q=author` for the marker | scan `video/list` titles for the marker |
| `fetchInbox` | seeded store | conversations (Messenger + IG DMs), comments + replies on recent posts | comments on recent Page posts (`socialActions/{post}/comments`), Page mentions (`organizationalEntityNotifications`) | comments + replies on recent videos (Business Account API `business/comment/list`, `business/comment/reply/list`) |
| `reply` | store | `POST /{page}/messages` (DM, `metadata` = idempotency key), `POST /{comment}/comments` or `/{comment}/replies` (IG) | `POST socialActions/{post}/comments` with `parentComment` | `POST business/comment/reply/create` |
| `findReply` | key lookup | DMs: scan conversations for our message carrying the key; comments: no client reference (null) | scan our comments on recent posts for the key marker (≤6 h) | scan our replies on recent videos for the marker (≤6 h) |
| `fetchInsights` | deterministic | Page/IG `insights?period=day`; post insights are lifetime totals recorded on the fetch day | `organizationalEntityShareStatistics` + `organizationalEntityFollowerStatistics` with `timeGranularityType:DAY`; `networkSizes` for total followers; per-share statistics are lifetime totals | Display API `user/info` (followers) + `video/query` (per-video totals); daily account series from `business/get` when `video.insights` is granted |
| `verifyWebhook` / `parseWebhook` | trivial | `hub.verify_token` handshake; `X-Hub-Signature-256` HMAC over the raw body | none | `TikTok-Signature: t=…,s=…` HMAC-SHA256 of `${t}.${body}` (5-minute replay window) |
| `inboxItemsFromWebhook` | passthrough | `page.feed` (comments, visitor posts → mention), `page.mention`, `page.messaging`, `instagram.comments`, `instagram.mentions`, `instagram.messaging` | n/a | always `null` (events are publish/authorization only) |

Thread ids are consistent between polling and webhooks: DMs → the customer's PSID/IGSID, comments → the root comment id, mentions → the mentioning post/comment id.

Reconciliation caveat: LinkedIn and TikTok comments and Meta comments carry **no client reference**, so `findReply` can only succeed if the first 8 characters of the idempotency key appear in the reply text. The platform does not add such a marker today; until it does, an ambiguous comment reply on these networks reconciles to `null` and is resent.

## Scopes and app review

### Meta
- Scopes requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_read_user_content`, `pages_manage_engagement`, `pages_messaging`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`, `business_management`, `read_insights`.
- App Review is required for every scope above except when the user is a developer/tester of the app. Messenger/Instagram messaging additionally needs the app's Messenger product enabled and, for Instagram, the account to allow message access in its settings.
- Webhooks: subscribe the app to `page` (`feed`, `mention`, `messages`) and `instagram` (`comments`, `mentions`, `messages`); each Page must be subscribed via `/{page}/subscribed_apps`.
- Not supported: Facebook Page reviews are read-only (`/ratings`) and not yet ingested; Instagram DMs to accounts that have not enabled message access; Page insights are reported in Pacific time.

### LinkedIn
- Scopes: `openid profile email` (identity), `w_member_social` (post as member), `r_organization_social` + `w_organization_social` (read/write Page posts and comments), `rw_organization_admin` + `r_organization_admin` (Page admin, ACLs, analytics).
- Prerequisite: the **Community Management API** product, which is partner-gated (application through the LinkedIn Marketing Developer Platform). Without it `organizationAcls`, `posts`, `socialActions` and the statistics endpoints return 403. Refresh tokens require the "programmatic refresh token" feature on the app.
- Unsupported and declared as such: direct messages (no third-party messaging API), reviews (none on LinkedIn), webhooks (none for Page comments/mentions — polling only), member-profile comments/insights (`r_member_social` is restricted; analytics exist only for organizations), daily per-post statistics (per-share statistics are lifetime totals).
- Rate limits: HTTP 429 with an application-level daily quota; `Retry-After` is honoured when present, otherwise the adapter reports one hour.

### TikTok
- Login Kit scopes requested: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, `video.upload`. `video.publish` requires Content Posting API approval; unaudited apps can only post with `SELF_ONLY` privacy to private accounts.
- Comments and daily insights come from the **Business Account API** (`business-api.tiktok.com/open_api/v1.3/business/*`) which requires a TikTok **Business Account** and the app to be approved for `comment.list`, `comment.list.manage` and `video.insights`. Capabilities are derived from the granted scopes: without them `inbox.comments`, `inbox.reply` and `insights.audience` are `false` with reasons. The Business API is not verified live; token compatibility between the Login Kit token and the Business Account endpoints must be confirmed during TikTok app review.
- Unsupported and declared as such: direct messages and mentions (no API), first comment, clickable links, alt text. Webhooks exist for `post.publish.*` and `authorization.removed` only; comments are polled.
- Rate limits: `rate_limit_exceeded` / HTTP 429; `Retry-After` honoured, default 60 s.

## Error taxonomy

All adapters map responses into `ProviderError.category` (`permission`, `validation`, `rate_limit`, `temporary`, `deleted`, `policy`, `unknown`). `ambiguous: true` is set on timeouts and 5xx responses to mutating calls; the platform reconciles (`findPublication` / `findReply`) before any retry. Only `temporary` and `rate_limit` are retryable.
