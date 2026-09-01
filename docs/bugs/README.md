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
| [B-004](B-004-image-estimate-overstates-cost.md) | P2 | part | The image estimate shows the ceiling's safety rate, ~8x the real cost |
| [B-005](B-005-spend-ceiling-never-observed-refusing.md) | P2 | open | The spend ceiling cannot refuse anything the product can ask for |

**Severity** — P0 production down or data loss · P1 wrong public output, money, or
a control that does not control · P2 wrong or misleading in-product · P3 cosmetic.
