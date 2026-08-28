# Make It Social product foundation

This directory is the implementation baseline for Make It Social, a social marketing operating system that joins planning, publishing, engagement, paid promotion, and measurement.

## Canonical documents

| Document | Purpose |
| --- | --- |
| [product.md](product.md) | Vision, positioning, principles, scope, and success measures |
| [requirements.md](requirements.md) | Functional and non-functional requirements with release criteria |
| [design.md](design.md) | Brand, interface system, responsive behavior, and accessibility |
| [architecture.md](architecture.md) | System boundaries, services, reliability, security, and delivery |
| [data-model.md](data-model.md) | Core entities, relationships, state models, and retention |
| [content-model.md](content-model.md) | Post, variant, asset, campaign, approval, and version semantics |
| [users.md](users.md) | Audiences, jobs, needs, and exclusions |
| [permissions.md](permissions.md) | Roles, workspace access, approval policy, and audit rules |
| [navigation.md](navigation.md) | Information architecture, routes, and responsive navigation |
| [pages.md](pages.md) | Page inventory, required states, and acceptance notes |
| [flows.md](flows.md) | End-to-end product workflows and failure recovery |
| [integrations.md](integrations.md) | Connector model, OAuth, sync, webhooks, and degradation |
| [analytics.md](analytics.md) | Product reporting, attribution, metric definitions, and telemetry |
| [onboarding.md](onboarding.md) | Activation path, checklists, empty states, and lifecycle prompts |
| [roadmap.md](roadmap.md) | Sequenced delivery plan and decision gates |

## Shared language

- **Organization:** billing and ownership boundary; usually an agency or company.
- **Workspace:** isolated brand/client operating context.
- **Channel:** connected social profile, page, or ad account.
- **Campaign:** container joining organic content, paid promotion, audience, spend, and outcomes.
- **Content item:** reusable intent and source material.
- **Post variant:** channel-specific publishable rendition.
- **Conversation:** normalized thread containing messages, comments, mentions, or reviews.
- **Report:** saved definition of metrics, filters, comparisons, and delivery.

## Product lifecycle

**Plan → Publish → Engage → Promote → Understand → Improve**

The shorter marketing expression remains **Plan → Publish → Engage → Optimize**. Product navigation uses task-oriented nouns rather than forcing every lifecycle stage into a top-level item.

## Decision policy

These documents are canonical until superseded by a recorded product decision. Unknown provider constraints, commercial limits, and legal requirements must be validated before release. Never invent customer proof, metrics, or platform capabilities.
