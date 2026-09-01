# The jotacular marketing video — live production run

Started 2026-09-01. **Read this first if you are picking the task up cold.**

## The task, in the user's words

> continue until you have completed the creation of a quality marketing video
> for the jotacular (not a random herb or fruit) … you can publish … don't stop
> until you are done and you have confirmed that this works in production.

**Publishing to the live Jotacular Facebook Page is AUTHORISED** for this task.
That is a change from the standing "ask first" rule in
`live-media-generation.md`, and it applies to this video only.

## The brand, read from the kit (not invented)

jotacular — a notes app. *"Don't organize it. Just jot it."*
Four ways in: **write, type, speak, snap**. Four seconds from thought to saved.

**Voice:** plain, understated, a little wry. Short sentences, said out loud.
Second person. Open on a concrete moment — *the lake, a red light, under the sink*.

**Never:** exclamation marks · the words *system*, *workflow*, *second brain* ·
promising organisation (filing is the thing they removed) · AI boosterism ·
urgency or scarcity · the banned list (synergy, game-changing, revolutionary,
seamless, effortless, unleash, supercharge, second brain, frictionless,
superpower, must-have, life-changing).

**CTA:** invite, never pressure. *"Start jotting"*, not *"Sign up now"*.

Palette violet `#6a39ff` · mint `#00c2a8` · paper `#ece6da` · ink `#111418`.
Headings Nunito, body DM Sans. British spelling.

## The creative

The brand's own example copy opens at a lake, so the film does too — one
continuous shot, 9:16, no on-screen text (Sora renders type as garbage, and the
words belong in the caption anyway).

> Vertical 9:16. Early morning at a still lake. Soft overcast light, muted
> natural colour, gentle mist on the water. A person in a knitted jumper sits on
> the end of a weathered wooden dock, seen from behind and slightly to one side.
> They look out at the water, then take a phone from their pocket, glance down,
> and tap the screen quickly with one thumb. They lower the phone and look back
> at the lake. Camera locked off, an almost imperceptible slow push in. Natural
> ambient sound: water, distant birds. Documentary, unhurried, no music. No
> text, no captions, no logos, no on-screen graphics.

Caption copy, checked line by line against the rules above:

> You are at the lake and an idea arrives. You have about four seconds before it
> goes.
>
> Write it, type it, say it, or snap it. It is saved either way, in whatever
> form it turned up in.
>
> Nothing to file. Nothing to maintain.
>
> Start jotting.

## Order of work

1. **4-second validation clip** — cheap proof that download → store → probe →
   credits works at all. It never has.
2. **12-second hero clip** — the deliverable. $1.20 against a $1.50 per-job
   ceiling, so it also proves the ceiling permits honest work.
3. Publish to Facebook · Jotacular with the media declared as **synthetic**.
4. Confirm live: the post exists, the label is on it, credits are recorded.

## What the platform adds to the prompt, unasked

Worth knowing before writing one: the workspace appends the brand kit's art
direction to whatever you type. Read back off a live job, it sent the art
direction, the five brand hex values, the always/never lists, the
keep-out-of-frame list, and:

> Do not draw the brand's logo, wordmark, or any lettering — the logo is placed
> afterwards from the real file.

So the prompt above only has to carry the *shot*. Style is already handled, and
asking for type in the prompt fights the system rather than using it.

## Bugs this run has found so far

Three, all P1, all only visible in a live run:

| | What | Why no test caught it |
|---|---|---|
| B-006 | The Sora path we wrote to does not exist | 14 tests, fixtures written from the same wrong guess as the code |
| B-007 | A failed generation is invisible | Nothing read back state that was being written correctly |
| B-008 | Every generation stranded — polled once, never again | The handler was right; nothing called it a second time |

B-007 and B-008 are the same shape: **code that was written, correct, and never
reached.** A handler with no caller is invisible to every test that calls the
handler.

## State

- All three fixed and pushed (`de611ad`), deploying.
- One clip is submitted and stranded by B-008. Its bytes live 24h, so the new
  sweep should collect it on its own — which is the fix proving itself.
- Both video prices are still placeholders: `$0.10/s` vendor, `12 credits/s`
  customer. The first successful clip is what replaces them with measurement.
