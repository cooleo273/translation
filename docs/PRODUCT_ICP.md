# Primary ICP and roadmap focus

## Decision

**Primary ICP: small teams and agencies** (localization coordinators, marketing ops, internal comms) with **API developers** as a strong secondary segment for the Business tier.

**Secondary ICP: solo creators** (YouTube, podcasts, short-form) who drive volume and word-of-mouth but are not the main design center for B2B features (glossary, batch, webhooks).

## Rationale

- The product already combines **dashboard file workflows**, **usage/billing**, and **REST v1 with API keys**. That stack naturally serves **teams** who need consistent terminology across assets and **developers** who integrate translation into pipelines.
- **Creators** benefit from media transcription and exports; those flows stay first-class in the core pipeline without requiring team/org infrastructure on day one.

## What we optimize for (in order)

1. **Consistency and throughput** — glossary, batch operations, clear job status.
2. **Integration** — webhooks and a thin SDK on top of existing v1 endpoints.
3. **Delight for individuals** — previews and media features, without blocking B2B delivery.

## Org / teams (Phase 3+)

Shared workspaces, seats, and shared glossaries are **explicitly deferred** until there is recurring revenue from multi-seat customers. The schema and UI can grow toward `organization_id` on profiles and resources when needed; see product backlog for enterprise.
