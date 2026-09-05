# M13 — Grid

**Status:** built and verified against the mock provider, 2026-09-05. Real networks untested live
(no credentials yet; same state as every adapter).

## What it is

The profile page as the network will render it — live posts and planned posts in one grid — so a
brand sees how the page will look before anything publishes. Competitors call this a "Feed Planner"
or "Visual Planner"; ours is **Grid** ("Planner" is excluded by the Calendar naming rule).

## Decisions (user, 2026-09-05)

- **Standalone feature, not a Calendar tab.** Own route (`/app/:workspaceId/grid`), own sidebar entry
  after Calendar, own empty state. Calendar stays clean.
- **Not Instagram-only.** Instagram (Posts, Reels), TikTok, YouTube (Videos, Shorts) first; the demo
  network mirrors Instagram so the local loop exercises the same shape. Facebook (a timeline, not a
  grid) and Pinterest (boards) later. LinkedIn has no grid.
- **Mockups approved** before the build: `images/grid.png`, `images/grid-youtube.png`,
  `images/grid-empty.png`.

## Shape

| Piece | Where | Rule it carries |
|---|---|---|
| Layouts | `lib/grid/layouts.ts` | One record per network SURFACE: columns, tile shape, formats shown, what never appears, why pinned is not modelled. Dated and sourced; observed layouts are `verified: false`. |
| Arithmetic | `lib/grid/tiles.ts` | Pure. State from the variant (approval only refines a draft). Rhythm = median spacing of the last 10 live posts, ≥3 needed, clamped 1–7 days. A gap = a stretch longer than the rhythm with nothing planned, future only, at most 6. Days ahead = whole days to the last planned post. |
| Loader | `lib/grid/load.ts` | Reads only what the sync and publish workers wrote. Live window 90 days. Tile pictures: chosen cover frame → thumb → original image. |
| Actions | `lib/actions/grid.ts` | `swapSchedule` (two reschedules in one transaction, two audit rows), `scheduleDraftAt` (through `scheduleItemCore`, surface "grid"), `requestCoverFrames`, `setCoverFrame` (a live post's cover is locked). |
| Frames | `db/schema/assets.ts#assetFrame`, `worker/handlers/asset-frames.ts`, `lib/grid/frames.ts` | Six stills between 5% and 95% of the clip, on request, unique on (asset, offset). Runs on the media worker. |
| Publish | `lib/grid/cover.ts`, `worker/handlers/publish.ts` | `settings.cover` → `PublishRequest.cover = { offsetMs, imageUrl }`; a frame from another video is dropped, never sent. The worker logs `coverOffsetMs`. |
| Contract | `packages/providers` | `Capabilities.cover: "offset" | "image" | "none"` + `PublishRequest.cover`. Instagram Reels `thumb_offset`; TikTok `video_cover_timestamp_ms`; Pinterest `cover_image_url`; mock records it. YouTube, Facebook, LinkedIn, X: `"none"` with a reason. |
| Screen | `components/grid-screen.tsx`, `components/grid/*` | Header, stats with definitions, layout facts, rhythm line, surface tabs + legend, phone-width preview for 3-column grids, tiles with icon + label status, selected-tile panel with the cover picker and the keyboard "Move…", drafts tray, confirm dialog before every drop. |

Every number on the page has a definition (`GRID_DEFINITIONS`), shown on hover and, for the rhythm,
in a sentence under the stats.

## Gate and how it was met

> Against the mock provider, a channel with published and scheduled posts renders in the network's
> tile order; dragging a scheduled tile changes its date and the change shows on Calendar; a live
> tile cannot be moved; a cover frame chosen here is the one the (mock) publish sends.

Run 2026-09-05 with a script under `apps/platform/e2e/.state/grid-live/` (ignored; `run.ts` signs
up a fresh tenant through the real UI, connects the demo network through the real consent flow,
`seed.ts` writes 4 live posts every 3 days, 2 scheduled posts, 2 undated drafts — one with an
ffmpeg-generated clip — and the script drives the page with Playwright):

- Empty state before any profile; then 4 live / 2 planned / 2 gaps / 8 days ahead, newest first,
  "Rhythm: a post every 3 days".
- Swap: dragging Scheduled A onto Scheduled B exchanged their dates (audit rows written).
- Live tile: no `draggable` attribute.
- Draft dropped on a gap: scheduled at the usual time, through the approval gate.
- Cover: six frames pulled by the media worker, one chosen, tile picture changed.
- "Move…" put the clip 90 s out; the general worker published it through the mock adapter and
  logged `"publishing" … "coverOffsetMs":4720` — the chosen frame.

Tests: `lib/grid/*.test.ts` (layouts, tiles, frames), `packages/providers` mock cover test,
`lib/jobs/queues.test.ts` (media-worker set). 982 platform tests, 193 provider tests.

## Deferred

- Facebook Page photos/Reels strip and Pinterest boards as surfaces.
- YouTube custom thumbnails (`thumbnails.set`): needs a verified channel, which the API does not
  report. Declared `cover: "none"` with that reason.
- Promote the live check to a Playwright spec in `e2e/` (needs the seed to run inside the runner).
- Pinned tiles, if any network ever exposes them.
