---
date: 2026-06-25T00:00:00+02:00
researcher: GitHub Copilot
git_commit: abb24812292a884b5a7cd173a544b7d44058598f
branch: main
repository: meal_planner_10xdevs
topic: "Recipe domain atomicity and IDOR baseline — test infrastructure research for §3 Phase 1"
tags: [research, codebase, recipes, atomicity, idor, rls, vitest, supabase]
status: complete
last_updated: 2026-06-25
last_updated_by: GitHub Copilot
---

# Research: Recipe domain atomicity and IDOR baseline

**Date**: 2026-06-25T00:00:00+02:00
**Researcher**: GitHub Copilot
**Git Commit**: `abb24812292a884b5a7cd173a544b7d44058598f`
**Branch**: main
**Repository**: meal_planner_10xdevs

## Research Question

Research the live codebase to support writing integration tests for §3 Phase 1 of the test plan rollout: prove that recipe create/update/delete are transactionally consistent (R1) and that cross-user access is blocked at the HTTP boundary (R3). Identify exact file:line anchors for the atomicity break, the IDOR protection stack, and the existing test infrastructure.

---

## Summary

**R1 — Atomicity:** `createRecipe` makes two independent Supabase calls. If the ingredient insert fails, the recipe row is already committed and the function returns `{ data: recipe, error: ingError }` — both non-null simultaneously. The POST handler guard `if (error || !data)` fires the error path but cannot un-commit the recipe: an orphan row persists in the database. `updateRecipe` is correctly atomic via an RPC. No `create_recipe_with_ingredients` RPC exists yet; one unused `replace_recipe_ingredients` RPC exists in migrations but is never called.

**R3 — IDOR:** Middleware only guards page routes (`/dashboard`, `/recipes`). API routes under `/api/recipes/**` are not in `PROTECTED_ROUTES`, so middleware performs no auth redirect for them. Each API handler independently enforces authentication via `getUserContext()` (returns 401 if no user) and passes `userId` to every service call. Service queries all filter by `.eq("user_id", userId)`. RLS policies cover all four CRUD operations on both `recipes` and `recipe_ingredients`. HTTP handlers return 403 — not 404 — on ownership failure, preventing user enumeration. The HTTP-level protection chain works, but relies on every handler calling `getUserContext()` correctly rather than a blanket middleware guarantee.

**Test infrastructure:** Tests mock the Supabase client and service layer with `vi.mock()` and call handlers directly via a constructed Astro context object. There is no HTTP-level mocking, no two-user fixture, no global test setup file, and no test script wired under `npm test`. The `buildContext()` helper accepts an optional `userId` (defaults to `TEST_USER_ID`; `null` triggers the 401 path).

---

## Detailed Findings

### R1 — Non-atomic createRecipe

- [src/lib/services/recipes.ts:48–57](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L48-L57) — First Supabase call: `INSERT INTO recipes`. Commits immediately on success; no surrounding transaction.
- [src/lib/services/recipes.ts:63–76](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L63-L76) — Second Supabase call: `INSERT INTO recipe_ingredients`. Separate round-trip; no rollback of the first call if this fails.
- [src/lib/services/recipes.ts:79](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L79) — **The atomicity break**: `return { data: recipe as Recipe, error: ingError }`. Both `data` and `error` are non-null. Caller sees a mixed state.
- [src/pages/api/recipes/index.ts:73–74](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/index.ts#L73-L74) — POST handler guard: `if (error || !data)`. With the mixed return, `error` is truthy so the error path runs — but the orphan recipe row was already committed. The handler returns a non-2xx response while the DB contains the ghost recipe.
- [src/lib/services/recipes.ts:59–61](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L59-L61) — Recipe-level error guard: returns `{ data: null, error: recipeError }` cleanly if the first insert fails. This path is clean; only the two-step path (recipe succeeds, ingredients fail) produces the mixed state.

#### Atomic update (reference model for the fix)

- [src/lib/services/recipes.ts:102–107](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L102-L107) — `updateRecipe` delegates to `supabase.rpc("update_recipe_with_ingredients", {...})`.
- [supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql:25–65](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql#L25-L65) — PL/pgSQL function: UPDATE recipes → DELETE old ingredients → INSERT new ingredients, all in one PostgreSQL transaction. This is the proven pattern the create path should mirror.

#### Unused RPC

- [supabase/migrations/20260528000000_replace_recipe_ingredients_rpc.sql:8–10](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260528000000_replace_recipe_ingredients_rpc.sql#L8-L10) — `replace_recipe_ingredients(p_recipe_id uuid, p_ingredients jsonb) RETURNS void`. Never called by any application code. Was likely pre-staged for the atomicity fix but not wired up.
- No `create_recipe_with_ingredients` RPC exists in any migration. Adding one is the recommended fix (impl-review F1, Fix A).

---

### R3 — Cross-user IDOR at the HTTP boundary

#### Middleware coverage

- [src/middleware.ts:3](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/middleware.ts#L3) — `const PROTECTED_ROUTES = ["/dashboard", "/recipes"];` — page routes only.
- [src/middleware.ts:19–23](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/middleware.ts#L19-L23) — Middleware redirects unauthenticated requests **only** for routes listed in `PROTECTED_ROUTES`. Routes outside the list receive no redirect; `context.locals.user` is set but auth is not enforced at this layer.
- **Gap**: `/api/recipes/**` is not in `PROTECTED_ROUTES`. Middleware does not block unauthenticated API requests. Each API handler must enforce its own auth check.

#### Per-handler auth enforcement

- [src/pages/api/recipes/[id].ts:42–47](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L42-L47) — `getUserContext()` in the GET handler returns 401 if `context.locals.user` is null.
- [src/pages/api/recipes/[id].ts:65](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L65) — GET: calls `getRecipe(auth.supabase, auth.userId, recipeId)` — userId is always from the validated session.
- [src/pages/api/recipes/[id].ts:68–72](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L68-L72) — Returns 403 "FORBIDDEN" with log "Recipe does not belong to user or does not exist" when `!data`. No 404 path — prevents user enumeration.
- [src/pages/api/recipes/[id].ts:100–105](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L100-L105) — PATCH: same auth + ownership pattern.
- [src/pages/api/recipes/[id].ts:122](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L122) — PATCH: `updateRecipe(auth.supabase, auth.userId, recipeId, parsed.data)`.
- [src/pages/api/recipes/[id].ts:132–137](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L132-L137) — PATCH: returns 403 if `!data`.
- [src/pages/api/recipes/[id].ts:152–155](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L152-L155) — DELETE: same pattern.
- [src/pages/api/recipes/[id].ts:171](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L171) — DELETE: `deleteRecipe(auth.supabase, auth.userId, recipeId)`.
- [src/pages/api/recipes/[id].ts:179–184](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/[id].ts#L179-L184) — DELETE: returns 403 if `!data`.

#### Service-layer ownership filters

- [src/lib/services/recipes.ts:24–31](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L24-L31) — `getRecipe`: `.eq("user_id", userId)` explicit filter + `.single()`.
- [src/lib/services/recipes.ts:80–96](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L80-L96) — `updateRecipe` non-RPC path: `.eq("user_id", userId)` + `.is("deleted_at", null)` + `.single()`.
- [src/lib/services/recipes.ts:80–86](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L80-L86) — `updateRecipe` RPC path: ownership NOT explicitly filtered in service code. RPC must enforce it internally via the Supabase JWT (`auth.uid()`). RLS is the safety net here.
- [src/lib/services/recipes.ts:119–130](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L119-L130) — `deleteRecipe` (soft-delete): `.eq("user_id", userId)` + `.is("deleted_at", null)` + `.single()`.

#### RLS policies

- [supabase/migrations/20260527000000_recipe_domain_base.sql:45–60](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260527000000_recipe_domain_base.sql#L45-L60) — `recipes` table: `recipes_select_own`, `recipes_insert_own`, `recipes_update_own`, `recipes_delete_own`. All require `auth.uid() = user_id`. Full CRUD coverage.
- [supabase/migrations/20260527000000_recipe_domain_base.sql:89–120](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260527000000_recipe_domain_base.sql#L89-L120) — `recipe_ingredients` table: all four policies use an `EXISTS` join back to `recipes.user_id`. Inherits parent ownership correctly.
- [supabase/tests/recipe_rls.sql:62–148](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/tests/recipe_rls.sql#L62-L148) — pgTAP tests cover SELECT allow/deny, INSERT, UPDATE, and `recipe_ingredients` isolation. DELETE cross-user coverage exists but only asserts "0 rows affected", not a hard error (line 173).

#### Supabase client / JWT forwarding

- [src/lib/supabase.ts:5–18](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/supabase.ts#L5-L18) — Uses `createServerClient` with cookie-based JWT forwarding (`getAll`/`setAll`). The user's JWT is passed to every query, enabling RLS to evaluate `auth.uid()` correctly.

---

### Test Infrastructure

- [vitest.config.ts](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/vitest.config.ts) — `environment: "node"`, `@` alias → `src/`. No setupFiles, no globalSetup, no Supabase fixture configuration.
- [src/pages/api/recipes.test.ts:14–16](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L14-L16) — `vi.mock("@/lib/supabase")` — Supabase client mocked at module level.
- [src/pages/api/recipes.test.ts:18–24](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L18-L24) — `vi.mock("@/lib/services/recipes")` — all five service functions mocked. Tests do not reach the database.
- [src/pages/api/recipes.test.ts:33](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L33) — `TEST_USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"` — single test user UUID constant.
- [src/pages/api/recipes.test.ts:37–53](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L37-L53) — `buildContext({ method, body, params, userId, cookies })` — constructs an Astro `APIContext` substitute. `userId: null` produces the unauthenticated path; `userId: "some-id"` produces the authenticated path.
- [src/pages/api/recipes.test.ts:50](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L50) — `userId` param defaults to `TEST_USER_ID` if not provided.
- No two-user fixture exists. To test cross-user IDOR, a second user context (`ATTACKER_USER_ID`) must be added.
- [src/pages/api/recipes.test.ts:331](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L331) — Existing ownership test: mock returns `{ data: null, error: null }` (simulates RLS/service returning no row); asserts HTTP 403. Pattern to extend for cross-user IDOR test.
- [package.json:8–9](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/package.json#L8-L9) — `"test:smoke"` and `"test:integration"` scripts exist; no generic `test` script. No MSW, no supertest, no `@testing-library` in dependencies.

---

## Code References

- [`src/lib/services/recipes.ts:48–79`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L48-L79) — Non-atomic createRecipe: two-step insert with mixed return on ingredient failure
- [`src/pages/api/recipes/index.ts:73–74`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/index.ts#L73-L74) — POST handler guard; fires on ingredient error but orphan recipe is already committed
- [`supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql:25–65`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql#L25-L65) — Atomic update RPC: reference model for `create_recipe_with_ingredients`
- [`supabase/migrations/20260528000000_replace_recipe_ingredients_rpc.sql:8–10`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260528000000_replace_recipe_ingredients_rpc.sql#L8-L10) — Unused RPC; never called; potentially pre-staged for atomicity fix
- [`src/middleware.ts:3`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/middleware.ts#L3) — PROTECTED_ROUTES; does not cover API routes
- [`src/middleware.ts:19–23`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/middleware.ts#L19-L23) — Middleware redirect logic; allowlist model
- [`src/pages/api/recipes/[id].ts:42–47`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/%5Bid%5D.ts#L42-L47) — `getUserContext()` auth enforcement in each handler
- [`src/pages/api/recipes/[id].ts:68–72`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes/%5Bid%5D.ts#L68-L72) — 403 ownership failure path (GET)
- [`supabase/migrations/20260527000000_recipe_domain_base.sql:45–60`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260527000000_recipe_domain_base.sql#L45-L60) — RLS: recipes table; full CRUD coverage
- [`supabase/migrations/20260527000000_recipe_domain_base.sql:89–120`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/migrations/20260527000000_recipe_domain_base.sql#L89-L120) — RLS: recipe_ingredients; EXISTS-join inheritance
- [`supabase/tests/recipe_rls.sql:62–173`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/tests/recipe_rls.sql#L62-L173) — pgTAP RLS coverage; DELETE cross-user gap at line 173
- [`src/pages/api/recipes.test.ts:37–53`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L37-L53) — `buildContext()` — extend for two-user fixture
- [`src/pages/api/recipes.test.ts:331`](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/pages/api/recipes.test.ts#L331) — Existing ownership 403 test; template for IDOR cross-user extension

---

## Architecture Insights

**Defense-in-depth stack for ownership (R3):** Three independent layers enforce user isolation: (1) service-layer `.eq("user_id", userId)` filters, (2) RLS policies evaluated by Supabase on every query, (3) HTTP handlers check `!data` and return 403. Any single layer failing leaves two others. The weakest link is the per-handler auth model: middleware does not provide a blanket guarantee, so every new API route must call `getUserContext()` or the API will silently accept unauthenticated requests.

**Mocking strategy (test infrastructure):** Tests mock at the service boundary (`vi.mock("@/lib/services/recipes")`), not at the HTTP or database level. This is fast and avoids Supabase network calls, but means: (a) tests cannot detect the R1 atomicity bug — they test the handler's response to a mocked service return, not the service's actual Supabase behavior; (b) to test IDOR at the HTTP boundary with cross-user data, the test must configure two separate mock contexts rather than seeding two real users. The existing `buildContext(userId)` pattern is the right extension point.

**Pattern asymmetry (R1):** `createRecipe` and `updateRecipe` share the same service file but have opposite atomicity: update is atomic (RPC-backed), create is not. The `replace_recipe_ingredients` RPC in migration `20260528000000` appears to be a stepping stone toward fixing this — it is the right shape but was never wired into `createRecipe`. A new `create_recipe_with_ingredients` migration (modeled on `20260528000001`) is the canonical fix path.

**No HTTP mocking library:** The absence of MSW or fetch-level mocking means integration tests that need to simulate Supabase partial failures (e.g., ingredient insert fails while recipe insert succeeds) must do so by configuring mock service return values — not by intercepting network calls. For R1, the test should mock `createRecipe` to return `{ data: recipe, error: ingError }` and assert that the POST handler returns a non-2xx status. The actual DB-level orphan scenario is a concern for SQL-level pgTAP tests, not Vitest handler tests.

---

## Historical Context (from prior changes)

- [context/changes/data-ownership-and-recipe-domain-base/plan.md](../data-ownership-and-recipe-domain-base/plan.md) — F-01 implementation plan that produced the current non-atomic `createRecipe`; the two-step insert was the original implementation choice.
- [context/changes/data-ownership-and-recipe-domain-base/reviews/impl-review.md](../data-ownership-and-recipe-domain-base/reviews/impl-review.md) — F1 (orphan recipe) and F2 (silent success) findings both `Decision: PENDING` at time of writing this research. F3 identifies `replace_recipe_ingredients` as dead code. F6 identifies an unreachable null check in `[id].ts` post-`validateRecipeId`. All findings are relevant to test scope.

---

## Related Research

No other research artifacts exist in `context/changes/**/` or `context/archive/**/` at this time.

---

## Open Questions

1. **Does `update_recipe_with_ingredients` RPC enforce `auth.uid()` internally?** The service code does not pass `user_id` explicitly to the RPC call ([services/recipes.ts:102–107](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/src/lib/services/recipes.ts#L102-L107)). The RPC must rely on `auth.uid()` via the Supabase JWT context, which only works correctly if the SSR client (not service-role key) is used. Confirm in `src/lib/supabase.ts` which key is in use at runtime.

2. **Is `SUPABASE_KEY` the anon key or the service-role key in the SSR client?** If service-role, RLS is bypassed and the HTTP-layer `.eq("user_id", userId)` filter is the only ownership enforcement. This changes the risk severity of R3 and the test assertions needed.

3. **Should the R1 atomicity fix (new create RPC) be part of this Phase 1 change, or is Phase 1 strictly about writing tests that prove the bug and the fix happens separately?** The test plan does not specify; the impl-review left it `PENDING`.

4. **Can the pgTAP DELETE cross-user test at [supabase/tests/recipe_rls.sql:173](https://github.com/Marroz12/meal_planner_10xdevs/blob/abb24812292a884b5a7cd173a544b7d44058598f/supabase/tests/recipe_rls.sql#L173) be hardened to assert a hard error rather than `0 rows affected`?** The current assertion is weaker than the SELECT and INSERT equivalents.
