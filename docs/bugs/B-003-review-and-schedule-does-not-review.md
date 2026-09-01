# B-003 · P1 · "Review & schedule" schedules immediately — there is no review step

**Status** fixed and verified live 2026-09-01 (`9f9e7bc`) — the button reads "Schedule →".
**Found** 2026-09-01, live in production. I clicked it expecting a review and it
scheduled a real post to the live Jotacular Page four minutes out. Caught and
unscheduled; publish receipts confirm nothing was sent.
**Where** `apps/platform/components/composer/index.tsx`

## Symptom

```
const LABEL = { now: "Publish now", draft: "Save as draft",
                review: "Request approval →", schedule: "Review & schedule →" }
```

Three of those labels name what the button does. The fourth promises a checkpoint that
does not exist: it writes the schedule and navigates to the post page. The arrow and the
word order both read as "review, then schedule".

## Why it matters

The failure mode is an unintended public post. It is recoverable only if you notice
before the scheduled time — the window can be minutes, and the label is what stops you
looking.

## Fix

Rename to `"Schedule →"`. The post detail page it lands on is a fine place to review, and
"Schedule" describes what pressing it does.

Not proposed: adding a confirmation step. The other three actions commit without one, and
a modal on the fourth would be inconsistent. The label is the bug.

## Verification

Composer with Schedule selected reads "Schedule →". The other three are unchanged.
