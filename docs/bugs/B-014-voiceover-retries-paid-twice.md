# B-014 — Every voice-over retry paid for the voice again

- **Severity:** P1 — duplicate vendor spend, silently.
- **Found:** 2026-09-01, in the logs of the first run that reached the voice step.
- **Status:** fixed.

## What happened

One request produced two charges:

```
media job charged  model=azure-gpt-4o-mini-tts quantity=20 costUsd=0.0005
media job charged  model=azure-gpt-4o-mini-tts quantity=20 costUsd=0.0005
```

`media.render` retries three times. Each attempt re-ran the whole voice-over
job from the start, including the vendor call.

## Cause

`prepareJob` mints the key that is supposed to prevent exactly this:

```ts
idempotencyKey: `media_${randomUUID()}`
```

A fresh UUID **per call**. That is correct when a person pressed a button — two
presses are two requests, and the comment above it says so. It is wrong when the
caller is itself a retrying job, because every attempt mints a new key, writes a
new row, and pays again.

I introduced this by putting a spend inside a queue with `retryLimit: 3`.
Nothing was bypassed; the guarantee simply did not apply to a caller that can be
replayed.

## Fix

`CreateJobInput` takes an optional `idempotencyKey`, and the voice-over job
derives a stable one from the clip, the voice and the exact script. A retry now
finds the first attempt through the unique index on
`(workspace_id, idempotency_key)`; a genuine re-request with different words
does not collide with it.

It also checks for a succeeded job under that key first and reuses the audio
rather than calling the vendor at all.

## The rule this makes explicit

An idempotency key generated per *call* protects against a duplicate request. It
does not protect against a duplicate *attempt*. Any spend that runs inside a
retrying queue has to carry a key the caller can reproduce — otherwise the queue
turns one bill into as many as its retry limit allows. It was pennies here only
because speech is cheap; the same mistake around `media.generate` would be $1.20
a retry.
