# B-007 — A generation that fails is invisible to everyone

- **Severity:** P1 — a control that does not control: money can be spent with no surface that says so.
- **Found:** 2026-09-01, while testing the first live video clip.
- **Status:** fixed, verified live.

## What happened

Clicking **Generate clip** showed a green toast:

> Generating a 4-second clip. It takes a few minutes and lands in the library
> when it's ready.

The job then failed in the worker (B-006). Nothing in the product changed. The
Videos tab stayed at 0, the grid stayed at 7 assets, no error appeared anywhere,
and refreshing did nothing. `/staff` did not list it either — it shows a spend
total, and a job that spent nothing contributes nothing to a total.

So the person who asked for a clip is left waiting for something that is never
coming, with no way to find out. That is the whole bug.

## Why it is P1 and not cosmetic

This failure happened to cost nothing — it died at submission. The next one need
not. A video job can succeed at the vendor and then fail on our side: the
download URL expires (24 hours, measured), storage rejects the write, the probe
throws. In every one of those the vendor has already billed, `media_job.credits`
is written, and the customer's ledger moves — while the screen shows nothing at
all.

"We charged you and told you nothing" is not a UI gap.

## What was already true

Every field needed was being recorded and had been all along:

| Column | Held |
|---|---|
| `state` | `queued` / `running` / `succeeded` / `failed` / `cancelled` |
| `error_category`, `error_note` | the user-facing reason, already scrubbed of vendor payloads |
| `credits` | what the customer was billed, null when nothing |
| `spec` | the prompt, verbatim |

Nothing read any of it back. The write side was complete and the read side did
not exist.

## Fix

- `lib/media/recent.ts` — `recentGenerations(workspaceId)`: jobs still running,
  plus failures from the last 24 hours. A succeeded job is deliberately absent,
  because its asset is already in the grid and IS the evidence.
- `components/library/generation-status.tsx` — renders them in the rail,
  directly under the generate panels, because that is where the toast sent the
  person. Failures carry the recorded reason verbatim.
- It polls **only while something is actually running**, and stops when nothing
  is. The page is a server component, so a job finishing while it is open
  otherwise changes nothing on screen.
- `lib/media/generation-copy.ts` — `chargeNote()`, its own DB-free module so the
  claim is testable. **"Nothing was charged" is read from the ledger, never
  assumed**; a failure that was already billed says what it cost instead.

## What this one nearly repeated

The first draft of `recent.ts` hand-wrote a `JobKind → image | video` map and
invented two kinds (`background_plate`, `ad_still`) that do not exist. That is
precisely how B-006 happened one hour earlier. It now uses `MEDIA_KIND_OF` from
the registry — the map that already exists rather than a second copy of it.
