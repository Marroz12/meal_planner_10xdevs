<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01: User Manages Personal Recipe Base — Implementation Plan

- **Plan**: context/changes/personal-recipe-base-management/plan.md
- **Scope**: Phase 1-3 of 3 (full implementation review; manual checks still pending in Progress)
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verification Evidence

### Automated (requested in plan)

- `npm run build`: **PASS**
  - Evidence (truncated): `astro build` completed with `Server built` and `Complete!`.
- `npm run lint`: **FAIL**
  - Evidence (truncated): ESLint crash
    - `Error: Non-null Assertion Failed: Expected node to have a parent.`
    - `Occurred while linting .../src/pages/recipes/new.astro:7`
    - `Rule: @typescript-eslint/no-misused-promises`
- `npx astro sync && npx tsc --noEmit`: **PARTIAL / MIXED**
  - `tsc --noEmit`: observed `TSC_EXIT:0`.
  - `astro sync`: command invocation produced startup logs in terminal, but terminal output was unstable in this session and did not return a reliable explicit exit marker.

### Manual

Manual verification checkboxes in plan `## Progress` are still unchecked for all 3 phases (expected at this stage, but no manual evidence to validate those criteria yet).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — PATCH update can partially succeed when ingredient replacement fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: .bootstrap-scaffold/src/lib/services/recipes.ts:98
- **Detail**: In `updateRecipe`, scalar recipe fields are updated first (lines ~98-105), then ingredient replacement RPC runs (lines ~109-116). If RPC fails, API returns an error but scalar changes remain persisted. This creates partial success for a single edit intent and can surprise clients/users.
- **Fix A ⭐ Recommended**: Make edit write path atomic end-to-end by moving both scalar update and ingredient replacement into one DB RPC transaction.
  - Strength: Eliminates partial-success class entirely; strongest consistency model.
  - Tradeoff: Larger refactor (new RPC contract + service/API adjustments).
  - Confidence: MEDIUM — technically straightforward, but wider blast radius.
  - Blind spot: Not yet validated against existing API callers and tests.
- **Fix B**: Keep current contract but treat ingredient replacement failures as compensatable by rolling back scalar fields in app logic.
  - Strength: Smaller change than full RPC redesign.
  - Tradeoff: More fragile than single-transaction DB semantics; harder to prove correct.
  - Confidence: LOW — compensation logic is easy to get wrong.
  - Blind spot: Rollback race conditions and error-path observability.
- **Decision**: FIXED via Fix A

### F2 — Automated verification criteria not met due lint crash

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .bootstrap-scaffold/src/pages/recipes/new.astro:7
- **Detail**: `npm run lint` fails with an ESLint runtime crash (`Expected node to have a parent`) while linting `new.astro`. This means a required automated success criterion in all phases is currently not met.
- **Fix**: Adjust lint configuration/rule handling for Astro frontmatter redirect pattern (or update plugin versions) so lint runs cleanly on `new.astro` and across project.
- **Decision**: FIXED (Astro-specific rule override + local page guard comment)
