# Content model

## Principle

Separate creative intent from channel execution. A content item contains the reusable idea; each post variant contains platform-specific copy, media order, settings, preview, validation, and publication state.

## Hierarchy

```text
Campaign (optional)
└── Content item
    ├── Brief and shared metadata
    ├── Assets and links
    ├── Version history
    └── Post variants
        ├── Instagram destination + settings
        ├── LinkedIn destination + settings
        └── TikTok destination + settings
```

## Content item

Required: workspace, title/internal label, owner, status, created timestamps. Optional: campaign, brief, shared text, tags, folders, due date, contributors, source template, disclosure/risk labels, tracking defaults, and approval policy.

## Post variant

Contains destination channel, format, text, ordered asset renditions, first comment where supported, link and tracking parameters, mentions, location, accessibility text/captions, thumbnail, publish time/timezone, platform settings, validation result, approval state, and remote publication identifiers.

Do not silently force one platform’s rules onto another. Unsupported fields are disabled with an explanation. A shared edit prompts whether to update untouched variants; overridden variants remain intact.

## State models

Content workflow:

```text
idea → draft → in_review → changes_requested → approved → scheduled
scheduled → publishing → published
scheduled|publishing → failed
draft|in_review|approved|scheduled → canceled
```

Remote states such as deleted, partially_published, and unknown are reconciliation states, not authoring states. A multi-channel item may be partially successful; variant state is authoritative and parent state is summarized.

Approval state:

```text
not_required | pending | approved | changes_requested | superseded
```

## Versions

Every approval-relevant edit creates an immutable content version. Store structured diffs and references to immutable asset renditions. Restoring creates a new version; it does not erase history. Comments may attach to the item, a version, a field, or an asset timestamp/region.

## Assets

Store original file, derived renditions, checksum, MIME type, dimensions/duration, alt text/caption, rights/expiration metadata, uploader, scan status, and usage references. Never publish an unscanned or expired-rights asset. Deletion is blocked or soft-deleted when referenced by scheduled/published work.

## Templates and reuse

A template contains structure and defaults, not live campaign results. “Reuse” creates a traceable child item. Organization templates must not expose workspace-private media. Track lineage to support performance-informed reuse without changing historical content.

## Campaign relationship

A campaign may include organic variants, imported or managed ads, audiences, goals, budget, tracking, conversations, and results. A promoted post retains its source variant ID. Campaign membership does not change published platform identifiers.

## Validation

Validation runs on edit and immediately before queueing: required fields, media specifications, text/mention limits, channel permissions, token health, scheduling window, approval version, rights, and provider-specific constraints. Store the ruleset version used so failures can be explained later.
