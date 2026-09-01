# Bugs

One file per bug, so a session can read the one it is fixing and nothing else.

Naming: `B-NNN-short-slug.md`. IDs are sequential and never reused. These are
distinct from `docs/testing/findings.md` (F-###), which is the Round 1 live-test
register; a finding that turns into work to do gets a bug file here.

| ID | Sev | Status | Title |
|---|---|---|---|
| [B-001](B-001-content-credential-stripped-at-publish.md) | P1 | **fixed** | We strip the C2PA content credential at publish and say nothing |
| [B-002](B-002-synthetic-media-undeclared.md) | P1 | **fixed** | An AI-generated asset can be published with the disclosure set to "none" |
| [B-003](B-003-review-and-schedule-does-not-review.md) | P1 | **fixed** | "Review & schedule" schedules immediately — there is no review step |
| [B-004](B-004-image-estimate-overstates-cost.md) | P1 | **fixed** | Generation was unmetered, priced in the wrong unit, and threw away the measurement |
| [B-005](B-005-spend-ceiling-never-observed-refusing.md) | P2 | part | The spend ceiling cannot refuse anything the product can ask for |
| [B-006](B-006-sora-called-a-path-that-does-not-exist.md) | P1 | **fixed** | Video generation called an Azure path that does not exist, and 14 tests agreed with it |
| [B-007](B-007-failed-generation-is-invisible.md) | P1 | **fixed** | A generation that fails is invisible — no error, no state, nothing |
| [B-008](B-008-generations-never-polled-again.md) | P1 | **fixed** | Every generation stranded: the poll ran once and nothing ever called it again |
| [B-009](B-009-video-spend-never-reached-the-ceiling.md) | P1 | **fixed** | Video spend recorded null, so the monthly ceiling counted it as zero |

**Severity** — P0 production down or data loss · P1 wrong public output, money, or
a control that does not control · P2 wrong or misleading in-product · P3 cosmetic.
