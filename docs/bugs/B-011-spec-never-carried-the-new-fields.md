# B-011 — The product reference and voice script never reached the spec

- **Severity:** P1 — two features shipped, deployed, and did nothing.
- **Found:** 2026-09-01, by the user: *"it created a video, but no captions or voice"*.
- **Status:** fixed.

## What happened

A clip generated with a product shot selected, a voice-over script written and
captions ticked produced a plain clip. No product frame, no voice, no captions.
No error anywhere — the job succeeded, was charged, and landed in the library.

The whole of both features was in place: the schema accepted the fields, the
action destructured them, telemetry reported them, the toast promised them, and
`chainVoiceover` was waiting to read them back. One line was missing.

```ts
// what shipped
spec: { jobKind: "hero_shot", prompt: …, aspect, durationSeconds: seconds, count: 1 },
```

No `references`. No `voiceScript`. The one object that carries a request to the
vendor was the original.

## Cause

I edited that file with a scripted string replacement whose target did not
match, so it **silently did nothing**, and I did not read the result back. Both
edits — product references and voice — went through the same replacement and
both were lost. The surrounding changes to the same file DID apply, which is
why the diff looked plausible and the feature looked present.

TypeScript could not catch it. The fields ride in on a conditional spread:

```ts
...(voiceScript ? { voiceScript, captions } : {}),
```

Object literals get excess-property checking; **spreads do not**. So the fields
are neither required nor rejected, and a spec missing them compiles exactly as
cleanly as a spec carrying them.

Nor could any existing test: the only thing that would have noticed was
generating a clip and watching what came out, which costs $0.80 a look.

## Fix

The spec now carries both, and `lib/actions/video-spec.test.ts` asserts it —
bluntly, by reading the object literal out of the source. That is not elegant,
but the alternative was a feature whose only verification was spending money and
squinting. Mutation-checked: removing either spread fails two tests.

## The lesson, which is not about this file

This is the seventh bug today of the same shape — **correct code that nothing
reaches** — and the first one I caused myself, in the act of fixing the others.

The specific trap is worth naming: a scripted edit that does not match its
target fails silently and leaves a file that still compiles. Anything applied
that way has to be read back, not assumed. A green typecheck confirms the code
is valid, never that it is present.
