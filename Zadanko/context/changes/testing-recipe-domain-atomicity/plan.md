# Phase 1 Testing: Recipe Domain Atomicity and IDOR Baseline

> Research: `context/changes/testing-recipe-domain-atomicity/research.md`
> Test plan: `context/foundation/test-plan.md` §3 Phase 1

## Overview

Fix the non-atomic `createRecipe` bug (R1) with a new PL/pgSQL RPC, add HTTP-boundary regression tests for atomicity and cross-user IDOR (R3), harden the pgTAP DELETE cross-user assertion, and fill §6.1 and §6.2 cookbook entries in the quality contract.

## Current State Analysis

`createRecipe` in `src/lib/services/recipes.ts` makes two independent Supabase calls. If the ingredient INSERT fails, the recipe row is already committed and the function returns `{ data: recipe, error: ingError }` — both non-null simultaneously (line 79). The POST handler guard `if (error || !data)` at `src/pages/api/recipes/index.ts:73` fires the error path but cannot undo the committed recipe row: an orphan persists in the database.

`updateRecipe` is already atomic via the `update_recipe_with_ingredients` RPC (migration `20260528000001`) — this is the reference model. No `create_recipe_with_ingredients` RPC exists. An unused `replace_recipe_ingredients` RPC (migration `20260528000000`) was never wired into application code.

For R3: middleware only guards `/dashboard` and `/recipes` page routes; API routes are outside `PROTECTED_ROUTES`. Each handler independently enforces auth via `getUserContext()` and passes `userId` to every service query (`.eq("user_id", userId)`). RLS covers all CRUD on both `recipes` and `recipe_ingredients`. HTTP handlers return 403 not 404. The existing test at `recipes.test.ts:331` (mock returns null → assert 403) is the template for the two-user IDOR suite.

Two impl-review items are in scope: F2 (POST handler guard), F6 (dead branch in `[id].ts`), and F7 (missing smoke test comment).

## Desired End State

After this plan completes:
- POST `/api/recipes` either fully succeeds (recipe + ingredients persisted) or fully fails (nothing committed); no orphan recipe rows are possible.
- GET/PATCH/DELETE requests using another user's recipe ID return 403 at the HTTP boundary — proven by automated tests.
- §6.1 and §6.2 of `context/foundation/test-plan.md` are filled with the established patterns.
- §3 Phase 1 row advances to `complete`.

### Key Discoveries

- `src/lib/services/recipes.ts:48–79` — non-atomic two-step insert; line 79 is the atomicity break
- `supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql` — SECURITY INVOKER RPC using `auth.uid()` for ownership; exact pattern the new create RPC follows
- `src/pages/api/recipes/index.ts:73` — guard `if (error || !data)` must become `if (error)` (F2)
- `src/pages/api/recipes/[id].ts:63–65` — `if (!recipeId)` block is unreachable after `validateRecipeId` succeeds (F6)
- `src/pages/api/recipes.test.ts:33,37–53` — `TEST_USER_ID` + `buildContext({userId})` are the fixture extension points; line 331 is the 403 ownership test template

## What We're NOT Doing

- Not adding ingredient limits or pagination to `listRecipes` (F4 — separate concern, no product decision yet)
- Not fixing the perf script silent seed failure (F5 — Phase 3)
- Not wiring CI gates (Phase 3)
- Not dropping `replace_recipe_ingredients` RPC — it remains in the DB but stays undocumented as pre-staged scaffolding; the plan brief captures its provenance
- Not testing the `updateRecipe` RPC path's `auth.uid()` behavior (confirmed SECURITY INVOKER; covered by existing pgTAP)

## Implementation Approach

Three sequential phases. Phase 1 changes production code (migration + service + two one-liner fixes). Phase 2 adds tests using the new clean service behavior as the baseline. Phase 3 hardens the SQL test layer and closes the cookbook/orchestrator loop.

---

## Phase 1: Atomic recipe create fix

### Overview

Add a `create_recipe_with_ingredients` PL/pgSQL function, wire `createRecipe` to delegate to it when ingredients are present, fix the POST handler guard (F2), and remove the dead null-check branch in `[id].ts` (F6).

### Changes Required

#### 1. New migration — `create_recipe_with_ingredients` RPC

**File**: `supabase/migrations/20260529000000_create_recipe_with_ingredients_rpc.sql`

**Intent**: Introduce an atomic PL/pgSQL function that inserts a recipe row and its ingredient rows in a single PostgreSQL transaction. Follows the structure of `update_recipe_with_ingredients` (migration `20260528000001`) exactly: SECURITY INVOKER, `SET search_path = public`, `auth.uid()` for ownership, REVOKE/GRANT pattern.

**Contract**: Function signature and critical constraints:

```sql
-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.create_recipe_with_ingredients(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_recipe_with_ingredients(
  p_payload    jsonb,   -- { name, description?, prep_time_minutes? }
  p_ingredients jsonb   -- array of { name, quantity?, unit?, storage_type? }
) RETURNS public.recipes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
```

The function must:
1. Validate `p_payload` is a JSON object and `p_ingredients` is a JSON array (same RAISE EXCEPTION pattern as the update RPC).
2. INSERT into `public.recipes` with `user_id = auth.uid()` — do NOT accept user_id as a parameter.
3. Loop over `p_ingredients` elements and INSERT each into `public.recipe_ingredients` using `new_recipe.id` as `recipe_id`. Apply the same `NULLIF(TRIM(...), '')` normalization used in the update RPC for `description`, `quantity`, `unit`, `storage_type`.
4. Return the newly inserted `public.recipes` row.

Append at end of file:
```sql
REVOKE EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) TO authenticated;
```

---

#### 2. Refactor `createRecipe` to use the RPC when ingredients are present

**File**: `src/lib/services/recipes.ts`

**Intent**: Replace the two-step insert (recipe → ingredients) with a single `supabase.rpc("create_recipe_with_ingredients", ...)` call when `payload.ingredients` is non-empty. The no-ingredients path (direct `recipes` INSERT) stays unchanged — it is already clean and atomic.

**Contract**: The new branch inside `createRecipe` delegates to the RPC and follows the same return shape as `updateRecipe`'s RPC branch (lines 102–111):

```ts
// when payload.ingredients && payload.ingredients.length > 0:
const { data, error } = await supabase.rpc("create_recipe_with_ingredients", {
  p_payload: {
    name: payload.name,
    description: payload.description ?? null,
    prep_time_minutes: payload.prep_time_minutes ?? null,
  },
  p_ingredients: payload.ingredients,
});
if (error || !data) return { data: null, error };
return { data: data as Recipe, error: null };
```

Remove the old ingredient INSERT block entirely. The function must never again return `{ data: <non-null>, error: <non-null> }`.

---

#### 3. Fix POST handler guard (F2)

**File**: `src/pages/api/recipes/index.ts`

**Intent**: Make the POST handler's error check independent of the `data` field so that any non-null `error` from `createRecipe` triggers the error path — regardless of whether `data` is also set.

**Contract**: Change line 73 from `if (error || !data)` to `if (error)`. One character change. The `!data` clause is not needed once the service never returns mixed state; removing it also makes the intent explicit.

---

#### 4. Remove unreachable null check (F6)

**File**: `src/pages/api/recipes/[id].ts`

**Intent**: Remove the dead `if (!recipeId)` block (lines 63–65) that can never execute — `validateRecipeId` guarantees `recipeId` is non-null when `idCheck.response` is null, as established in the research. This misleads future readers about control flow.

**Contract**: After the `validateRecipeId` block resolves `idCheck`, extract `const recipeId = idCheck.recipeId;` and proceed directly to the service call. Remove the unreachable `if (!recipeId) { return jsonError(...) }` guard that follows. Do this for each HTTP verb (GET, PATCH, DELETE) that contains the pattern — they all share the same issue.

---

### Success Criteria

#### Automated Verification

- Migration applies cleanly against the local Supabase instance: `supabase db reset` (or `supabase migration up`) completes without error
- TypeScript compiles: `npx tsc --noEmit` — no errors in services/recipes.ts or the API route files
- Linting passes: `npm run lint`
- Existing test suites pass unchanged: `npm run test:integration` and `npm run test:smoke`
- pgTAP tests pass (confirm `create_recipe_with_ingredients` is callable by `authenticated` role): `supabase test db`

#### Manual Verification

- POST `/api/recipes` with valid recipe + ingredients via the UI or curl succeeds: recipe and all ingredients are visible in a subsequent GET
- No orphan recipe rows exist in the `recipes` table after a successful POST

**Implementation Note**: Pause here for manual confirmation that the atomicity fix works end-to-end before proceeding to Phase 2.

---

## Phase 2: Regression tests (R1 + R3)

### Overview

Extend `src/pages/api/recipes.test.ts` with two focused test suites: (1) an atomicity regression test at the POST handler boundary proving non-2xx on service failure, and (2) a cross-user IDOR suite proving 403 for GET/PATCH/DELETE when the attacker owns no matching recipe. Add `OWNER_USER_ID` and `ATTACKER_USER_ID` constants; extend `buildContext()` call sites as needed.

### Changes Required

#### 1. Two-user constants

**File**: `src/pages/api/recipes.test.ts`

**Intent**: Establish semantic names for the two roles used in IDOR tests so test intent is readable at a glance. The existing `TEST_USER_ID` constant is repurposed as the owner; a new `ATTACKER_USER_ID` is added below it.

**Contract**: Add two constants immediately after (or replacing) `TEST_USER_ID`:

```ts
const OWNER_USER_ID  = "aaaaaaaa-0000-0000-0000-000000000001"; // same value as current TEST_USER_ID
const ATTACKER_USER_ID = "bbbbbbbb-0000-0000-0000-000000000002"; // attacker — owns no recipes
```

Keep `TEST_USER_ID` as an alias (`const TEST_USER_ID = OWNER_USER_ID;`) so existing test call sites remain unmodified.

---

#### 2. Atomicity regression test suite (R1)

**File**: `src/pages/api/recipes.test.ts`

**Intent**: Prove that the POST handler returns a non-2xx status when `createRecipe` signals failure. This test asserts the HTTP boundary behavior — it does not test the database-level atomicity (that is covered by the new RPC and pgTAP). Two cases: clean failure (`{ data: null, error }`) and historical mixed-state failure (`{ data: recipe, error }`) — the latter proves the F2 guard fix actually matters.

**Contract**: Add a new `describe("POST /api/recipes — atomicity boundary", ...)` block. Per test:

- **Clean failure**: mock `mockCreateRecipe.mockResolvedValue({ data: null, error: new Error("rpc failed") })` → call `createHandler(buildContext({method: "POST", body: validRecipePayload}))` → assert `res.status >= 400`.
- **Mixed-state failure (regression for F2 fix)**: mock `mockCreateRecipe.mockResolvedValue({ data: mockRecipe, error: new Error("ingredient insert failed") })` — i.e., both fields non-null — → call handler → assert `res.status >= 400`. This test proves the `if (error)` guard (not `if (error || !data)`) catches the mixed state correctly.
- **Happy path**: mock `mockCreateRecipe.mockResolvedValue({ data: mockRecipe, error: null })` → assert 201.

Reuse the `validRecipePayload` and `mockRecipe` shapes already established in the surrounding test suite.

---

#### 3. Cross-user IDOR test suite (R3)

**File**: `src/pages/api/recipes.test.ts`

**Intent**: Prove that an attacker calling GET, PATCH, and DELETE on a recipe they don't own receives 403 at the HTTP boundary. The mechanism: service calls are mocked to return `{ data: null, error: null }` — exactly how the real service behaves when RLS filters out a foreign-owned row. This simulates the RLS effect without a live database.

**Contract**: Add a `describe("cross-user IDOR — recipe ownership boundary", ...)` block. For each verb:

- Build an attacker context: `buildContext({ method: "GET"|"PATCH"|"DELETE", userId: ATTACKER_USER_ID, params: { id: TEST_RECIPE_ID } })`.
- Mock the relevant service function (`mockGetRecipe` / `mockUpdateRecipe` / `mockDeleteRecipe`) to return `{ data: null, error: null }`.
- Call the corresponding handler.
- Assert `res.status === 403`.

Three test cases minimum: GET, PATCH (include a valid patch body), DELETE. A fourth optional case: DELETE by the owner → 200 (proves the fixture itself is not broken).

---

### Success Criteria

#### Automated Verification

- All new tests pass: `npm run test:integration`
- No pre-existing tests broken by the new constants or mocks
- Type checking passes on the test file: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification

- Read the new test output: confirm test descriptions clearly communicate which risk scenario each test covers (human review of test names)

**Implementation Note**: Pause here for review of test names and assertions before proceeding to Phase 3.

---

## Phase 3: pgTAP hardening + cleanup + cookbook

### Overview

Harden the DELETE cross-user assertion in the pgTAP RLS test file, add a split-rationale comment to the smoke test file (F7), and fill §6.1 and §6.2 cookbook entries in `context/foundation/test-plan.md`. Advance §3 Phase 1 to `complete`.

### Changes Required

#### 1. Harden pgTAP DELETE cross-user assertion

**File**: `supabase/tests/recipe_rls.sql`

**Intent**: Strengthen the DELETE cross-user test at line ~173 from a soft "0 rows affected" assertion to a combination that confirms both that the delete was blocked AND the row still exists from the owner's perspective — consistent with the SELECT and INSERT assertion strength in the same file.

**Contract**: After the cross-user DELETE attempt (performed as user B on user A's recipe), add a `SELECT count(*)` assertion queried as user A confirming the row still exists. The assertion should use `is(count(*), 1, 'cross-user delete blocked — recipe still belongs to owner')` pattern matching the existing pgTAP helper usage in the file.

---

#### 2. Smoke test split-rationale comment (F7)

**File**: `src/pages/api/recipes.api.smoke.test.ts`

**Intent**: Clarify why two test files exist for the same API surface so future agents know which is authoritative for full contract tests vs which is a quick pre-deploy gate.

**Contract**: Add a one-line comment at the top of the file (before the imports) stating the split rationale, e.g.:

```ts
// Smoke suite: quick pre-deploy gate covering critical happy paths only.
// Full contract tests (edge cases, error boundaries, IDOR) live in recipes.test.ts.
```

---

#### 3. Fill §6.1 and §6.2 cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` placeholders in §6.1 and §6.2 with the patterns established in Phase 2. §6.1 covers HTTP boundary testing; §6.2 covers the two-user fixture pattern.

**Contract**: 

§6.1 should describe: the `vi.mock("@/lib/services/recipes")` pattern, the `buildContext({method, body, params, userId})` helper, how to assert HTTP status codes, and how to simulate service failure (mock returning `{ data: null, error: new Error(...) }`).

§6.2 should describe: `OWNER_USER_ID` + `ATTACKER_USER_ID` constants, how to build an attacker context with `buildContext({userId: ATTACKER_USER_ID})`, and the expected mock return (`{ data: null, error: null }`) that simulates RLS blocking a foreign-owned row.

---

#### 4. Update §3 Phase 1 rollout status + change.md

**File**: `context/foundation/test-plan.md`

**Intent**: Advance the Phase 1 row in the §3 rollout table from `change opened` to `complete`. This is the orchestrator state update that signals `/10x-test-plan` can move to Phase 2 on next invocation.

**Contract**: Update the `Status` cell for Phase 1 row from `change opened` to `complete`.

---

**File**: `context/changes/testing-recipe-domain-atomicity/change.md`

**Intent**: Mark the change as complete.

**Contract**: Set `status: complete` and `updated: 2026-06-25` (or the date of completion).

---

### Success Criteria

#### Automated Verification

- pgTAP tests pass with hardened assertion: `supabase test db`
- Linting passes on the smoke test file after comment addition: `npm run lint`
- Full test suite still passes: `npm run test:integration` and `npm run test:smoke`

#### Manual Verification

- Read `context/foundation/test-plan.md` §6.1 and §6.2: confirm cookbook entries give enough guidance for a new agent to write a recipe API test without reading this plan
- Read §3 table: confirm Phase 1 is `complete` and Phase 2 is `not started`

---

## Testing Strategy

### Integration Tests (HTTP boundary)

- POST handler: clean failure → non-2xx; mixed-state failure → non-2xx; success → 201
- GET/PATCH/DELETE with attacker context: service returns null → 403 for each verb

### SQL Tests (pgTAP)

- Hardened DELETE cross-user: row existence confirmed from owner's perspective after blocked delete

### Manual Testing Steps

1. Run `supabase db reset` and confirm the new migration applies cleanly
2. POST a recipe with ingredients via the app; confirm it appears with ingredients in the list view
3. Confirm TypeScript build passes after all code changes

## References

- Research: `context/changes/testing-recipe-domain-atomicity/research.md`
- Impl-review (findings F1–F7): `context/changes/data-ownership-and-recipe-domain-base/reviews/impl-review.md`
- Reference migration: `supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql`
- Test template: `src/pages/api/recipes.test.ts:331` — existing 403 ownership test

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Atomic recipe create fix

#### Automated

- [ ] 1.1 Migration applies cleanly: `supabase db reset` (or `supabase migration up`)
- [x] 1.2 TypeScript compiles: `npx tsc --noEmit`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Existing test suites pass: `npm run test:integration` and `npm run test:smoke`
- [ ] 1.5 pgTAP tests pass (RPC callable by authenticated): `supabase test db`

#### Manual

- [ ] 1.6 POST with recipe + ingredients succeeds end-to-end; no orphan rows

### Phase 2: Regression tests (R1 + R3)

#### Automated

- [ ] 2.1 All new tests pass: `npm run test:integration`
- [ ] 2.2 No pre-existing tests broken
- [ ] 2.3 TypeScript compiles: `npx tsc --noEmit`
- [ ] 2.4 Linting passes: `npm run lint`

#### Manual

- [ ] 2.5 Test names clearly communicate the risk scenario they cover (human review)

### Phase 3: pgTAP hardening + cleanup + cookbook

#### Automated

- [ ] 3.1 pgTAP passes with hardened DELETE assertion: `supabase test db`
- [ ] 3.2 Linting passes on smoke test file: `npm run lint`
- [ ] 3.3 Full test suite passes: `npm run test:integration` and `npm run test:smoke`

#### Manual

- [ ] 3.4 §6.1 and §6.2 cookbook entries give standalone guidance (human review)
- [ ] 3.5 §3 Phase 1 status is `complete` in test-plan.md
