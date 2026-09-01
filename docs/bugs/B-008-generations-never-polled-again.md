# B-008 — Every generation was stranded: the poll ran once and never again

- **Severity:** P1 — money spent, vendor finished, file never collected.
- **Found:** 2026-09-01, on the first video clip that actually reached Sora.
- **Status:** fixed.

## What happened

The first clip submitted cleanly and then never arrived. The worker log is the
whole story:

```
11:38:29  media job submitted   remoteJobId=video_6a96b935…
11:38:36  job done              job=media.poll
(nothing, ever again)
```

Azure, meanwhile:

```
11:39:23  status=completed  progress=100
```

The vendor finished 47 seconds after our only poll. Nothing ever looked again.
The job sat in `running` forever, the delivery URL was on a 24-hour clock, and
the money was already spent.

## Cause

`media.generate` emits exactly **one** `media.poll` per job:

```ts
await emit(tx, "media.poll", { mediaJobId: row.id }, { dedupeKey: `media.poll:${row.id}` });
```

That poll fires seconds after submission, sees `in_progress`, bumps `updatedAt`,
and **returns normally**. pg-boss marks it complete. The queue's
`retryLimit: 3` never applies, because nothing threw — the handler did its job
correctly and there was simply nobody to call it a second time.

The sweep path in `mediaPoll` — the branch that reads *every* unfinished job —
was already written and correct. No timer ever invoked it.

So this was not a broken poll. It was a poll nobody called.

## Why it never showed up before

Images are **synchronous**: `runMediaJobNow` runs those inline and never touches
this path. Video is the first thing in the product that goes through the queue,
and it was broken from the moment it was written. Every unit test passed,
because every unit test called the handler itself.

## Fix

- `lib/media/schedule.ts` — `enqueueMediaPolls()`: if anything is `queued` or
  `running`, ask for one sweep. Quiet when there is nothing to do.
- `worker/schedules.ts` — a 15-second ticker. A **sweep**, not a per-job
  re-emit, deliberately: a re-emit cannot rescue a job already stranded by a
  crash, and a sweep can. That matters immediately, because there was one
  stranded when this was written.
- `lib/media/delivery-window.ts` — a job still running past its model's
  `urlTtlSeconds` is ended honestly. Past that point the bytes are gone whatever
  the vendor does next, so polling on would only keep a spinner turning over
  nothing. Bounded by a measured fact rather than a guessed timeout, so it can
  never kill a job that could still deliver.
- `worker/media-poll-schedule.test.ts` — pins the wiring. The first version of
  this test asserted only that `schedules.ts` *imported* `enqueueMediaPolls`,
  and it **passed with the ticker deleted** — the exact failure mode again, in
  the test itself. It now asserts the call and the cadence, and both fail under
  mutation.

## The general lesson

A handler with no caller is invisible to every test that calls the handler. Two
of the three bugs found today (this and B-007) are the same shape: code that was
written, correct, and never reached.
