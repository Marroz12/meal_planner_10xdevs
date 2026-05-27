# F-01 Foundation: Recipe Domain Model and User Data Isolation — Plan Brief

> Full plan: `context/changes/data-ownership-and-recipe-domain-base/plan.md`

## What & Why

We are building the first load-bearing foundation for the meal-plan product: a secure recipe domain model plus strict per-user data isolation. This is required to unlock recipe management and all downstream planning features without later rebuilding core data contracts. The goal is to ship minimal but production-credible groundwork, not broad feature scope.

## Starting Point

The project already has auth wiring and request-level user context (`.bootstrap-scaffold/src/lib/supabase.ts` and `.bootstrap-scaffold/src/middleware.ts`), but no recipe domain schema, no domain CRUD API, and no ownership policies for recipe data. Current API surface is auth-only.

## Desired End State

Authenticated users can create, list, update, and soft-delete only their own recipes through a minimal API contract. Database-level RLS enforces ownership by default, while API returns stable JSON error codes for auth, ownership, and validation failures. Verification includes policy checks, integration smoke tests, and a lightweight performance guardrail.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| F-01 scope depth | Schema + RLS + minimal recipes CRUD API | Safest balance between strong foundation and immediate unblock of S-01 | Plan |
| Recipe model shape | Relational `recipes` + `recipe_ingredients` | Better long-term fit for shopping-list and dedup logic than JSON-only ingredients | Plan |
| Isolation model | RLS-first plus API checks | Defense-in-depth reduces cross-user data exposure risk | Plan |
| Migration strategy | Reversible, expand/contract-oriented rollout | Data rollback risk is material and must be controlled from first migration | Plan |
| Error contract | JSON error payloads with stable error codes | Improves testability and future UI integration consistency | Plan |
| Auth failure semantics | Strict 401/403 responses | Keeps API semantics explicit and security behavior auditable | Plan |
| Deletion behavior | Soft delete via `deleted_at` | Supports safer recovery and operational rollback scenarios | Plan |
| Test baseline | SQL policy tests + API integration smoke | Protects highest-risk area (ownership/security) with minimal overhead | Plan |
| Observability baseline | Structured logs for auth and recipe operations | Enables debugging and incident triage without full metrics stack | Plan |

## Scope

**In scope:**
- Recipe domain schema and relational ingredient linkage
- User ownership enforcement via RLS policies
- Minimal recipes CRUD API with validation and stable JSON errors
- Soft delete behavior and default filtering
- SQL policy verification + API smoke tests
- Lightweight p95 read/list performance check

**Out of scope:**
- Meal plan generation logic
- Shopping list generation/splitting
- Recipe recommendation engine
- Advanced filtering/sorting/search UX
- Multi-role auth model
- Full metrics/alerting platform rollout

## Architecture / Approach

Implement in three ordered layers: data foundation first (schema, indexes, RLS), then service/API contract layer, then verification and hardening. Endpoint exposure follows successful policy validation, so no recipe route becomes active before ownership guarantees are proven. This keeps the foundation secure while staying MVP-lean.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Domain Schema and RLS Baseline | Core tables, ownership policies, soft delete, shared types | Incorrect or incomplete policies causing data exposure |
| 2. Recipes API Contracts and Service Integration | Minimal CRUD API with strict auth/ownership and stable errors | Inconsistent API semantics or validation gaps |
| 3. Verification, Observability, and Performance Guardrails | SQL/API checks, structured logs, p95 validation, rollback confidence | Insufficient verification leading to regressions in later slices |

**Prerequisites:** Existing auth flow and middleware user context remain the canonical identity source.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Supabase policy test workflow is available in local/CI-capable environment.
- Cloudflare Worker runtime compatibility remains stable for chosen validation/testing utilities.
- Representative MVP dataset for performance check is defined consistently during implementation.

## Success Criteria (Summary)

- User A cannot read or mutate User B recipes at DB and API levels.
- Minimal recipes CRUD works end-to-end for authenticated users with stable JSON error semantics.
- Verification suite and performance guardrail pass, and migration rollback path is documented and executable.
