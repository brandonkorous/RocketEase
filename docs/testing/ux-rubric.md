# Ease-of-use rubric

The product is called **RocketEase** and the promise is "Effortless Launch." Round 1 judges the
product against its own name, not against a generic usability checklist.

## How to score a flow

Walk each flow as a *first-time user of that flow*, and record four numbers:

| Measure | How | Bar |
|---|---|---|
| **Steps** | Count clicks + typed fields from intent to done. | A first post should be under 10. |
| **Detours** | Times you must leave the screen and come back to finish. | **Zero.** Every detour is a UX finding. |
| **Dead ends** | Times a control is disabled/absent with no stated reason. | Zero. "Why not" is a shipped feature (M8.2). |
| **Surprises** | Times the result differed from what the screen implied. | Zero. |

Then answer in one sentence: *what would a small-business owner with 20 minutes get stuck on?*

## The five promises to test as UX, not just function

The positioning is "the honest social OS". Each promise is a testable experience:

1. **Never a duplicate or phantom failure** — does the UI make you *trust* the publish result? Is the
   receipt legible to a non-engineer?
2. **Every number has a definition** — is the definition reachable in one interaction, or buried?
3. **Missing is never zero** — when a metric is unavailable, does the empty state teach you how to fix it?
4. **Platform limits shown before publish** — do you learn a limit while composing, or after failing?
5. **AI drafts, a person sends** — is that boundary obvious, or does it feel like a safety rail in the way?

## Known UX questions to answer in round 1

These are already suspected. Confirm, quantify, and rank them — do not just re-observe them.

### UX-Q1 — Media upload requires leaving the composer *(user-raised)*

Confirmed structurally in `components/composer/media-picker.tsx`: the picker lists existing assets
and offers a link — "Upload in Content Library ↗" — and no upload control of any kind. There is no
drop target, no file input, no paste handler.

It is worse than one extra click, and round 1 should measure exactly how much worse:

- The asset must also be **processed by the worker** before it is selectable — the picker disables
  anything without `scanClean`, and thumbnails come from renditions. So the real loop is
  *leave → upload → wait for a worker → navigate back → find it → select it.*
- Time the whole round trip with a large image and with a video.
- Check whether the composer draft survives the detour (it autosaves — verify that it actually does,
  including per-channel overrides, and not just the shared caption).
- Check whether you can get back to the draft at all without hunting for it in Content.
- Check the mobile quick-compose path (`create/quick`) for the same problem — it may be worse.

Then answer: should the picker accept a drop/upload inline, and is the processing wait tolerable
if it did? Record the answer as a recommendation in `findings.md`, with the measured numbers.

### UX-Q2 — Is "Create" reachable when you have nothing?

New workspace, no channels, no assets. Does Create explain the prerequisites, or present a form that
cannot be submitted? The publish button is disabled when no destination is selected — is *why* stated?

### UX-Q3 — Nine primary nav items plus three manage items

Home, Calendar, Create, Inbox, Campaigns, Analytics, Content, Brand, Approvals + Connected accounts,
Team, Settings. Fifteen settings sub-sections under that. For a one-person business this may read as
an enterprise tool. Note where you *expected* something to live versus where it is — especially
Content vs Library vs Brand assets, which are three plausible homes for "my images".

### UX-Q4 — First-run: does onboarding leave you somewhere useful?

Onboarding is org → workspace → goals. Where does it drop you, and is the next action obvious? The
Home checklist is supposed to be driven by real state — verify it reflects what you actually did.

### UX-Q5 — Does the app explain itself without the docs?

Round 1 is the last moment where the tester can still read a screen with fresh eyes. Note every
piece of vocabulary that needed the spec to decode: "variant", "channel", "workspace" vs
"organization", "connected account" vs "integration", "content item".
