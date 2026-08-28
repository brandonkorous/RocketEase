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

### YouTube, Pinterest and X

These three are split out of the table above because their shapes differ sharply from the Meta-style adapters — two have no inbox webhooks at all and one has no inbox at all.

| Contract method | YouTube (channel) | Pinterest (account + board) | X (account) |
| --- | --- | --- | --- |
| `authorizationUrl` | Google consent, `access_type=offline&prompt=consent` (that is what returns a refresh token) | `pinterest.com/oauth/`, comma-separated scopes | `x.com/i/oauth2/authorize` — **PKCE is mandatory**, so `codeChallenge` must be supplied |
| `exchangeCode` | `oauth2.googleapis.com/token` (1 h access token) | `POST /v5/oauth/token`, HTTP Basic client auth (30-day access token) | `POST /2/oauth2/token`, HTTP Basic client auth, `code_verifier` required (2 h access token) |
| `refresh` | `grant_type=refresh_token`; Google refresh tokens do **not** rotate | `grant_type=refresh_token`; 1-year refresh token | `grant_type=refresh_token` — refresh tokens are **single use**; the new pair must be persisted or the connection is dead |
| `revoke` | `POST oauth2.googleapis.com/revoke` (kills the whole grant) | **no endpoint exists**; the adapter is a documented no-op and the user removes the app in Pinterest settings | `POST /2/oauth2/revoke` |
| `healthCheck` | `channels.list?part=id&mine=true` | `GET /v5/user_account` | `GET /2/users/me` |
| `listChannels` | `channels.list?mine=true` (the consent screen picks the channel/brand account) | `GET /v5/user_account` + `GET /v5/boards` → one `pinterest_account` channel and one `pinterest_board` per board | `GET /2/users/me` (one account per login) |
| `publish` | resumable `videos.insert`: `POST /upload/youtube/v3/videos?uploadType=resumable` → PUT the bytes to the `Location` session | `POST /v5/pins` with `image_url`, `multiple_image_urls` (2–5) or `video_id` (register `POST /v5/media`, upload, poll, then attach a cover image) | `POST /2/tweets`; media first through the v1.1 chunked `media/upload.json` (INIT/APPEND/FINALIZE/STATUS) plus `media/metadata/create.json` for alt text |
| scheduling | **native** — `status.publishAt` (forces `privacyStatus:"private"`, which the adapter applies for you) | internal | internal |
| threads / carousels | n/a | carousel = `multiple_image_urls` | thread = N posts, each replying to the previous; the FIRST post is the remote id |
| `findPublication` | scan the uploads playlist (`playlistItems`; channel id `UC…` → `UU…`) for the key marker | scan `GET /v5/boards/{id}/pins` for the key marker | scan `GET /2/users/:id/tweets` for the key marker |
| `publicationStatus` | `videos.list?part=status` → `uploadStatus` maps `uploaded`/`processing` to `processing`, `rejected`/`failed` to `deleted` | `GET /v5/pins/{id}` (404 → deleted) | `GET /2/tweets/{id}` (404 → deleted) |
| `fetchInbox` | `commentThreads.list?allThreadsRelatedToChannelId=…` plus inline replies; cursor = `nextPageToken` | **none** | `GET /2/users/:id/mentions` (cursor = `meta.newest_id`, replayed as `since_id`) plus `GET /2/dm_events` when `dm.read` was granted |
| `reply` | `comments.insert` under the top-level comment | **none** | mention/reply → `POST /2/tweets` with `reply.in_reply_to_tweet_id`; DM → `POST /2/dm_conversations/{id}/messages` |
| `findReply` | structural: our comment, same thread, same text, at/after `sentAfter` | n/a | structural, over `users/:id/tweets` (posts) or `dm_events` (DMs) |
| `fetchInsights` | YouTube Analytics `reports.query`: `dimensions=day` for the channel series, `dimensions=video&filters=video==…` for per-video window totals, plus `channels.list?part=statistics` for the subscriber snapshot | `GET /v5/user_account/analytics` (account channel only) and `GET /v5/pins/{id}/analytics` (board channels) | `GET /2/tweets?ids=…` with `organic_metrics`/`non_public_metrics`, falling back to `public_metrics`; `users/me` for followers |
| `verifyWebhook` / `parseWebhook` | **absent** (see below) | **absent** | **absent** |

Threading matches each network's own model: YouTube threads on the top-level comment id, X on `conversation_id` for posts and `dm_conversation_id` for DMs.

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

### YouTube
- Products: **YouTube Data API v3** (channels, resumable `videos.insert`, `commentThreads`/`comments`) and the **YouTube Analytics API** (`reports.query`). Both are enabled per project in the Google Cloud console.
- Scopes: `youtube.readonly` (channel list), `youtube.upload` (publish), `youtube.force-ssl` (read AND write comments — plain `youtube` is not enough), `yt-analytics.readonly` (analytics). Capabilities follow what was actually granted: without `force-ssl` the inbox is off with a reason, without `yt-analytics.readonly` insights are off, without `youtube.upload` `formats` is empty.
- Prerequisites: Google requires an **OAuth app verification/audit** for these sensitive scopes before non-test users can connect. Until it passes, only accounts added as test users may authorize. Unverified *channels* are separately capped at **15-minute uploads** — a limit no API reports, so it surfaces as a provider error rather than pre-flight validation.
- Quota: the default project quota is 10,000 units/day and **`videos.insert` costs ~1,600 units**, i.e. roughly six uploads a day before an increase is granted. `quotaExceeded` maps to `rate_limit` with a one-hour hint (the quota actually resets at midnight Pacific).
- Shorts are ordinary uploads. There is no Shorts field in the API — YouTube classifies a video as a Short from duration (≤ 3 min) and aspect ratio (square or vertical), so the adapter validates exactly that and nothing more.
- Scheduling is the one **native** scheduler in this package: `status.publishAt` on a `private` video.
- Not supported, declared with reasons: direct messages (no API), mentions (no feed), reviews, first comment at publish time, alt text. **No comment webhooks:** YouTube's only push channel is PubSubHubbub on the uploads Atom feed, which announces new uploads and nothing else, so the inbox is polled.
- Available but not imported: `estimatedMinutesWatched` (watch time). The report returns it, but the platform's canonical metric registry has no watch-time metric, so no fact is emitted rather than mapping it onto something it is not. Adding it needs a registry decision.

### Pinterest
- Product: **Pinterest API v5**. Scopes: `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`.
- Prerequisites: a Pinterest developer app moved from trial to **standard access** through Pinterest's app review, and — for anything under `/v5/*/analytics` — the connected account must be a **Pinterest business account**.
- Channel model: one authorization yields a `pinterest_account` channel and one `pinterest_board` channel per board. Pins are always created on a board, so boards carry publishing; Pinterest only reports analytics **account-wide, never per board**, so account series hang off the account channel where they are counted once instead of once per board. The account channel therefore declares `formats: []` with a reason, and board channels declare `insights.audience: false` with a reason.
- Video pins are a three-step flow (`POST /v5/media` → upload to the returned S3 form endpoint → poll `GET /v5/media/{id}`) and **require a cover image** alongside the video; the adapter validates that up front.
- Limits enforced: description 800, title 100, alt text 500 characters; carousel 2–5 images; image 20 MB; video 2 GB / 15 min.
- Rate limits: HTTP 429 with `X-RateLimit-Reset` in **seconds remaining** (not an HTTP date, not `Retry-After`), which the adapter honours.
- **Not supported at all — v5 has no such endpoints:** reading comments on a pin, posting a comment or reply, any messaging, reviews, mentions, and webhooks. `src/pinterest/inbox.ts` exists solely to state this and supply the capability flags/reasons; `fetchInbox`, `reply` and `findReply` are deliberately absent so the contract and the flags agree.
- **No token revocation endpoint exists in v5**, so `revoke()` is a documented no-op: disconnecting deletes our copy of the credential and the user ends the grant under Pinterest → Settings → Apps.
- Available but not imported: `PIN_CLICK`. It is a component of Pinterest's own `ENGAGEMENT` total (which *is* imported) and has no separate canonical metric. Pinterest also returns `-1` for a day where a metric is not yet available; those are dropped, never stored as a value.

### X
- Products: **X API v2** for posts, mentions, DMs and metrics, plus **v1.1 `media/upload`** for the chunked media flow (v2 has no chunked equivalent).
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access` (without it there is no refresh token at all), `media.write` (required for any attachment under OAuth 2.0 user context), and optionally `dm.read` / `dm.write`. DM capability follows the grant: without `dm.read`, `inbox.messages` is `false` with a reason and DMs are never fetched.
- **PKCE is mandatory.** `authorizationUrl` throws unless a `codeChallenge` is passed and `exchangeCode` throws unless the matching `codeVerifier` is passed — this is why `AuthorizeParams` gained `codeChallenge`/`codeChallengeMethod` and `exchangeCode` gained an optional third argument. The platform derives the verifier from the single-use OAuth state with an HMAC (`apps/platform/lib/connections.ts`), so nothing extra has to be persisted.
- **Refresh tokens are single use.** Every refresh returns a new access + refresh pair and invalidates the old refresh token immediately, so the returned credential must be persisted even if the next call fails. If X returns no new refresh token the adapter raises a `permission` error asking for a reconnect rather than silently keeping a spent token.
- Prerequisites and tiers: an X developer app with OAuth 2.0 configured as a **confidential client** and Read + Write (+ Direct Messages) permissions. Endpoint availability and rate limits are governed by the app's **access tier** — the free tier does not include the mentions timeline, so the inbox needs at least the paid tier. Confirm the tier during setup.
- Text limit: **280 characters**, applied to the first post and every part of a thread. X Premium raises the limit but **no v2 endpoint reports an account's own ceiling**, so the adapter declares 280 and lets X reject anything longer rather than guessing.
- Media rule the adapter enforces: one video *or* up to four images, never both.
- Thread caveat: X has no idempotency key. If a continuation post fails after the root published, the error is raised as `ambiguous` with the root already live — the platform must reconcile, never resend from the top.
- **Not supported, declared with reasons:** webhooks (real-time delivery is the **Account Activity API**, a separately gated product — mentions and DMs are polled), reviews, ads import, first comment as a distinct field (a follow-up is just a reply in the thread), and bookmark counts for other people's interactions.
- Available but not imported: `user_profile_clicks` (no canonical metric). Note also that `organic_metrics`/`non_public_metrics` are user-context only, cover the account's **own** posts, and X retains them for **30 days**; older posts fall back to `public_metrics`, which the adapter does automatically. X publishes no daily time series for organic posts, so per-post numbers are lifetime-to-date recorded on the fetch day.

## Error taxonomy

All adapters map responses into `ProviderError.category` (`permission`, `validation`, `rate_limit`, `temporary`, `deleted`, `policy`, `unknown`). `ambiguous: true` is set on timeouts and 5xx responses to mutating calls; the platform reconciles (`findPublication` / `findReply`) before any retry. Only `temporary` and `rate_limit` are retryable.
