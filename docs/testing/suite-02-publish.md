# Suite 02 — The core loop: connect → compose → schedule → publish

The heart of round 1. Facebook is the one live provider (W7). Publishing here is **public** —
read `environment.md` §Publishing to Facebook is public before starting.

## F. Connected accounts

| ID | Test | Expected | |
|---|---|---|---|
| F-01 | Connect Facebook via OAuth | Redirect on the app origin, state single-use, returns cleanly | ☐ |
| F-02 | Channel selection page | Pages/IG accounts listed with real names and avatars; selection is explicit | ☐ |
| F-03 | Cancel the OAuth flow midway | Returns without a half-created connection | ☐ |
| F-04 | Replay the callback URL a second time | State is single-use; refused | ☐ |
| F-05 | Connected accounts list | Health state, capabilities, last sync, quota gauge (M8.5) all render | ☐ |
| F-06 | "Check now" | Re-syncs; health updates | ☐ |
| F-07 | Reconnect the same page | **Preserves channel ids** — scheduled posts must not orphan | ☐ |
| F-08 | Disconnect | Shows impact (what breaks) before confirming; revokes remotely | ☐ |
| F-09 | Connect Instagram | Needs an IG Business account on the Page. Record exactly what the UI says if it can't | ☐ |
| F-10 | Connect LinkedIn / TikTok / YouTube / Pinterest / X / GBP | Expected to fail (W7). Judge the **honesty of the failure**, not the failure | ☐ |
| F-11 | Token security | No token in any response body, log, or DOM. Check devtools Network and the page source | ☐ |

## G. Content library

| ID | Test | Expected | |
|---|---|---|---|
| G-01 | Upload a JPEG by drag-drop | Progress shown; direct-to-Azure presigned PUT succeeds (CORS — `environment.md`) | ☐ |
| G-02 | Upload a PNG, a large image (>10MB), a GIF | All handled or refused with a reason | ☐ |
| G-03 | Upload an MP4 | **M12.1 closed the video defect** — duration/probe/poster/thumb must now exist. Verify the poster frame renders | ☐ |
| G-04 | Upload a disallowed type (.exe, .zip) | Refused clearly | ☐ |
| G-05 | Time from upload to selectable | Measure it (UX-Q1). Note the wait for renditions + scan | ☐ |
| G-06 | Asset detail drawer | Alt text, caption, tags, rights + expiry all save | ☐ |
| G-07 | Search, type filter, tag filter | Work and combine | ☐ |
| G-08 | Soft delete an asset used by a draft | Usage guard fires — does not silently break the draft | ☐ |
| G-09 | Rights expiry (M8.4) | An expired-rights asset is blocked from publish with a stated reason | ☐ |
| G-10 | Scan state | See W1 — everything reports clean. Confirm the UI doesn't overstate safety | ☐ |

## H. Composer (Create)

| ID | Test | Expected | |
|---|---|---|---|
| H-01 | Open Create with no channels connected | Explains the prerequisite (UX-Q2) | ☐ |
| H-02 | Write shared text; select Facebook | Live preview matches what Facebook will render | ☐ |
| H-03 | Per-channel override | Overrides diverge from shared text and persist | ☐ |
| H-04 | Add media via the picker | **UX-Q1** — measure the full round trip and whether the draft survives | ☐ |
| H-05 | Media ordering, alt text per asset | Order is respected in the preview and on the network | ☐ |
| H-06 | First comment, link + UTM | UTM pre-fills from Settings → Tracking; the published link carries it | ☐ |
| H-07 | Autosave | Type, wait, hard-refresh. Nothing lost — including overrides, not just the caption | ☐ |
| H-08 | Validation, blocking vs recommendation | Limits appear **while composing**, not after publish (promise 4) | ☐ |
| H-09 | Exceed a real limit (caption length, media count) | Blocked with the specific limit named | ☐ |
| H-10 | Cost & quota preview (M8.5) | Renders before queuing | ☐ |
| H-11 | AI disclosure toggle (M8.6) | Sets the per-destination declaration; audited | ☐ |
| H-12 | Hashtag sets, templates | Insert correctly; template lineage recorded | ☐ |
| H-13 | Best-times panel | Shows a reason/definition, not a bare number (promise 2) | ☐ |
| H-14 | Delete draft | Confirms; removes variants too | ☐ |
| H-15 | Mobile quick compose `create/quick` at 375px | 4-step flow completes; media problem may be worse here (UX-Q1) | ☐ |

## I. Calendar and scheduling

| ID | Test | Expected | |
|---|---|---|---|
| I-01 | Month / week / list views | All render; match `planner.png` | ☐ |
| I-02 | Filters: channel, campaign, status, assignee | Work, combine, and survive navigation | ☐ |
| I-03 | Schedule a post for +10 min | Stored in **workspace** timezone (W10) | ☐ |
| I-04 | Schedule across a DST boundary | No off-by-one hour | ☐ |
| I-05 | Drag to reschedule | Confirmation dialog; new time sticks | ☐ |
| I-06 | Schedule in the past | Refused or explained | ☐ |
| I-07 | Bulk reschedule from list view | Works; audited | ☐ |
| I-08 | Post preview cards | Show status, channel, approval state legibly | ☐ |

## J. Publish — **P0 territory (W2)**

| ID | Test | Expected | |
|---|---|---|---|
| PUB-01 | Publish now, text only, to Facebook | Appears on the Page. One post, exactly | ☐ |
| PUB-02 | Publish with a single image | Image correct, alt text applied | ☐ |
| PUB-03 | Publish a carousel / multi-image | Order preserved | ☐ |
| PUB-04 | Publish a video | Uses the M12.1 probe path; duration validated against `videoMaxSeconds` | ☐ |
| PUB-05 | Scheduled post fires at its time | On time, once | ☐ |
| PUB-06 | **Double-click publish** | One post. Idempotency key holds | ☐ |
| PUB-07 | Publish, then reload immediately | State is consistent; no second send | ☐ |
| PUB-08 | Publish then close the tab mid-flight | Completes server-side; state correct on return | ☐ |
| PUB-09 | Force a failure (disconnect the token, then publish) | Fails honestly with a real reason; no phantom success | ☐ |
| PUB-10 | Retry a failed variant | **Reconciles before resending.** No duplicate on the Page | ☐ |
| PUB-11 | Delete the post on Facebook, then reconcile | Divergence observed and recorded (W11) | ☐ |
| PUB-12 | Multi-destination partial success | Per-variant results; retry only the failed one | ☐ |
| PUB-13 | `post_variant` vs `content_item.status` | Summary agrees with the authoritative variants | ☐ |

## K. Post detail and receipts

| ID | Test | Expected | |
|---|---|---|---|
| K-01 | Publish receipt timeline (M8.1) | validated → sent → confirmed/reconciled, with remote id and cost | ☐ |
| K-02 | Is the receipt legible to a non-engineer? | UX judgment — promise 1 | ☐ |
| K-03 | Versions / activity history | Immutable; shows who changed what | ☐ |
| K-04 | Deep link to the live post | Opens the real Facebook post | ☐ |
| K-05 | Retry failed destinations from here | Same guarantees as PUB-10 | ☐ |
