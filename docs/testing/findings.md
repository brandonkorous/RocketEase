# Round 1 findings

Started 2026-08-30. One row per finding. IDs are sequential and never reused.

## Summary

| Severity | Open | Closed |
|---|---|---|
| **P0** | 0 | **1** |
| P1 | 6 | 0 |
| P2 | 4 | 0 |
| P3 | 1 | 0 |
| UX | 2 | 1 |

### Surface scores (1–10, below 9 = fix now)

| Surface | Score | Stage | Note |
|---|---|---|---|
| Production stability | **2** → **9** | 1 | F-013 ✅ **fixed + verified live** (`19a987b`) |
| Health checking | **3** | 1 | F-014 - green while pages 500 |
| Analytics data pipeline (Meta) | **3** | 1 | F-006 - insights ingest fails on every run |
| Connection health accuracy | **3** | 1 | F-009 - "All systems go" while degraded |
| Composer media flow | **4** | 2 | F-003 - user-raised; ~9 clicks, no inline upload |
| Analytics failure disclosure | **4** | 2 | F-007 - raw API string in a `title` tooltip |
| Draft identity | **5** → **9** | 2 | F-005 ✅ **fixed** (`4da12cc`) |
| Content Library navigation | **6** | 2 | F-004 - "Drafts" jumps to Calendar |
| Analytics honesty consistency | **6** | 2 | F-008 - Channel mix shows 0 for Unavailable |
| Approvals / Inbox empty states | **6** | 3 | F-012 |
| List/detail layout | **7** | 2 | F-011 - tab strips clipped |
| Public marketing site | **9** | - | All links 200, legal name correct, honest pricing |
| Billing settings | **9** | - | Honest unconfigured state, clear credit model |
| Campaigns | **9** | - | Clear empty state and attribution footnote |
| Tenant isolation | **9** | - | Non-member workspace redirects, no existence leak |
| **Publish loop (Facebook, text)** | **10** | - | 3 rapid clicks, 1 attempt, 1 post (F-019) |
| Publish receipts / post detail | **9** | - | States the no-duplicate guarantee plainly |
| Deploy-time resilience | **4** | 2 | F-018 - rolling deploy crashes the page, drops the action |
| **Brand hub** | **10** | - | Empty cards name what each gap costs; verified with a real kit (F-017) |

**Suites run:** 01 partial (public site, tenancy), 02 partial (accounts, library, composer),
03 partial (inbox, approvals surfaces), 04 partial (analytics, campaigns), 05 partial (brand, AI),
06 partial (billing, settings shell).

**Not yet run:** signup/auth/2FA/onboarding from scratch, a real publish to Facebook, inbox ingestion
with real messages, approvals end-to-end, reports and share links, API keys, audit log, agency,
keyboard/a11y, mobile (interrupted by F-013).

---

## Findings

### F-001 · P2 · Marketing pricing can never render real prices

**Where** https://rocketease.com/pricing
**Found by** code inspection, pre-round

`apps/web/lib/pricing.ts` reads `NEXT_PUBLIC_PRICE_MONTHLY` / `NEXT_PUBLIC_PRICE_YEARLY`, but
`apps/web/Dockerfile` declares **no `NEXT_PUBLIC_*` build ARGs at all**. `NEXT_PUBLIC_*` is inlined at
build time, so no ConfigMap, Key Vault entry or GitHub variable can reach this build. The page falls
back to the placeholder in `components/marketing/price-cards.tsx`.

`docs/IMPLEMENTATION_PLAN.md` M11 lists "set the price build args" as outstanding, but the ARGs must be
added to the Dockerfile *and* the CI build-args before that is possible.

**Fix** Add `ARG`/`ENV NEXT_PUBLIC_PRICE_MONTHLY` and `_YEARLY` to `apps/web/Dockerfile`, and pass both
in the `web` image build step of `.github/workflows/ci.yml`, as `apps/platform` already does.

**Status** open · needs live confirmation of what the page actually renders (suite 01 A-03)

---

### F-002 · P1 · Malware scanning is disabled in production and reports assets "clean"

**Where** `apps/platform/worker/handlers/asset/scan.ts`
**Found by** code inspection, pre-round

`CLAMAV_URL` is in the CI **optional** secret list and is not set in production. When it is unset,
`scanBuffer` returns `{ status: "clean", note: "scanner not configured (dev)" }`.

So every asset uploaded to production is recorded as clean **without being scanned**, and the publish
gate that is meant to block unscanned media passes everything. The note calls the environment "dev".

This is not a functional break — it is the security control being absent while the system reports it
as satisfied, which is the failure mode the product's own "honest" positioning is against.

**Fix options** deploy a ClamAV sidecar and set `CLAMAV_URL`; or make the unset case record
`skipped` rather than `clean` and have the publish gate treat production `skipped` as a hard block.
The second is the safer default — an unset scanner should fail closed.

**Status** open · confirm in suite 02 G-10 what the UI tells the user about scan state

---

### F-003 · UX · Adding media to a post costs ~9 clicks and abandons the composer

**Where** Composer → Media → "Add media" · `components/composer/media-picker.tsx`
**Found by** live test, 2026-08-30 · **user-raised (UX-Q1)**

The picker has **no upload affordance of any kind**. Verified in the live DOM:
`input[type=file]` count is **0**, there is no drop handler, and the only escape is an anchor,
"Upload in Content Library ↗", pointing at `/content` **in the same tab**.

Measured round trip, from "I want to add a photo" back to "the photo is on my post":

1. Add media → 2. Upload in Content Library (composer abandoned, no warning) → 3. Upload →
4. **wait for the worker** (renditions + scan; the tile is unselectable until then) →
5. find the way back — there is no return link — via Drafts → 6. **identify your draft among N rows all
titled "Untitled post"** → 7. open it, which lands on post *detail*, not the composer →
8. click Edit → 9. Add media → select → Use 1 item.

Roughly **nine clicks and a recognition task**, against **two** if the picker took a drop.

Three separate defects compound here, each fixable on its own:

- **(a) No inline upload.** The picker should accept drag-drop, a file button, and paste. It already
  has the asset list and the selection model; only the upload leg is missing.
- **(b) The `↗` is a lie.** The glyph and "in Content Library" both signal "opens elsewhere", but the
  anchor has no `target="_blank"` — it is a same-tab navigation that silently leaves the composer.
  Minimum fix, if (a) is deferred: open it in a new tab so the draft is never left.
- **(c) There is no way back.** Nothing on Content Library links to the draft you came from.

Autosave *does* hold — the body text survived the detour intact (verified). So this is friction and
disorientation, not data loss.

**Score** Composer media flow: **4/10** · Stage 2
**Recommendation** Do (a). It is the single highest-value UX fix found so far, it needs no new
backend, and it removes the detour rather than signposting it.

**Status** open

---

### F-004 · P2 · "Drafts" in the Content Library silently teleports you to the Calendar

**Where** Content Library → the `Drafts` tab
**Found by** live test, 2026-08-30

The Content Library header renders a tab strip — `All Assets · Images · Videos · Drafts · Templates ·
Copy` — that reads as in-page tabs over one collection. Clicking **Drafts** navigates to
`/calendar?view=list&status=draft`: a different top-level section, with the left-nav selection jumping
from Content to Calendar and the page title changing to "Calendar".

Nothing signals the jump beforehand, and there is no way back to Content except the nav.

Either make it an in-page tab that lists drafts inside Content, or style it as the cross-section link
it actually is. Compounds F-003, because this is the path back to your draft.

**Score** Content Library navigation: **6/10** · Stage 2
**Status** open

---

### F-005 · UX · Every draft is called "Untitled post"

**Where** Calendar list, Unscheduled drafts panel, post detail, "Save as a template"
**Found by** live test, 2026-08-30

The composer has no title field, so every draft is literally "Untitled post". With three drafts the
list is three identical rows separated only by a truncated body preview; the post detail page is
headed "Untitled post"; and "Save as a template" pre-fills the template name with "Untitled post".

Finding your way back to a specific draft (F-003 step 6) is a recognition task the product makes
harder than it needs to. An internal title field, or an auto-title derived from the first line of the
body, fixes it.

**Score** Draft identity: **5/10** before, **9/10** after · Stage 2

**Status** ✅ **FIXED** — commit `4da12cc`. Independently re-reported by the user during round 1,
which is why it moved from Stage 3 to Stage 2.

A draft is now named after its own first line, in `lib/content-title.ts` (`deriveTitle`), applied both
at creation and on every autosave. The name stays in sync as the text changes but never overwrites one
a person or the public API set explicitly: `isAutoTitle()` treats a title as ours only while it still
equals what we would derive from the text we last saw. That also stops an auto-name freezing on the
first word typed.

Existing drafts heal on their next save. Already-published posts keep the old title, because published
posts cannot be edited — the one live post from F-019 is still called "Untitled post".

9 unit tests added; full platform suite 718 passing, typecheck clean.

---

### F-006 · P1 · Facebook insights ingestion is failing outright — analytics can never populate

**Where** Analytics · `packages/providers/src/meta/insights.ts` `channelSeries()`
**Found by** live test, 2026-08-30

Analytics shows "No insights ingested yet" for every metric. That is **not** the 15-minute tick being
slow — ingestion is erroring on every run. The live proof is hidden in a `title` tooltip on the
"1 source degraded" span:

> `Jotacular: validation: (#100) The value must be a valid insights metric`

`channelSeries()` requests all seven Page metrics in **one** comma-separated call:

```
page_impressions, page_impressions_unique, page_post_engagements,
page_video_views, page_fans, page_fan_adds, page_consumptions_by_consumption_type
```

Meta's `/{page}/insights` rejects the **entire request** with `#100` if *any single* name in that list
is not a valid metric for the object. Several in this list are on Meta's deprecated-metrics path —
`page_video_views` and `page_consumptions_by_consumption_type` are the usual culprits, and the
`page_impressions_unique` family is what the M8.3 reach-to-"viewers" retirement was about.

So one dead metric name takes down all seven, and the workspace gets no organic analytics at all.

Note the asymmetry: `postFacts()` wraps its call in `.catch(() => ({ data: [] }))`, but
`channelSeries()` has no catch — so the channel leg throws rather than degrading.

**Fix**
1. Confirm against Graph v21+ which of the seven are still valid for a Page, and drop or replace the rest.
2. Stop batching all-or-nothing: request in validated groups, or fall back to per-metric calls on a
   `#100`, so one retired name can never zero out the other six.
3. Record which metric was rejected, per channel, rather than one opaque connection-level string.

**Score** Analytics data pipeline (Meta): **3/10** · **Stage 1**
**Status** open

---

### F-007 · P1 · The degraded-source warning is a raw API string in a `title` tooltip

**Where** Analytics header, "1 source degraded"
**Found by** live test, 2026-08-30

The only disclosure of F-006 is a native `title` on a bare `<span class="text-warning">`:
not focusable, `cursor: auto`, no `role`, no `aria-label`, no click target, no link to the affected
channel. Keyboard and screen-reader users cannot reach it at all, and mouse users get raw provider
jargon — `validation: (#100) The value must be a valid insights metric` — with no plain-language
meaning and no next action.

Worse, the page's own primary banner contradicts it:

> "Insights haven't been ingested for this period yet. The worker pulls them every 15 minutes — or
> press Refresh."

That tells the user to wait or retry. Waiting will never work, and Refresh cannot fix it. For a
product whose stated position is that failures are never hidden, the loud message is the wrong one and
the true one is invisible.

**Fix** Promote a degraded source into a real, focusable disclosure that names the channel, says what
broke in plain language, and links to Connected accounts. Suppress or reword the "not yet" banner when
the last ingest actually errored.

**Score** Analytics failure disclosure: **4/10** · **Stage 2**
**Status** open

---

### F-008 · P1 · "Channel mix" renders 0 for engagement that is Unavailable everywhere else

**Where** Analytics → Channel mix (by engagement)
**Found by** live test, 2026-08-30

The scorecard states **Engagement — · Unavailable · No insights ingested yet.** Directly below, the
Channel mix donut renders a large **"0"** with the label **Total**.

Same metric, same period, two different claims: unknown in one panel, zero in the other. Per the
product's own rule — missing is never zero — the donut is wrong. "No engagement recorded yet" beside
it does not fix the numeral, which is the thing the eye lands on.

The Conversion funnel panel gets this right (grey bars, `—`, and a reason), so the pattern already
exists in the codebase; Channel mix just isn't using it.

**Score** Analytics honesty consistency: **6/10** · **Stage 2**
**Status** open

---

### F-009 · P1 · Connected accounts calls a channel "Healthy · All systems go" while it is failing

**Where** Connected accounts vs Analytics
**Found by** live test, 2026-08-30

Two screens, same channel, same moment, opposite claims:

| Screen | Says |
|---|---|
| Connected accounts | Facebook Page "Jotacular" — **Healthy · All systems go**. Summary: Healthy 1, **Warnings 0, Errors 0** |
| Analytics | **1 source degraded** — `Jotacular: validation: (#100) The value must be a valid insights metric` |

Connection health is evidently derived from token/permission state alone, so a provider surface that
is failing every run (F-006) never reaches it. "All systems go" is the strongest possible reassurance
and it is false — and Connected accounts is exactly where a user goes to check whether something is
wrong.

**Fix** Fold per-surface ingestion state (insights, inbox, ads) into the channel health rollup, so a
persistently failing surface downgrades the channel to a warning naming the surface. "Full access"
(permissions) and "All systems go" (things actually working) are different claims and should not share
one indicator.

**Score** Connection health accuracy: **3/10** · **Stage 1**
**Status** open

---

### F-010 · note · Pinterest and X are correctly absent from the connect menu

Not a defect — recorded so it is not re-investigated. The connect menu offers Meta, LinkedIn, TikTok,
YouTube, Google Business Profile and a conversion source. Pinterest and X adapters exist in
`packages/providers` but are gated by `lib/flags.ts` provider-flags-by-configuration and no
credentials are set, so they are hidden rather than offered-and-broken. That is the intended design.

---

### F-011 · P2 · Filter tab strips render a horizontal scrollbar in the list/detail layouts

**Where** Inbox and Approvals (shared two-pane pattern)
**Found by** live test, 2026-08-30 · measured at a 2558px viewport

Both screens show a scrollbar under their filter tabs. Two different causes behind one symptom:

| Screen | Strip client / scroll width | Overflow | Effect |
|---|---|---|---|
| **Approvals** | 589 / 590 | **1px** | Spurious scrollbar under tabs that visually fit |
| **Inbox** | 320 / 344 | **24px** | The **Reviews** tab is genuinely clipped and unreachable without scrolling |

Approvals is a box-model rounding issue in `flex gap-5 overflow-x-auto border-b px-4` — one pixel of
padding/gap over its column, which is enough to paint a scrollbar across a primary filter row.

Inbox is a real sizing problem: six filters (All, Unread, Mentions, DMs, Comments, Reviews) in a 320px
column. Reviews is a shipped feature (M8.10) and it is the one hidden.

Not the content cap: the app deliberately caps content near 1440px per `design.md`, and the grid is
`xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]` — 591px + 769px. That part is working as designed.

**Fix** Give the strip a wider minimum or let the tabs wrap; and resolve the 1px overflow so a
scrollbar never appears on a row that fits.

**Score** List/detail layout: **7/10** · Stage 2
**Status** open

---

### F-012 · UX · Empty-state quality is excellent in Brand and thin everywhere else

**Where** Brand vs Approvals / Inbox
**Found by** live test, 2026-08-30

Brand sets a bar the rest of the product does not meet. Each empty card names **what the gap costs**:

- Identity — "Drafts start from the brief alone, so posts read like they could be about any business."
- Colour palette — "Generated images ignore your colours, and anyone making creative elsewhere has to guess them."
- Rules — "Nothing stops a draft making a claim this brand is not allowed to make."

Analytics is nearly as good ("Nothing is shown until the numbers can be defended"). Against that:

- Approvals — "Nothing waiting for review." Nothing about what approvals are for, that a policy
  decides when they trigger, or where to set one up. A workspace with no policy configured looks
  identical to one whose queue is merely empty.
- Inbox — "No open conversations. Nice work." Cheerful, but a workspace that has never ingested
  anything reads the same as one that is genuinely on top of its queue.

Both are first-run screens for most users, and both are places where the product could teach.

**Score** Brand empty states: **10/10** · Approvals/Inbox empty states: **6/10** · Stage 3
**Status** open

---

### F-013 - **P0** - Production runs out of Postgres connections; Home, Analytics and Reports return raw 500s

**Where** whole platform - `apps/platform/db/index.ts`, `apps/platform/lib/jobs/boss.ts`, `deploy/k8s/base/*`
**Found by** live test, 2026-08-30 - reproduced, then traced to pod logs

**Symptom.** Home rendered a bare *"Application error: a server-side exception has occurred"* page.
It reproduced across reloads for several minutes, then cleared on its own. During the window,
`/home`, `/analytics` and `/reports` returned **500** while `/calendar`, `/create`, `/inbox`,
`/brand`, `/accounts`, `/team` and `/settings/*` returned 200. Two different digests appeared
(`3378810181`, `1094496351`). `GET /api/health` reported `{"ok":true}` throughout.

**Root cause.** Postgres refusing new connections:

```
[cause]: remaining connection slots are reserved for roles with privileges of
         the "pg_use_reserved_connections" role
```

Not a bug in the analytics code - that was the wrong first hypothesis. Failures hit *unrelated*
queries (`conversation` counts, `notification`, `metric_fact`, `external_recipient`,
`tracking_source`), because during the window **any** query on an affected pod failed. Requests are
round-robined across two platform replicas, so which routes appeared broken was just which replica
they landed on - that is also why a refresh "loaded fine".

**The arithmetic.** Every process opens two pools:

| Pool | Size | Source |
|---|---|---|
| Drizzle / postgres.js | **10** | `db/index.ts` - `postgres(url, { max: 10 })` |
| pg-boss | **5** | `lib/jobs/boss.ts` - `new PgBoss({ max: 5 })` |
| | **15 per process** | |

| Deployment | Replicas | Ceiling |
|---|---|---|
| `platform` | 2 | 30 |
| `worker` | 1 | 15 |
| `media-worker` | 1 | 15 |
| `web` | 2 | 0 (mounts no secret, no DB) |
| **Total** | | **60** |

Azure Postgres Flexible Server on the Burstable tier caps `max_connections` at **50**, before its own
reserved superuser and management slots. **60 > 50**, so the deployment cannot fit even at idle.

**Why now.** M12.1 (shipped today) added the dedicated `media-worker` Deployment. Before it, the
ceiling was 2x15 + 15 = **45** and fit under 50. Adding the fourth DB-connected process took it to 60.
The error counts match starvation exactly - the processes that connected first kept their pools, and
the late ones starved:

| Pod | conn-slot errors, last 60m |
|---|---|
| `platform-...-wknfg` | **10** |
| `media-worker-...-khg2g` | **5** |
| `platform-...-xkpp9` | 0 |
| `worker-...-cm5hx` | 0 |

The media worker is starving too, so the M12.1 pipeline is affected, not just page rendering.

**Fix - Stage 1, ship on its own**

1. Make both pool sizes configurable (`DB_POOL_MAX`, `PGBOSS_POOL_MAX`) instead of hardcoded - today
   the only way to change them is a code edit and a rebuild.
2. Size them to fit with headroom, e.g. Drizzle 5 + pg-boss 3 = 8/process, giving 2x8 + 8 + 8 = **32** of 50.
3. Confirm the server's real `max_connections` (a read-only `pg_stat_activity` check was not run -
   creating a diagnostic pod in production was correctly blocked) and record it in `deploy/README.md`
   beside the pool math, so the next added Deployment is checked against it.
4. Longer term: PgBouncer, or Azure Flexible Server's built-in pooling on GP/MO, or a larger SKU.

**Also worth fixing separately**
- A transient connection failure surfaces as an unstyled Next.js error page. It deserves a retry on
  acquisition and a designed error state.
- **`/api/health` returned `ok` the entire time.** See F-014.

**Score** Production stability: **2/10** before, **9/10** after - **Stage 1**

**Status** ✅ **FIXED AND VERIFIED IN PRODUCTION** - commit `19a987b`, deployed 2026-08-30.

Pool sizes are now `DB_POOL_MAX` (default 5) and `PGBOSS_POOL_MAX` (default 3): 8 per process, 32 of
50 across four processes. `deploy/README.md` gained a section carrying the multiplication to redo
before any new DB-connected Deployment or replica increase.

Verified against the live deployment after the roll:

- **48 concurrent requests** across 12 routes - **0 failures**, all 200.
- **0** `remaining connection slots` errors across all four pods since the new revision started
  (previously 10 on one platform replica and 5 on the media worker in an hour).

---

### F-014 - P1 - `/api/health` reports healthy while pages are returning 500

**Where** `GET /api/health`
**Found by** live test, 2026-08-30

Polled five times during and after the F-013 window; every response was
`{"ok":true,"degraded":false,"checks":{"db":{"status":"ok"},...}}` while `/home` was reliably 500ing.

Two reasons it misses: the check runs on whichever replica the request reaches (and one replica was
fine), and a single cheap query can still win a slot when the pool is exhausted for everyone else.

That makes the endpoint unfit for its two jobs - telling an operator the truth, and gating a
Kubernetes probe. A readiness probe on this endpoint would never have removed the failing pod from
service, which is precisely why the outage was visible to a user.

**Fix** Have the check acquire from the *application* pool rather than a privileged side channel, fail
when acquisition is saturated, and report per-replica identity so an operator can see that 1 of 2 is
bad. Then wire it to a readiness probe.

**Score** Health checking: **3/10** - **Stage 1**
**Status** open

---

### F-015 - P2 - AI is entirely unavailable in production

**Where** `/create/generate` and every AI affordance
**Found by** live test, 2026-08-30

> "AI drafting isn't configured. This deployment has no model key set, so nothing can be generated.
> Everything else in Create works as usual - write the post yourself and publish it."

The message is honest, specific and offers the fallback - good copy, and it is why this is P2 and not
P1. But it means M8.8, M9.3 and M10.5 - caption variants, the post and ad generator, repurposing,
inbox reply drafts, and every brand-kit-grounded prompt - are **untestable and unavailable live**.
"AI drafts, never publishes" is one of the five product promises and none of it can be exercised.

`ANTHROPIC_API_KEY` and `AI_MODEL` are in the CI `optional` list and are unset in Key Vault. Note that
`NEXT_PUBLIC_AI_ENABLED` is separate and **build-time** (W5) - setting the key alone may not be enough.

**Status** open - config, not code - needed before AI can be tested at all

---

### F-016 - P3 - Two copy bugs on the Brand overview cards

**Where** Brand overview - Voice card
**Found by** dogfooding the Brand hub with a real kit, 2026-08-30

1. **"Written for People who have already abandoned three note apps."** The card concatenates a
   sentence prefix with the Audience field verbatim, so a user-entered value that starts with a
   capital letter lands mid-sentence. Lowercase the first character of the interpolated value, or
   render the audience as a separate line.
2. **"6 dos - 7 don't - 3 examples - 12 banned words."** The counts are pluralized except this one:
   it should be **"7 don'ts"**.

Both are small, and they sit on the one screen in the product that is otherwise a 10.

**Status** open - Stage 3

---

### F-017 - note - Brand hub verified end to end with a real brand kit

Not a defect. Recorded because it is the strongest evidence in round 1.

The Jotacular kit was built from https://jotacular.com and taken from **0% to 86% complete**. Six
sections saved cleanly, each with a green toast: Identity, Voice, Messaging, Audiences, Rules, Visual
identity, Channel presence.

What held up under real data:

- The completeness meter moved correctly and names what is still missing.
- Overview cards summarise real content rather than showing a generic tick: the Voice card counts
  "6 dos - 7 don'ts - 3 examples - 12 banned words"; Identity shows "Website set - 2 links".
- The **typography card renders its specimen in the actual webfonts** (Nunito and DM Sans), pulled
  live. A genuinely nice touch.
- The colour palette renders real swatches with hex values.
- **Channel presence listed only Facebook** - the one connected channel - instead of a wall of
  networks the workspace does not have.
- The framing text is honest throughout, e.g. Identity: *"an empty field is a field a post will not
  mention"*, and Voice: *"Drafting is turned off for this deployment. Voice is saved and used as soon
  as it is enabled."*

Still empty and needing real files from the client: **Logos** (8 slots) and **Brand assets**.

**Two things to confirm with the owner**, both recorded here so they are not mistaken for facts:

- **Spelling is set to US, but the site is mixed.** jotacular.com uses "Don't organize it" (US) in its
  headline and "in its own colour" (UK) in the body. US was chosen because the entity is a California
  LLC and the headline is the most prominent copy. The site should be made consistent either way.
- **Emoji is set to "One at most, where it earns it."** The site itself uses none at all, so
  "Never use emoji" is the stricter reading of the evidence. Inferred, not stated.

Live offers was deliberately left **empty** - Jotacular has no dated offer, and inventing one would
break the kit's own rule.

---

### F-018 - P1 - A deploy mid-session hard-crashes the page and silently drops the action

**Where** any page during a rolling deploy
**Found by** live test, 2026-08-30 - triggered accidentally by our own deploy landing mid-click

Clicking **Publish now** produced an unstyled *"Application error: a client-side exception has
occurred"* page. The console gives the cause exactly:

```
UnrecognizedActionError: Server Action "4091362518a7a94cb407d7707e15329396e4c35f50"
was not found on the server.
```

This is the standard Next.js rolling-deploy failure: the browser holds the previous build's Server
Action ids, the new pods do not have them, and the action 404s. Confirmed by the timing - the pods
rolled to `platform-5b8cc778d8` seconds before the click, and CI reported success in the same window.

**The good part, and it is worth stating:** the dropped action was *atomic*. The post stayed a clean
**Draft** - no partial publish, no phantom send, no orphaned variant. Nothing had to be reconciled.

**The bad part:** the user sees a raw white error page with no styling, no explanation, and no
indication that the thing they just clicked did not happen. On a Publish button that is a bad moment
to be ambiguous, even though the underlying state was correct.

**Fix** Set a stable `deploymentId` in `next.config` so action ids survive a rebuild, and/or catch
`UnrecognizedActionError` in the error boundary and show a designed "this page updated, reload and try
again" state instead of the default crash screen. A `maxUnavailable: 0` rollout plus the same-version
pinning shortens the window further.

**Score** Deploy-time resilience: **4/10** - Stage 2
**Status** open

---

### F-019 - PASS - The publish loop works end to end on a real Facebook Page, and never duplicates

Not a defect. The single most important result of round 1, recorded in full.

**Test** (suite 02, PUB-01 + PUB-06): compose a text post, select Publish now, and **click the publish
button three times in rapid succession**.

**Result: one post.** Verified on all three surfaces:

| Surface | Evidence |
|---|---|
| Post detail | `Published` - "1 attempt" |
| Publish receipt | Validated (ruleset 2026-08-28.1) → Sent to Facebook (**Attempt 1**, idempotency key `b03b4be8...`) → Confirmed by Facebook (id `1332...`) |
| Versions / Activity | One `v1 - publish`, one `content publish`, one `publish succeeded` |
| **Facebook Page feed** | **Exactly one post**, "Published by RocketEase - 1m" |

The receipt reads well to a non-engineer, states the guarantee in plain language at the top - *"When a
network answers ambiguously we ask what exists before retrying, so a retry never duplicates a post"* -
and shows the network id with a working deep link.

Also checked and **not** a bug: the deep link is built as `facebook.com/{pageId}_{postId}`, which
looks malformed but is a format Facebook resolves, redirecting to the canonical `permalink.php`. It
opens the right post.

**Score** Publish loop (Facebook, text): **10/10**

Still untested from suite 02 §J: image and carousel publish, scheduled firing, forced failure and
retry-reconciliation (PUB-09/10/12), and the Facebook-side deletion divergence (PUB-11).

**Live post left on the Page:** "Filing was never what made a note worth keeping. Finding it again
was." - real Jotacular copy, safe to leave up or delete.

---
