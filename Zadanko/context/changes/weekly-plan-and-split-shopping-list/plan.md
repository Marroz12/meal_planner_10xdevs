# S-02: Weekly Plan and Split Shopping List — Implementation Plan

## Overview

Build the weekly meal plan generation feature for the meal-plan app. An authenticated user with at least one recipe per meal type (breakfast, lunch, dinner) can generate a 7-day × 3-meal plan through a dedicated `/plan` page. A shopping list divided into Fresh and Durable sections is produced alongside the plan. The feature extends the existing recipe data model with a `meal_type` field, adds a stateless generation API endpoint, and delivers a new React island for display.

## Current State Analysis

F-01 and S-01 are complete. What exists:
- `recipes` and `recipe_ingredients` tables with RLS, soft delete, and `storage_type` ("fresh" | "durable") on every ingredient — the shopping list split is structurally ready
- Full CRUD API for recipes, service layer, Zod validation schemas, and TypeScript types
- `RecipeForm.tsx` island (create/edit), `RecipeCard.astro`, recipe pages at `/recipes`, `/recipes/new`, `/recipes/[id]/edit`
- Auth middleware protecting `/recipes`, Topbar with Recipes navigation link
- `listRecipes(supabase, userId)` service returning `RecipeWithIngredients[]` — ready to use as the generation input

What is missing:
- `meal_type` column on `recipes` (needed to separate breakfast / lunch / dinner pools)
- Generation algorithm and service function
- `POST /api/plan` endpoint
- `PlanGenerator.tsx` island and `/plan` Astro page
- Topbar "Plan" navigation link

## Desired End State

An authenticated user with at least one recipe for each meal type can navigate to `/plan`, click "Generate Plan", and within a second see a 7-day × 3-meal plan grid with their own recipe names in each slot, followed by a shopping list split into Fresh and Durable ingredient sections. Unauthenticated users are redirected to sign-in. If any meal-type pool is empty, the user sees a clear message indicating which type is missing with a link to add more recipes.

### Key Discoveries:

- `storage_type` field already on `recipe_ingredients` — shopping list split requires no schema change beyond Phase 1.
- `listRecipes()` at `src/lib/services/recipes.ts` returns `RecipeWithIngredients[]` ordered by `created_at DESC` and filtered for active (non-deleted) records — ready to use as generation input.
- `recipes` table uses a text CHECK constraint pattern (see `storage_type IN ('fresh', 'durable')`) — `meal_type` should follow the same convention.
- `update_recipe_with_ingredients` RPC at `supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql` handles scalar fields via explicit CASE branches — `meal_type` must be added there explicitly or it will be silently ignored during ingredient-inclusive edits.
- `getUserContext()` helper pattern at `src/pages/api/recipes/index.ts` — replicate for the new plan API route.
- `PROTECTED_ROUTES` at `src/middleware.ts:4` — add `"/plan"` here.
- Topbar authenticated nav at `src/components/Topbar.astro` — add "Plan" link next to "Recipes" using the identical anchor class.
- Cloudflare Workers SSR: generation must be synchronous and complete within a single request; no background tasks available.

## What We're NOT Doing

- No persistence of generated plans in the database (on-the-fly only; no `meal_plans` table).
- No per-meal-type AI or external-API suggestions (that is S-03).
- No recipe search, filter, or category management beyond the `meal_type` field.
- No shopping list editing (display only).
- No plan editing (user regenerates to get a new plan).
- No recipe import or export.

## Implementation Approach

Three incremental phases, each independently deployable:
1. Extend the data model with `meal_type` — schema, types, validation, service, RecipeForm
2. Add the generation API — new types, pure algorithm function, POST endpoint
3. Deliver the plan UI — middleware, Topbar, React island, Astro page

## Critical Implementation Details

**RPC must be updated alongside the schema change:** The `update_recipe_with_ingredients` RPC explicitly names the scalar columns it propagates from `p_payload`. If `meal_type` is not added to the RPC's UPDATE statement in the same migration as the ALTER TABLE, ingredient-inclusive edits will silently drop any `meal_type` change. These two changes belong in one migration file to prevent partial application.

---

## Phase 1: Meal Type Field

### Overview

Add `meal_type` to the recipe domain. Existing recipes receive `meal_type = 'any'` via the column default — no backfill required. This phase touches schema, types, validation schemas, the create service, and the RecipeForm island. Phases 2 and 3 depend on `meal_type` being present in the database and visible in types.

### Changes Required:

#### 1. Schema migration — add meal_type column and update RPC

**File**: `supabase/migrations/<timestamp>_add_meal_type_to_recipes.sql`

**Intent**: Extend `recipes` with a `meal_type` column that categorizes each recipe as breakfast, lunch, dinner, or uncategorized (any). Existing rows default to 'any'. Update the `update_recipe_with_ingredients` RPC to propagate `meal_type` from the payload so ingredient-inclusive edits don't silently drop meal type changes.

**Contract**:
- `ALTER TABLE public.recipes ADD COLUMN meal_type TEXT NOT NULL DEFAULT 'any' CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'any'));`
- `CREATE OR REPLACE FUNCTION public.update_recipe_with_ingredients(...)` — copy the full body from the current RPC migration and add a `meal_type` CASE branch alongside the existing `name`, `description`, `prep_time_minutes` branches:
  `meal_type = CASE WHEN p_payload ? 'meal_type' THEN p_payload->>'meal_type' ELSE meal_type END`
- Include rollback steps at the top: `ALTER TABLE public.recipes DROP COLUMN IF EXISTS meal_type;` and `CREATE OR REPLACE FUNCTION` reverting the RPC to its previous form (without the `meal_type` branch).

#### 2. TypeScript type updates

**File**: `src/types.ts`

**Intent**: Expose `meal_type` in the domain type contract so the service layer, API, and island share typed access without casting.

**Contract**: Add `meal_type: 'breakfast' | 'lunch' | 'dinner' | 'any'` to the `Recipe` interface. Add `meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'any'` to both `CreateRecipePayload` and `UpdateRecipePayload`.

#### 3. Validation schema updates

**File**: `src/lib/validation/recipes.ts`

**Intent**: Accept and validate `meal_type` in create and update request bodies.

**Contract**: Add `meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'any']).optional()` to both `createRecipeSchema` and `updateRecipeSchema`. Update the `updateRecipeSchema` `.refine()` predicate to add `|| payload.meal_type !== undefined` — the current predicate whitelists only `name`, `description`, `prep_time_minutes`, and `ingredients`; without this addition a `{ meal_type: 'breakfast' }` payload returns `false` from the refine and fails with 400, breaking criterion 1.8.

#### 4. createRecipe service update

**File**: `src/lib/services/recipes.ts`

**Intent**: Persist `meal_type` when creating a recipe.

**Contract**: In the `createRecipe` INSERT call, add `meal_type: payload.meal_type ?? 'any'` alongside the existing `name`, `description`, `prep_time_minutes` fields.

#### 5. RecipeForm island update

**File**: `src/components/recipes/RecipeForm.tsx`

**Intent**: Let users specify which meal type a recipe belongs to when creating or editing.

**Contract**: Add `meal_type: 'breakfast' | 'lunch' | 'dinner' | 'any'` to `RecipeFormValues` with a default of `'any'`. Render a `<select>` labelled "Meal type" with four options (Any / Breakfast / Lunch / Dinner) bound to `meal_type` state. Include `meal_type` in the POST and PATCH JSON body. When `initialValues` is provided, pre-populate the selector with the existing value. Use the same input/label styling as the existing `name` and `description` fields.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against a local Supabase instance without SQL errors.
- `npm run build` passes.
- `npm run lint` passes.
- Type checking passes (`npx astro sync && npx tsc --noEmit`).

#### Manual Verification:

- Navigating to `/recipes/new` shows a "Meal type" selector with four options defaulting to "Any".
- Creating a recipe with meal type "Breakfast" and reopening its edit page shows "Breakfast" pre-selected.
- Existing recipes (created before this migration) show "Any" in the meal type selector.
- Updating only the meal type field (no ingredient changes) via PATCH persists the new value — confirmed by reopening the edit page.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Plan Generation API

### Overview

Deliver the stateless plan generation logic: a pure algorithm function and a `POST /api/plan` endpoint. No new DB tables are created — the plan is computed from the user's existing recipes and returned in the same response.

### Changes Required:

#### 1. New plan-related types

**File**: `src/types.ts`

**Intent**: Define the shape of a generated plan and shopping list so the API, service function, and React island share a typed contract without duplication.

**Contract**: Append the following interfaces:
```ts
export interface MealSlot { recipeId: string; recipeName: string; }
export interface DayPlan { day: number; breakfast: MealSlot; lunch: MealSlot; dinner: MealSlot; }
export interface WeeklyPlan { days: DayPlan[]; } // always 7 entries
export interface ShoppingIngredient { name: string; quantity: string | null; unit: string | null; recipeName: string; }
export interface ShoppingList { fresh: ShoppingIngredient[]; durable: ShoppingIngredient[]; }
export interface PlanResult { plan: WeeklyPlan; shoppingList: ShoppingList; }
```

#### 2. Plan generation service

**File**: `src/lib/services/plan.ts`

**Intent**: Encapsulate the rotation algorithm and shopping list aggregation in a pure function so the API endpoint stays thin and the logic is independently testable.

**Contract**: Export one function:
```ts
export function generateWeeklyPlan(
  recipes: RecipeWithIngredients[]
): { result: PlanResult } | { error: string }
```

Steps the function must perform:
1. Partition `recipes` into three pools: `breakfast` (meal_type is `'breakfast'` or `'any'`), `lunch` (meal_type is `'lunch'` or `'any'`), `dinner` (meal_type is `'dinner'` or `'any'`).
2. If any pool is empty, return `{ error: "No recipes for meal type(s): <comma-separated list of missing types>" }`.
3. For each pool, shuffle the array (Fisher-Yates or equivalent). Build a cycler that returns pool items in shuffled order, wrapping around when exhausted.
4. For each of the 7 days: draw one recipe from each pool's cycler for breakfast, lunch, and dinner. Best-effort same-day uniqueness: before finalising a slot, if the drawn recipe ID already appears in another slot assigned to the same day, advance the cycler up to `min(pool.length - 1, 2)` additional times to find a different recipe. If no unique recipe is found within the attempt cap, accept the duplicate (unavoidable with a 1-recipe pool).
5. Assemble `WeeklyPlan.days` (7 `DayPlan` entries, `day` values 1–7).
6. Build `ShoppingList`: for each of the 21 `(day, mealSlot, recipe)` assignments, iterate `recipe.recipe_ingredients` and append each ingredient to `fresh[]` or `durable[]` according to `storage_type`, carrying `recipeName` for context.

#### 3. Unit tests for generateWeeklyPlan

**File**: `src/lib/services/plan.test.ts`

**Intent**: Verify the algorithm's edge cases in isolation so regressions are caught without a running Supabase instance. Place alongside the service file — consistent with the `recipes.test.ts` convention in this project.

**Contract**: Import `generateWeeklyPlan` from `@/lib/services/plan`. Write five test cases using vitest:
1. 1 recipe per meal type (breakfast/lunch/dinner) → returns a complete 7-entry plan with that recipe in every matching slot.
2. 0 dinner recipes → returns `{ error: string }` where the error message includes `"dinner"`.
3. 0 breakfast and 0 lunch recipes → error message includes both `"breakfast"` and `"lunch"`.
4. Only `'any'` recipes (no typed ones) → generation succeeds and returns 7-day plan.
5. 21+ varied recipes across types → no recipe ID appears twice within the same day's three slots (assert across all 7 days).

#### 4. POST /api/plan endpoint

**File**: `src/pages/api/plan/index.ts`

**Intent**: Authenticated entry point for plan generation — fetches the user's recipes, runs the generation function, and returns the result.

**Contract**: Export only `POST`. Follow the `getUserContext()` helper pattern from `src/pages/api/recipes/index.ts` (auth check + Supabase client creation). Call `listRecipes(supabase, userId)`; on service error return `jsonError("INTERNAL_ERROR", ..., 500)`. Pass the recipe list to `generateWeeklyPlan()`; on algorithm error return `jsonError("VALIDATION_ERROR", error, 400)`. On success return `jsonSuccess({ plan, shoppingList })`. Add `logApiEvent` calls matching existing route conventions (action `"plan.generate"`, outcomes `"success"` / `"error"` / `"denied"`).

### Success Criteria:

#### Automated Verification:

- `npm run build` passes.
- `npm run lint` passes.
- Type checking passes.
- Unit tests for `generateWeeklyPlan()`: 1 recipe per type → complete 7-day plan; 0 dinner recipes → error naming "dinner"; 'any' recipes only → all pools non-empty, generation succeeds.
- `POST /api/plan` with a valid authenticated session and ≥1 recipe per meal type returns 200 with `{ data: { plan, shoppingList }, error: null }`.
- `POST /api/plan` with missing recipes for at least one meal type returns 400 `VALIDATION_ERROR`.

#### Manual Verification:

- Unauthenticated `POST /api/plan` returns 401.
- Response `plan.days` contains exactly 7 entries, each with `breakfast`, `lunch`, `dinner` slots populated.
- Response `shoppingList.fresh` and `shoppingList.durable` are both non-empty when the assigned recipes have ingredients of the respective `storage_type`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Plan Page & Navigation

### Overview

Wire the generation API to a user-facing page. Extend middleware and Topbar, then deliver the `PlanGenerator` React island with loading state, plan grid, and shopping list. No new API or service work in this phase.

### Changes Required:

#### 1. Middleware protection

**File**: `src/middleware.ts`

**Intent**: Redirect unauthenticated users from the plan page to sign-in, consistent with how `/recipes` is protected.

**Contract**: Add `"/plan"` to the `PROTECTED_ROUTES` array at line 4.

#### 2. Topbar navigation link

**File**: `src/components/Topbar.astro`

**Intent**: Give logged-in users one-click access to plan generation from any page.

**Contract**: In the authenticated user nav block, add `<a href="/plan">` labelled "Plan" immediately next to the existing "Recipes" link, using the identical anchor class (`text-purple-300 transition-colors hover:text-purple-100 hover:underline`).

#### 3. PlanGenerator island

**File**: `src/components/plan/PlanGenerator.tsx`

**Intent**: Client-side island that orchestrates generation, shows loading feedback, and renders the plan grid and shopping list.

**Contract**: Component state: `status: 'idle' | 'loading' | 'done' | 'error'`, `plan: WeeklyPlan | null`, `shoppingList: ShoppingList | null`, `errorMessage: string | null`.

On "Generate Plan" button click: set `status = 'loading'`, call `fetch('/api/plan', { method: 'POST' })`, parse response as `ApiResponse<PlanResult>`. On success: set `status = 'done'`, populate `plan` and `shoppingList`. On error (non-2xx or `response.error` present): set `status = 'error'` with the message from the response body.

Plan grid: render as an HTML table with day labels (Mon–Sun) as column headers and three rows (Breakfast, Lunch, Dinner). Each cell shows `slot.recipeName`. Apply the glassmorphism container style (`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl`) consistent with the recipe list page.

Shopping list: two sections — "Fresh" and "Durable" — each rendered as a `<ul>`. Each `<li>` shows `ingredient.name` as the primary text; `quantity` and `unit` (when non-null) as secondary text; `recipeName` as a tertiary label. Omit quantity/unit fields when null. Lay the two sections side by side on medium+ screens, stacked on mobile.

Error display: if `errorMessage` contains `"No recipes for meal type(s):"`, render a guidance message naming the missing type(s) and linking to `/recipes/new`. Otherwise render a generic error banner.

Use `Button` from `@/components/ui/button` and `cn()` from `@/lib/utils`. All imports use `@/*` aliases (no relative paths).

#### 4. Plan page

**File**: `src/pages/plan.astro`

**Intent**: Protected Astro page that hosts the PlanGenerator island inside the standard layout.

**Contract**: Server-side guard: redirect to `/auth/signin` if `Astro.locals.user` is absent (same pattern as `src/pages/recipes/new.astro`). Render `<PlanGenerator client:load />` inside `<Layout>` with `<Topbar>`. Include a page header section: label text "Your week" and heading "Weekly Plan". Use the same cosmic background block pattern (purple/blue blur orbs + dot grid overlay) used in existing recipe pages.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes.
- `npm run lint` passes.
- Type checking passes.

#### Manual Verification:

- Unauthenticated user navigating to `/plan` is redirected to `/auth/signin`.
- Topbar shows "Plan" link when logged in; clicking it navigates to `/plan`.
- "Generate Plan" button is visible on the page; clicking it shows a loading state.
- With recipes covering all three meal types, generation succeeds: plan grid appears with 7 day columns × 3 meal rows, each cell containing a recipe name.
- No recipe appears twice in the same day's three slots (best-effort; expected to fail only with 1-recipe pools).
- Shopping list appears below the plan, split into "Fresh" and "Durable" sections.
- Each shopping list item shows ingredient name, quantity/unit (when available), and the recipe name it comes from.
- With no recipes of a given meal type, a clear error message names the missing type and links to `/recipes/new`.
- Clicking "Generate Plan" again replaces the previous plan with a new (potentially different) result.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `generateWeeklyPlan()` with 1 recipe per type: returns a complete 7-day plan with that recipe in every matching slot.
- `generateWeeklyPlan()` with 0 dinner recipes: returns an error string naming "dinner".
- `generateWeeklyPlan()` with 0 breakfast and 0 lunch recipes: error names both types.
- `generateWeeklyPlan()` with 'any' recipes only: all three pools are populated, generation succeeds, returns 7-day plan.
- `generateWeeklyPlan()` with 21+ varied recipes: no same-day duplicate recipe IDs in the output (probabilistically testable across multiple runs).

### Integration Tests:

- `POST /api/plan` without auth → 401.
- `POST /api/plan` with user having ≥1 recipe per type → 200 with `plan.days.length === 7`.
- `POST /api/plan` with user having 0 breakfast recipes → 400 `VALIDATION_ERROR`.

### Manual Testing Steps:

1. Create 3 recipes: one tagged Breakfast, one Lunch, one Dinner. Navigate to `/plan` → click "Generate Plan" → verify 21 slots appear, each showing the recipe name for the correct meal type row.
2. Add a second Breakfast recipe → regenerate → verify breakfast row alternates between the two recipes across the 7 days.
3. Delete all Lunch recipes → attempt generation → verify error message mentions "lunch" with a link to add recipes.
4. Create only "Any" tagged recipes (no typed ones) → generate → verify plan completes successfully.
5. Sign out and navigate to `/plan` → verify redirect to `/auth/signin`.

## Performance Considerations

The generation algorithm is pure in-memory computation over the user's recipe list. At typical MVP volumes (≤ 50 recipes), the algorithm completes in under 1 ms. The only I/O is the single `listRecipes()` query — already used by the recipes list page. NFR-01 (< 5 s) is not at risk.

## Migration Notes

Phase 1 adds one additive column (`meal_type TEXT NOT NULL DEFAULT 'any'`) and a `CREATE OR REPLACE` of the existing RPC. No backfill is needed — existing recipes receive `meal_type = 'any'` automatically, making them eligible for all three meal-type pools. The migration is fully backward-compatible with the existing API surface.

## References

- PRD: `context/foundation/prd.md` (FR-002, FR-003, US-01, NFR-01)
- Roadmap: `context/foundation/roadmap.md` (S-02)
- F-01 plan: `context/changes/data-ownership-and-recipe-domain-base/plan.md`
- S-01 plan: `context/changes/personal-recipe-base-management/plan.md`
- Service layer: `src/lib/services/recipes.ts`
- Types: `src/types.ts`
- API error utils: `src/lib/api/errors.ts`
- Validation schemas: `src/lib/validation/recipes.ts`
- Existing API routes: `src/pages/api/recipes/`
- RPC migration: `supabase/migrations/20260528000001_update_recipe_with_ingredients_rpc.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Meal Type Field

#### Automated

- [ ] 1.1 Migration applies cleanly against local Supabase instance
- [ ] 1.2 npm run build passes
- [ ] 1.3 npm run lint passes
- [ ] 1.4 Type checking passes (npx astro sync && npx tsc --noEmit)

#### Manual

- [ ] 1.5 /recipes/new shows Meal type selector with four options defaulting to Any
- [ ] 1.6 Creating a recipe with Breakfast and reopening its edit page shows Breakfast pre-selected
- [ ] 1.7 Existing recipes show Any in the meal type selector
- [ ] 1.8 Updating only the meal type field via PATCH persists the new value

### Phase 2: Plan Generation API

#### Automated

- [ ] 2.1 npm run build passes
- [ ] 2.2 npm run lint passes
- [ ] 2.3 Type checking passes
- [ ] 2.4 Unit tests for generateWeeklyPlan() pass (1-recipe pools, missing pools, any-only pools)
- [ ] 2.5 POST /api/plan with valid session and recipes returns 200 with correct envelope
- [ ] 2.6 POST /api/plan with missing meal type returns 400 VALIDATION_ERROR

#### Manual

- [ ] 2.7 Unauthenticated POST /api/plan returns 401
- [ ] 2.8 Response plan.days contains exactly 7 entries with breakfast, lunch, dinner slots
- [ ] 2.9 Response shoppingList.fresh and shoppingList.durable are non-empty when recipes have ingredients

### Phase 3: Plan Page & Navigation

#### Automated

- [ ] 3.1 npm run build passes
- [ ] 3.2 npm run lint passes
- [ ] 3.3 Type checking passes

#### Manual

- [ ] 3.4 Unauthenticated user navigating to /plan is redirected to /auth/signin
- [ ] 3.5 Topbar shows Plan link when logged in; clicking navigates to /plan
- [ ] 3.6 Generate Plan button shows loading state on click
- [ ] 3.7 Plan grid appears with 7 days × 3 meal rows, each cell showing a recipe name
- [ ] 3.8 No recipe appears twice in the same day's three slots (best-effort)
- [ ] 3.9 Shopping list appears split into Fresh and Durable sections
- [ ] 3.10 Each shopping list item shows ingredient name, quantity/unit (when available), and recipe name
- [ ] 3.11 Missing meal type shows error naming the type with a link to /recipes/new
- [ ] 3.12 Clicking Generate Plan again replaces the previous plan with a new result
