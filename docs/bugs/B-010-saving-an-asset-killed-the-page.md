# B-010 — Saving an asset killed the page with an infinite render loop

- **Severity:** P1 — the screen dies on a routine save. The write succeeds; the app does not survive it.
- **Found:** 2026-09-01, setting alt text on the hero video before publishing.
- **Status:** fixed.

## What happened

Pressing **Save** on an asset replaced the whole page with:

> Application error: a client-side exception has occurred

```
Error: Minified React error #185   (Maximum update depth exceeded)
```

Fully reproducible: press Save, get a white page. The save itself **worked** —
the title and alt text were both persisted, and reloading showed them. The
application just could not survive telling you so.

## Cause

`useActionFeedback()` returned a fresh `notify` on every render:

```ts
const notify = (state, opts = {}) => { … toast.add(…) … };   // new function, every render
```

Three components put that function in an effect's dependency list:

```ts
useEffect(() => notify(state), [state, notify]);   // detail-panel, team-panel x2
```

A new `notify` each render means the effect runs on **every** render. That is
harmless while `state` is empty — `notify` returns immediately and touches
nothing. The moment a save returns `{ ok: "Saved" }`, the loop closes:

> notify → `toast.add` → toast store re-renders → new `notify` → effect fires →
> notify → …

React counts the updates and throws #185. So the bug was invisible until the
exact moment the product tried to say "that worked", which is why the page had
been fine all day and died on the first Save.

The blast radius was wider than the library: **Team** has the same two effects,
so saving a member there died the same way.

## Fix

`notify` and `run` are now `useCallback`-memoised. The toast handle is reached
through a **ref** rather than a `useCallback` dependency — `[toast]` would only
be as stable as whatever the provider hands back, and this must be stable
unconditionally.

One nearby instance of the same class, fixed with it:

```ts
useEffect(() => setTags(a.tags), [a.id, a.tags]);
```

`a.tags` is built by `.map()` in the page's `toCard`, so it is a **new array on
every parent render**. That effect reset the tag editor on any refresh —
throwing away tags a person was part-way through typing. It now keys off
`a.id`, which is what "a different asset was selected" actually means.

## Why no test caught it

Nothing here renders React. The bug lives entirely in identity-across-renders,
which no unit test in this repo can observe. `lib/use-action-feedback.test.ts`
pins the memoisation at the source instead — the same approach as
`worker/media-poll-schedule.test.ts`, and for the same reason: the invariant is
real, and the only alternative was not testing it at all.

## The pattern worth naming

Four of the six bugs found today are **a correct thing wired wrongly**, not a
wrong thing: a handler with no caller (B-008), a value written but never read
(B-007), a column computed for one vendor and not the other (B-009), and now a
function whose *identity* was the contract nobody was checking.
