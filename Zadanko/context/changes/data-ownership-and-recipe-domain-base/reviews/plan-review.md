<!-- PLAN-REVIEW-REPORT -->
# Plan Review: F-01 Foundation — Recipe Domain Model and User Data Isolation

- **Plan**: context/changes/data-ownership-and-recipe-domain-base/plan.md
- **Mode**: Deep
- **Date**: 2026-05-27
- **Verdict**: REVISE → SOUND (after fixes)
- **Findings**: 2 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 4/4 existing paths ✓, 3/3 symbols ✓, brief↔plan ✓

## Findings

### F1 — Missing zod dependency blocks Phase 2 validation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2.2 — Request Validation Schema
- **Detail**: CLAUDE.md mandates "validate input with zod" but zod is not in package.json. Phase 2 creates src/lib/validation/recipes.ts which will fail at import time.
- **Fix**: Add zod installation step to Phase 2 prerequisites (`npm install zod`).
- **Decision**: SKIPPED

### F2 — No test runner in project; Phase 3 tests unexecutable

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3.2 — API Integration Test Harness
- **Detail**: No test runner in project (no vitest/jest/mocha in package.json, no test script). recipes.test.ts and recipes-perf-check.ts can't execute. Success criterion 3.2 is unverifiable.
- **Fix**: Add vitest setup step to Phase 3 prerequisites (`npm install -D vitest`, add test script, create vitest.config.ts).
- **Decision**: SKIPPED

### F3 — Per-recipe API route structure unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2.1 — Recipes API Endpoint
- **Detail**: Plan specified single file src/pages/api/recipes.ts for all CRUD. Astro file-based routing requires dynamic segment [id].ts for per-recipe operations. Existing auth endpoints confirm one-method-per-file pattern.
- **Fix**: Replace single-file contract with explicit two-file route split: index.ts (GET list, POST create) and [id].ts (GET read, PATCH update, DELETE soft-delete).
- **Decision**: FIXED — Phase 2.1 updated with explicit route split

### F4 — Rollback checklist promised but no phase produces it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Migration Notes + Phase 3 Manual Verification 3.6
- **Detail**: Migration Notes say "document rollback sequence explicitly." Phase 3 manual criterion 3.6 says "Human reviewer can execute rollback checklist." But no phase creates this checklist as a deliverable.
- **Fix A ⭐ Recommended**: Add rollback steps inline in Phase 1 migration.
  - Strength: Rollback lives next to the migration it reverses — single source of truth.
  - Tradeoff: Adds a few lines to Phase 1 scope.
  - Confidence: HIGH — expand/contract migrations naturally pair with their rollback.
  - Blind spot: None significant.
- **Fix B**: Create separate rollback-plan.md artifact in Phase 3.
  - Strength: Standalone checklist, easy to hand to ops.
  - Tradeoff: Separate document risks going stale.
  - Confidence: MEDIUM — separate rollback docs tend to drift.
  - Blind spot: Ownership of keeping the doc current.
- **Decision**: FIXED via Fix A — Phase 1 migration contract updated with inline rollback steps

### F5 — Anon key requirement for RLS undocumented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Critical Implementation Details
- **Detail**: The RLS strategy silently depends on SUPABASE_KEY being the anon key. If someone switches to service_role, all RLS policies are bypassed. The deployment plan confirms anon key is used, but the implementation plan didn't state this invariant.
- **Fix**: Add one sentence to Critical Implementation Details: "SUPABASE_KEY must remain the anon key; service_role bypasses all RLS policies."
- **Decision**: FIXED — Critical Implementation Details updated with anon-key invariant
