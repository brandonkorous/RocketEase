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
