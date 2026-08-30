# RocketEase — live test program

Round-based manual + browser testing of the **deployed** product, not the local stack.
Round 1 is a full-surface sweep: does it work, is it honest, and is it *easy*.

| | |
|---|---|
| Platform | https://app.rocketease.com |
| Marketing site | https://rocketease.com |
| Health | `GET /api/health` — `{ ok, degraded, checks: { db, queue, storage } }` |
| Current round | **Round 1** — started 2026-08-30 |

## The files

| File | What it is |
|---|---|
| `environment.md` | What is deployed, what is configured, and what is deliberately off. **Read before filing anything.** |
| `watch-outs.md` | Repo-specific traps that make a real bug look fine, or a correct behaviour look broken. |
| `ux-rubric.md` | How we judge "ease of use". The name is RocketEase; this is the bar. |
| `suite-01-access.md` | Public site, signup, auth, onboarding, tenancy isolation. |
| `suite-02-publish.md` | Connected accounts, library, composer, calendar, publish, receipts. **The core loop.** |
| `suite-03-collaborate.md` | Approvals, inbox, team, notifications. |
| `suite-04-measure.md` | Analytics, reports, campaigns, paid, tracking. |
| `suite-05-brand-ai.md` | Brand hub, AI generation, media beta gate. |
| `suite-06-admin.md` | Settings, billing, security, API keys, staff, agency. |
| `findings.md` | The running log. Every finding lands here with an ID. |

## Where round 1 got to (written 2026-08-30, for picking this back up cold)

**Everything below is already shipped and live.** Deployed through `0284596`; CI builds and deploys
on push to `main` and takes roughly 15 minutes.

### Facts you need to resume

| | |
|---|---|
| Test workspace | `jotacular` — `/app/b56ab2e2-82c6-4816-9c53-90b4986c742f/...` |
| Org | WizeWorks · signed in as Brandon (owner) |
| Live provider | **Facebook Page "Jotacular"**, page id `61593782138436`. The only one connected. |
| Live test post | "Filing was never what made a note worth keeping. Finding it again was." — safe to delete |
| Brand kit | Built from jotacular.com, **86% complete**. Logos and brand assets still empty (need real files). |
| Cluster | `kubectl` works against namespace `rocketease`. Pod logs are how F-013 was found. |

### Closed, verified live

F-013 (P0 connection exhaustion) · F-003 (composer upload) · F-005 (draft titles) · F-006 (Meta
insights) · F-007 (degraded disclosure) · F-008 (Channel mix zero) · F-009 (channel health) · F-011
(clipped tabs) · F-004 (Drafts link) · F-016 (Brand copy) · F-018 (error boundary) · F-020 (audit log).

### Open, ranked

1. **F-021** — Meta retired 7 Page metric names, so Reach / Impressions / Link clicks / Followers have
   no source on Facebook. Needs the successor names mapped plus an M8.3 definition break. *The biggest
   remaining product gap.*
2. **F-014** — `/api/health` stayed green through the whole P0 outage; unfit to gate a readiness probe.
3. **F-002** — scanning is honest now but **no scanner is deployed**. Needs ClamAV + `CLAMAV_URL`, then
   `REQUIRE_ASSET_SCAN=1`.
4. **F-012** — Approvals and Inbox empty states are thin next to Brand's.
5. **F-001** — marketing price args need a Dockerfile change, not a setting.
6. **F-015** — AI entirely unconfigured in production, so M8.8/M9.3/M10.5 are untestable.

### Not yet tested at all

Signup / auth / 2FA / onboarding from scratch · image and carousel publish · a scheduled post firing ·
forced-failure and retry-reconciliation (PUB-09/10/12) · inbox ingestion with real Facebook comments ·
approvals end to end · report share links · API keys · agency roll-up · keyboard-only and formal a11y.

### Two things that will bite whoever picks this up

- **Another agent is working in this repo** on M12.3 (voice, captions, media). At the time of writing
  they had ~25 uncommitted files including `db/index.ts`, `db/schema/content.ts`, `lib/media/*`,
  `packages/media/*`, and **unpushed migrations `0019`/`0020`**. Never `git add -A`, never stash, and
  do not generate a migration — a new `0021` against their unpushed snapshot chain fails CI's
  migration-drift check. That is why F-002 has no `skipped` enum value.

  To commit only your own hunk of a file they are also editing: build the file from
  `git show HEAD:<path>`, apply your change to that, `git hash-object -w` it, and stage the blob with
  `git update-index --cacheinfo`. `git apply --cached` on a `-U0` patch proved unreliable here.

- **`beforeEach(() => mock.mockReset())` in vitest is a trap.** The arrow returns the mock, vitest
  treats a returned function as a teardown hook and *calls* it after the test, and a mock that rejects
  then surfaces as an unhandled rejection attributed to an unrelated test. Use braces.

## Scoring — every surface gets a 1–10

**User decision, 2026-08-30:** rate everything 1–10, 10 being perfect. **Anything below 9 is fixed
immediately.** Fixes ship in stages rather than as one release.

Score each *surface* (a screen or a flow), not each test. The score is the honest answer to "would I
put my name on this in front of a customer."

| Score | Means |
|---|---|
| **10** | Perfect. Nothing to change. |
| **9** | Ships as is. Any remaining nits are genuinely subjective. |
| **8** | **Fix now.** Works, but something is wrong, confusing, or unpolished enough to notice. |
| **6–7** | Fix now. A real gap in function, honesty, or usability. |
| **4–5** | Fix now, and it needs design or product thought, not just a patch. |
| **1–3** | Broken or absent. |

A surface with any open P0 or P1 cannot score above 5. A surface that violates one of the five
promises below cannot score above 6, however well it works.

Record every score in the suite file next to its section, and roll them up in `findings.md`.

## Staged delivery

Findings are grouped into stages so fixes ship continuously instead of waiting for the round to end:

| Stage | Contents |
|---|---|
| **Stage 1** | P0 + anything blocking further testing. Ships as found, one at a time. |
| **Stage 2** | P1 + every surface scoring 6–8. |
| **Stage 3** | P2/P3 + UX findings that need design thought. |

## Severity

| | Meaning | Examples |
|---|---|---|
| **P0** | Stop the round. Data loss, cross-tenant leak, duplicate or phantom publish, auth bypass. | A post publishes twice on retry. Workspace B's data renders for user A. |
| **P1** | Core flow broken or actively misleading, no workaround. | Publish to a connected Facebook page fails. A metric renders `0` when it means "unknown". |
| **P2** | Works, but wrong or confusing. Workaround exists. | Filter resets on back-navigation. Error toast says "failed" with no reason. |
| **P3** | Polish. Copy, spacing, iconography, a11y nits. | Truncated label, inconsistent date format. |
| **UX** | Not a defect — a usability cost. Rank by how often it is paid. | Media upload requires leaving the composer. |

**P1 by definition, per the product's own positioning:** any number displayed without a definition,
any unavailable metric rendered as zero, any platform limit discovered only *after* pressing publish,
and anything AI publishes without a human pressing send. These are the promises; breaking one is not a nit.

## Running a round

1. Read `environment.md` and `watch-outs.md`. Half of round-1 "bugs" are configuration or async ticks.
2. Work the suites in order. 01 → 02 first; they gate the rest.
3. Log every finding in `findings.md` **as you go**, with the URL, the account, and what you expected.
4. Async surfaces (publish, insights, inbox) need a wait before a verdict — see `watch-outs.md` §Ticks.
5. Close the round by filling in the summary table at the top of `findings.md`.

## Round 1 scope

**In:** everything above, exercised against the live deployment, with Facebook as the one
verified-live provider.

**Out:** M12.2 static ad creative and anything else in the working tree but not deployed
(another agent is mid-change). Load testing. Formal accessibility audit — round 1 records
obvious a11y breaks only. Live provider review for LinkedIn/TikTok/YouTube/Pinterest/X/GBP —
those are code-complete and credential-blocked, so a failure is a *record*, not a regression.
