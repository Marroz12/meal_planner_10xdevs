# F-01 Foundation: Recipe Domain Model and User Data Isolation Implementation Plan

## Overview

Implement a secure, minimal domain foundation for personal recipes by adding relational schema, user-level isolation, and minimal recipes CRUD API. This phase is the load-bearing base that unblocks S-01/S-02/S-03 while minimizing rework risk.

## Current State Analysis

The scaffold has authentication and protected route middleware, but no recipe domain schema, no domain API endpoints, and no ownership enforcement for recipe data. The project is SSR on Cloudflare with Supabase auth client wiring already present.

## Desired End State

A logged-in user can create, list, update, and soft-delete only their own recipes through a minimal API contract. Database schema and RLS enforce isolation by default, and verification covers policy behavior and API smoke scenarios.

### Key Discoveries:

- Supabase SSR client is already centralized in `.bootstrap-scaffold/src/lib/supabase.ts:5` and should stay the single source for server auth context.
- Request auth context is resolved in middleware and attached at `.bootstrap-scaffold/src/middleware.ts:13`, giving a stable user context source for domain API checks.
- Runtime is server SSR with Cloudflare adapter (`.bootstrap-scaffold/astro.config.mjs:11` and `.bootstrap-scaffold/astro.config.mjs:16`), so API behavior must remain Worker-compatible.
- Current codebase has only auth API routes under `.bootstrap-scaffold/src/pages/api/auth/`, so recipes API conventions must be introduced explicitly.

## What We're NOT Doing

- No meal-plan generation logic (S-02) in this change.
- No shopping-list aggregation logic (S-02) in this change.
- No recipe suggestion engine (S-03) in this change.
- No advanced recipe search/sort/filter UX beyond minimal CRUD contract.
- No multi-role authorization model; MVP remains flat user model.
- No full observability platform rollout; only minimal structured logs for domain operations.

## Implementation Approach

Adopt an RLS-first architecture with API-layer contract checks. Build schema and policies first (expand/contract style, reversible migration intent), then add a minimal service/API layer for recipes with stable JSON error codes and strict auth semantics (401/403). Close with policy and integration smoke verification plus lightweight performance checks for typical MVP data volume.

## Critical Implementation Details

Non-obvious ordering requirement: enable and validate RLS policies before exposing any recipes endpoint in production flow; endpoint rollout should follow successful policy verification to avoid accidental broad reads. Soft delete (`deleted_at`) must be treated as a first-class invariant in all list/read/update paths from the beginning to avoid inconsistent behavior across later slices. `SUPABASE_KEY` must remain the anon key; using the service_role key bypasses all RLS policies and silently breaks user data isolation.

## Phase 1: Domain Schema and RLS Baseline

### Overview

Create the recipe-domain persistence baseline with relational tables, soft-delete support, and strict per-user data isolation policies.

### Changes Required:

#### 1. Supabase Migrations

**File**: `.bootstrap-scaffold/supabase/migrations/<timestamp>_recipe_domain_base.sql`

**Intent**: Add foundational relational structures required by FR-001 and security constraints from NFR-02, with explicit policy enforcement.

**Contract**: Introduce `recipes` and `recipe_ingredients` with ownership (`user_id`), lifecycle timestamps (`created_at`, `updated_at`, `deleted_at`), foreign keys, indexes for typical per-user listing, and RLS policies for select/insert/update/delete constrained to authenticated owner. Include inline rollback steps at the top of the migration file (DROP POLICY, DROP TABLE in reverse order) so the rollback checklist lives next to the migration it reverses.

#### 2. Shared Domain Types

**File**: `.bootstrap-scaffold/src/types.ts`

**Intent**: Establish a stable typed contract used by API and service layers for recipe entities and payloads.

**Contract**: Define core domain and DTO types for recipe records, ingredient records, create/update payloads, and API response envelope with typed error code field.

#### 3. Data Access Service

**File**: `.bootstrap-scaffold/src/lib/services/recipes.ts`

**Intent**: Centralize recipe persistence behavior so API routes remain thin and policy-consistent.

**Contract**: Expose methods for list/create/update/soft-delete that always scope operations by authenticated user id and respect soft-delete filtering.

### Success Criteria:

#### Automated Verification:

- Migration applies in local/dev environment without SQL errors.
- RLS policies deny cross-user read/update/delete in policy verification scenarios.
- Type checking passes for added shared types and service contracts.
- Linting passes for new migration metadata and TypeScript files.

#### Manual Verification:

- Two separate test users cannot access each other's recipes through direct query/API attempts.
- Soft-deleted recipe is no longer returned in default user recipe listing.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Recipes API Contracts and Service Integration

### Overview

Expose a minimal recipes CRUD API that enforces strict auth behavior and stable JSON error contracts.

### Changes Required:

#### 1. Recipes API Endpoints

**File**: `.bootstrap-scaffold/src/pages/api/recipes/index.ts`

**Intent**: Handle collection-level operations (list all user recipes, create new recipe).

**Contract**: Export GET (list) and POST (create) handlers backed by recipe service methods, returning JSON payloads with stable error codes and strict 401/403 behavior for auth/ownership failures.

**File**: `.bootstrap-scaffold/src/pages/api/recipes/[id].ts`

**Intent**: Handle per-recipe operations (read, update, soft-delete) using Astro dynamic route segment for recipe ID.

**Contract**: Export GET (read), PATCH (update), and DELETE (soft-delete) handlers scoped to the authenticated user's ownership of the target recipe, returning JSON payloads with stable error codes and strict 401/403 behavior.

#### 2. Request Validation Schema

**File**: `.bootstrap-scaffold/src/lib/validation/recipes.ts`

**Intent**: Prevent malformed payloads and align with repository API validation conventions.

**Contract**: Define request validation schemas for create/update/delete operations and a normalized validation-error mapping to API error code responses.

#### 3. API Error and Logging Utilities

**File**: `.bootstrap-scaffold/src/lib/api/errors.ts`

**Intent**: Keep endpoint behavior consistent for error semantics and observability.

**Contract**: Provide reusable helpers for domain error code mapping, JSON error response formatting, and structured event logging fields for auth decision + recipe operation outcome (without sensitive payloads).

### Success Criteria:

#### Automated Verification:

- API smoke tests pass for authenticated create/list/update/delete happy paths.
- API smoke tests pass for unauthenticated (401) and unauthorized ownership scenarios (403).
- Validation failure scenarios return stable JSON error code contracts.
- Build and lint pass with new API and utility modules.

#### Manual Verification:

- Browser/manual call flow can create recipe and immediately retrieve it for same user.
- Attempts to mutate another user's recipe are blocked with expected API semantics.
- Error payloads are readable and actionable in UI/network inspection.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Verification, Observability, and Performance Guardrails

### Overview

Finalize confidence in safety and operability with policy checks, integration verification, and lightweight performance budget validation.

### Changes Required:

#### 1. Policy and Integration Verification Assets

**File**: `.bootstrap-scaffold/supabase/tests/recipe_rls.sql`

**Intent**: Lock in ownership guarantees as executable verification rather than ad-hoc manual checks.

**Contract**: Add repeatable SQL-level verification cases proving same-user allow and cross-user deny behavior across CRUD actions.

#### 2. API Integration Test Harness

**File**: `.bootstrap-scaffold/src/pages/api/recipes.test.ts`

**Intent**: Ensure minimal API contract stability for future slices.

**Contract**: Cover happy path, validation failures, and ownership/auth failures with deterministic assertions on status codes and JSON error code fields.

#### 3. Lightweight Performance Check Script

**File**: `.bootstrap-scaffold/scripts/recipes-perf-check.ts`

**Intent**: Validate initial p95 read/list budget for typical MVP data to catch indexing/query issues early.

**Contract**: Provide a reproducible local benchmark/smoke script and report output suitable for confirming p95 list/read under 300 ms target for representative user dataset.

### Success Criteria:

#### Automated Verification:

- SQL policy tests pass for allow/deny matrix.
- Recipes API integration smoke suite passes in CI-capable local setup.
- Perf check reports list/read p95 within target for representative data size.
- `npm run lint` and `npm run build` pass after test and script additions.

#### Manual Verification:

- Logs include structured auth-operation and recipe-operation events for key API actions.
- Human reviewer can execute rollback checklist for migration and confirm expected reversal path.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Validation schema behavior for required and malformed payload fields.
- Error-mapping helpers returning stable domain error codes.
- Service-layer soft-delete filtering behavior.

### Integration Tests:

- Authenticated user CRUD lifecycle on own recipe.
- Cross-user access denial across read/update/delete paths.
- API response semantics for 401, 403, and validation errors.

### Manual Testing Steps:

1. Sign in as user A, create recipe, verify list visibility only for user A.
2. Sign in as user B, attempt read/update/delete of user A recipe, verify denial.
3. Soft-delete recipe as user A and verify default listing excludes deleted record.
4. Run performance check with representative recipe count and review p95 output.

## Performance Considerations

- Add per-user indexes aligned with list/read patterns to avoid early p95 regressions.
- Keep initial API shape minimal to reduce serialization overhead.
- Validate read/list p95 target (<300 ms) on representative MVP dataset before marking F-01 complete.

## Migration Notes

- Use expand/contract mindset: additive-safe schema first, policy hardening, then endpoint exposure.
- Keep migration steps operationally reversible where feasible; document rollback sequence explicitly.
- Do not couple irreversible data transformations with first endpoint release.

## References

- Product requirements: `context/foundation/prd.md`
- Roadmap dependency and F-01 scope: `context/foundation/roadmap.md`
- Repository rules: `AGENTS.md`
- Auth client pattern: `.bootstrap-scaffold/src/lib/supabase.ts:5`
- Request user context pattern: `.bootstrap-scaffold/src/middleware.ts:13`
- Runtime deployment constraints: `.bootstrap-scaffold/astro.config.mjs:11`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain Schema and RLS Baseline

#### Automated

- [x] 1.1 Migration applies in local/dev environment without SQL errors — db35219
- [x] 1.2 RLS policies deny cross-user read/update/delete in policy verification scenarios — db35219
- [x] 1.3 Type checking passes for added shared types and service contracts — db35219
- [x] 1.4 Linting passes for new migration metadata and TypeScript files — db35219

#### Manual

- [x] 1.5 Two separate test users cannot access each other's recipes through direct query/API attempts — db35219
- [x] 1.6 Soft-deleted recipe is no longer returned in default user recipe listing — db35219

### Phase 2: Recipes API Contracts and Service Integration

#### Automated

- [x] 2.1 API smoke tests pass for authenticated create/list/update/delete happy paths — cc6313b
- [x] 2.2 API smoke tests pass for unauthenticated and unauthorized ownership scenarios — cc6313b
- [x] 2.3 Validation failure scenarios return stable JSON error code contracts — cc6313b
- [x] 2.4 Build and lint pass with new API and utility modules — cc6313b

#### Manual

- [x] 2.5 Browser/manual call flow can create recipe and immediately retrieve it for same user — cc6313b
- [x] 2.6 Attempts to mutate another user's recipe are blocked with expected API semantics — cc6313b
- [x] 2.7 Error payloads are readable and actionable in UI/network inspection — cc6313b

### Phase 3: Verification, Observability, and Performance Guardrails

#### Automated

- [x] 3.1 SQL policy tests pass for allow/deny matrix — 4858727
- [x] 3.2 Recipes API integration smoke suite passes in CI-capable local setup — 4858727
- [x] 3.3 Perf check reports list/read p95 within target for representative data size — 4858727
- [x] 3.4 npm run lint and npm run build pass after test and script additions — 4858727

#### Manual

- [x] 3.5 Logs include structured auth-operation and recipe-operation events for key API actions — 4858727
- [x] 3.6 Human reviewer can execute rollback checklist for migration and confirm expected reversal path — 4858727
