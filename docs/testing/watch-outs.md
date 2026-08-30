# Watch-outs

Things that make a real bug look fine, or a correct behaviour look broken. Read before filing.

## W1 — Virus scanning is off, and reports "clean"

`worker/handlers/asset/scan.ts`: when `CLAMAV_URL` is unset, `scanBuffer` returns
`{ status: "clean", note: "scanner not configured (dev)" }`. Production has no `CLAMAV_URL`.

So in production every uploaded asset is marked **clean without being scanned**, and the note says
"(dev)". The publish gate that is supposed to block unscanned media therefore passes everything.

Round 1 must not treat "my image published fine" as proof the gate works. Two separate questions:
does the *gate* work (needs a deliberately non-clean state), and is the *scanner* deployed (it is not).
Filed as **F-002**.

## W2 — Never a duplicate, never a phantom

This is the product's headline claim. Any of these is **P0**:

- The same content appears twice on the network.
- The UI says failed, the network shows published (phantom failure).
- The UI says published, the network shows nothing (phantom success).
- A retry sends again without reconciling first.

Exercise it deliberately: retry a failed variant, retry a *partially* succeeded item, double-click
publish, publish then immediately reload, and publish with the tab closed mid-flight. `post_variant`
is authoritative; `content_item.status` is only a summary — a disagreement between them is a finding.

## W3 — Missing is never zero

Any metric that cannot be computed must say *why*, not render `0`. `lib/tracking/availability.ts`
owns every such string. A `0` that means "no data", "not connected", or "provider doesn't expose it"
is **P1**, not a cosmetic issue.

Same for definitions: every displayed number is supposed to carry a contract (name, formula, unit,
freshness). A number with no definition affordance is P1.

## W4 — Middleware is not authorization

`middleware.ts` is an optimistic cookie check only. The real gate is `requireWorkspace()` on the
server. Test it by pasting another workspace's URL directly, not by clicking around — clicking will
never reach the failure. A non-member must be redirected with **no existence leak** (a 404 that
differs from a 403 tells an attacker the workspace exists).

## W5 — `NEXT_PUBLIC_*` failures are silent and build-time

A missing one does not error. The browser gets `undefined` and the feature never renders. If a
control is simply absent, check `environment.md` §Build-time before assuming it's broken code.

## W6 — Ticks, not bugs

Publishing, inbox ingestion and insights are asynchronous. Wait the documented interval
(`environment.md` §Async ticks) before calling something broken. Conversely: if a *queued* thing never
lands after two intervals, that is real, and check `/api/health` `queue` before filing.

## W7 — Only Facebook is live

A LinkedIn/TikTok/YouTube/Pinterest/X/GBP connect failure is expected and is a **record**, not a
regression. What *is* testable on those: does the UI fail honestly? A dead-end spinner, a raw provider
error, or a control that looks available and isn't — those are real findings even on a dead provider.
`/capabilities` is generated from the adapters; check the in-app "why not" copy matches it.

## W8 — Beta gates default closed

Media generation (M12) sits behind `feature_grant`, default closed, and a `/staff` surface. Its
absence is correct. Do not file "the ad creative feature is missing".

## W9 — The other agent's working tree

M12.2 (static ad creative) is uncommitted work in progress. It is **not deployed**. Anything you see
live is from commit `ed66a58` or earlier. Don't test against the working tree, and don't `git stash`.

## W10 — Timezones and DST

Scheduling is in the *workspace* timezone, not the browser's. Test with a workspace timezone that
differs from yours, and schedule across a DST boundary. An off-by-one-hour post is P1.

## W11 — Facebook deletions don't round-trip

Deleting a post on Facebook does not update `post_variant` here. Expected today, but observe how
badly it diverges and whether reconciliation ever notices — that shapes whether it needs a fix.

## W12 — Real email is sent, with no bounce handling

Invites, verification, resets and report deliveries go out over the Workspace relay to real
addresses. Use addresses you control. A bounce is invisible to the product.
