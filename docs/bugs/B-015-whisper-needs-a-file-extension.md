# B-015 — Transcription failed because the file part had no extension

- **Severity:** P1 — captions were impossible; it also failed the whole voice-over job.
- **Found:** 2026-09-01, immediately after the voice-over finally generated.
- **Status:** fixed.

## What happened

The voice was made, the asset was stored, and then:

```
job failed  job=media.render  err="The speech endpoint returned 400."
```

The 400 came from the **transcription** call, not the speech one — the same
error mapper serves both, which made the message ambiguous at exactly the wrong
moment.

## Cause

```ts
form.set("file", new Blob([bytes], { type: mimeType }), "audio");
```

whisper detects the container from the **filename extension**. A part called
`audio` with no suffix is rejected, whatever `Content-Type` says.

Confirmed against the live deployment rather than guessed — the same request,
twice, differing only in the filename:

| filename | result |
|---|---|
| `audio` | **400** |
| `audio.mp3` | **200**, with per-word timings |

## Fix

The part is named from the mime type — `.mp3`, `.wav`, `.m4a`, `.mp4` — and
falls back to `.mp3` rather than to nothing, because an unknown type should not
become a 400. `extensionFor` is tested.

## The second fix, which matters more

A transcription failure used to fail the whole job, throwing away a paid-for
voice-over to protect the captions. It now **degrades**: captions are skipped,
the reason is logged, and the voice-over is kept.

That is not hypothetical tidiness. whisper is deployed at **1 request per
minute** — the subscription had 3 and 2 were already spent elsewhere — so a
retry storm rate-limits it easily, and the first live run produced exactly that:
`"The voice model is busy — try again in a minute."` The valuable half must not
depend on the optional half.
