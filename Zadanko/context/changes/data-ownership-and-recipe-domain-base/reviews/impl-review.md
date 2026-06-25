<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-01 Foundation: Recipe Domain Model and User Data Isolation Implementation Plan

- **Plan**: context/changes/data-ownership-and-recipe-domain-base/plan.md
- **Scope**: All 3 Phases
- **Date**: 2026-06-24
- **Verdict**: REJECTED
- **Findings**: 2 critical · 4 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Non-atomic createRecipe: orphan recipe on ingredient failure

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recipes.ts:48–80
- **Detail**: createRecipe runs two independent queries: INSERT into recipes, then INSERT into recipe_ingredients. If the ingredient insert fails, the recipe row already exists in the database (orphaned, with no ingredients) and the function returns `{ data: recipe, error: ingError }` — a mixed state where both data and error are non-null. The plan specified consistent state across all service paths; a ghost recipe record violates that. By contrast, updateRecipe correctly delegates to the update_recipe_with_ingredients RPC (migration 20260528000001) which wraps both operations atomically in PL/pgSQL.
- **Fix A ⭐ Recommended**: Add a create_recipe_with_ingredients RPC and delegate to it from createRecipe when ingredients are present.
  - Strength: Mirrors the existing update RPC pattern already in the codebase; atomicity is enforced at the DB level, not dependent on application-layer error handling.
  - Tradeoff: Requires a new migration; minor delay.
  - Confidence: HIGH — the update RPC already proves this pattern works in this codebase.
  - Blind spot: None significant.
- **Fix B**: Delete the orphan recipe when ingredient insert fails.
  - Strength: No new migration needed; pure TypeScript fix.
  - Tradeoff: Compensating transaction at app layer is fragile — the delete can also fail (network error), leaving the orphan anyway. Adds a third I/O hop.
  - Confidence: LOW — does not fully guarantee atomicity.
  - Blind spot: Race conditions during the delete window.
- **Decision**: PENDING

### F2 — POST /api/recipes silently succeeds on ingredient failure

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipes/index.ts:72
- **Detail**: The POST handler checks `if (error || !data)` to detect failure. When createRecipe returns `{ data: recipe, error: ingError }` on ingredient failure, this guard evaluates to false (data is non-null), so the handler logs "success" and returns HTTP 201 — even though the recipe was persisted without its ingredients. The client receives a success response for a broken state.
- **Fix**: Change the guard to `if (error)` (check error independently of data), so any non-null error from the service triggers the error path. No structural change needed — one-line fix while F1 is being addressed.
- **Decision**: PENDING

### F3 — Unused replace_recipe_ingredients RPC migration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260528000000_replace_recipe_ingredients_rpc.sql
- **Detail**: Migration 20260528000000 adds a replace_recipe_ingredients RPC that was not in the plan. It is never called by any application code. Dead DB code shipped as a migration: it cannot be safely dropped without a new migration, and future agents may inadvertently start using it thinking it's established convention.
- **Fix A ⭐ Recommended**: Document intent in the plan as an addendum — if this RPC was pre-staged to fix F1 (atomicity), document that so future agents know its purpose.
  - Strength: Makes the strategy explicit; prevents confusion about the RPC's origin.
  - Tradeoff: Plan becomes slightly out of date until updated.
  - Confidence: HIGH — the RPC is clearly related to the plan's ingredient management scope.
  - Blind spot: None significant.
- **Fix B**: Add a new migration to drop the unused RPC.
  - Strength: Clean DB schema; no dead code.
  - Tradeoff: Loses the RPC if it was intentional scaffolding for the F1 atomicity fix.
  - Confidence: MEDIUM — depends on whether F1 fix will use it.
  - Blind spot: Not clear if author intended it as F1 scaffolding.
- **Decision**: PENDING

### F4 — Unbounded ingredient fetch in listRecipes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recipes.ts:17
- **Detail**: listRecipes fetches `select("*, recipe_ingredients(*)")` with no ingredient limit. With many recipes × many ingredients per recipe, the full payload is fetched and serialized in one call. No pagination exists on this endpoint.
- **Fix A ⭐ Recommended**: Cap inline ingredients on list route (summary view) and return full ingredients only on GET /api/recipes/[id].
  - Strength: Matches common list/detail API pattern; the [id] route already exists and fetches the full record. Keeps list response lean for dashboard view.
  - Tradeoff: UI must make a second call for full ingredient detail. Minor refactor of RecipeCard component.
  - Confidence: HIGH — consistent with REST conventions and the roadmap's minimal CRUD contract intent.
  - Blind spot: Need to verify RecipeCard actually uses ingredients in the list view.
- **Fix B**: Add offset-based pagination to GET /api/recipes.
  - Strength: Scales list without changing the response shape.
  - Tradeoff: No UI pagination exists yet; adds scope to S-01.
  - Confidence: MEDIUM — roadmap doesn't mention pagination at this milestone.
  - Blind spot: Pagination UX needs product decision.
- **Decision**: PENDING

### F5 — Perf check silently continues on failed user seed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/recipes-perf-check.ts:44
- **Detail**: The perf check tries create_perf_test_user RPC, falls back to profiles.upsert(), and if both fail emits console.warn and continues. If seeding silently fails, the benchmark runs against zero rows — making all p95 results trivially pass and the check worthless as a guard.
- **Fix**: Replace `console.warn + continue` with `process.exit(1)` when both seed paths fail.
- **Decision**: PENDING

### F6 — Redundant null check after validateRecipeId

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes/[id].ts:56–61
- **Detail**: After validateRecipeId succeeds (idCheck.response is null), there's an additional `if (!recipeId)` guard that is unreachable — the validator already guarantees recipeId is non-null on the success path. Dead branch that misleads future readers about control flow.
- **Fix**: Remove the unreachable `if (!recipeId)` block.
- **Decision**: PENDING

### F7 — Two overlapping test files with no documented split rationale

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes.test.ts / src/pages/api/recipes.api.smoke.test.ts
- **Detail**: Both files test the same API surface. recipes.test.ts (201 lines) covers utilities + full contract including edge cases. recipes.api.smoke.test.ts (54 lines) covers a basic subset. The plan specified only one test file. Future agents will not know which file is authoritative or why both exist.
- **Fix**: Add a one-line comment at the top of recipes.api.smoke.test.ts explaining the split rationale (e.g., "quick smoke suite run in pre-deploy gate; full contract tests in recipes.test.ts").
- **Decision**: PENDING
