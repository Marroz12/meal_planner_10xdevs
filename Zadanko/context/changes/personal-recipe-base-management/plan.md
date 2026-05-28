# S-01: User Manages Personal Recipe Base — Implementation Plan

## Overview

Build the recipe management UI for S-01: authenticated users can view, create, edit, and delete personal recipes with ingredients. All API and data-layer work was delivered in F-01; this plan is a frontend-only slice with one small additive API extension to support ingredient replacement on edit.

## Current State Analysis

F-01 (complete, all 3 phases landed — commits `db35219`, `cc6313b`, `4858727`) delivered the full CRUD API, service layer, Zod schemas, RLS enforcement, and types. What does not yet exist:

- No recipe UI pages under `src/pages/recipes/`
- `/recipes` is not in `PROTECTED_ROUTES` (middleware protects `/dashboard` only)
- Topbar shows only Dashboard + auth links for logged-in users
- `updateRecipeSchema` and `updateRecipe` service do not accept `ingredients` — edit form requires a small additive extension

## Desired End State

An authenticated user can navigate to `/recipes` from the Topbar, see their recipe list as a card grid (or an empty-state CTA), create a new recipe with dynamic ingredient rows, open any card to edit all fields including ingredient changes, and delete a recipe with a confirmation step. All `/recipes` routes redirect unauthenticated users to sign-in.

### Key Discoveries:

- Middleware `PROTECTED_ROUTES` array at `.bootstrap-scaffold/src/middleware.ts:4` — add `"/recipes"` here.
- Topbar authenticated nav block at `.bootstrap-scaffold/src/components/Topbar.astro:14` — add Recipes link next to Dashboard.
- `listRecipes` returns `RecipeWithIngredients[]` ordered `created_at DESC`, soft-deletes filtered — no additional query work needed for the list page.
- `updateRecipeSchema` at `.bootstrap-scaffold/src/lib/validation/recipes.ts:31` has a `.refine()` requiring at least one field — must be updated to allow `ingredients`-only update payloads.
- Ingredient rows have no `deleted_at`; replace-all strategy (delete + re-insert) is safe for MVP.
- `Button` component from `@/components/ui/button` uses CVA and supports `variant` + `size` props — use it in the form.
- Use `cn()` from `@/lib/utils` for all conditional Tailwind classes.
- All imports must use `@/*` alias (not relative paths).

## What We're NOT Doing

- No recipe search, sort, or filter.
- No image or file attachment on recipes.
- No read-only recipe detail page — edit page (`/recipes/[id]/edit`) is the only per-recipe view.
- No individual ingredient-level CRUD (replace-all on save).
- No meal plan generation (S-02) or recipe suggestions (S-03).
- No recipe sharing, export, or print.

## Implementation Approach

Three incremental layers: list view first (read-only, validates API integration), then the create form (first mutation path, establishes the reusable `RecipeForm` island), then edit and delete (requires extending the update API for ingredients). Each phase is independently deployable and testable against the live API.

## Phase 1: Recipe List Page & Navigation

### Overview

Wire up the `/recipes` protected route, the recipe card grid, the empty state, and Topbar navigation. Read-only — no form or mutation code in this phase.

### Changes Required:

#### 1. Middleware protection

**File**: `.bootstrap-scaffold/src/middleware.ts`

**Intent**: Protect all `/recipes` subroutes so unauthenticated users are redirected to sign-in, consistent with how `/dashboard` is protected.

**Contract**: Add `"/recipes"` to the `PROTECTED_ROUTES` array at line 4.

#### 2. Topbar navigation link

**File**: `.bootstrap-scaffold/src/components/Topbar.astro`

**Intent**: Give logged-in users one-click access to recipe management from any page.

**Contract**: Add an `<a href="/recipes">` link labelled "Recipes" next to the existing Dashboard link in the authenticated user nav block, using the identical anchor class (`text-purple-300 transition-colors hover:text-purple-100 hover:underline`).

#### 3. Recipe list page

**File**: `.bootstrap-scaffold/src/pages/recipes/index.astro`

**Intent**: Protected landing page that fetches the user's recipe list server-side and renders cards or empty state.

**Contract**: Import and call `listRecipes(supabase, userId)` using `Astro.locals.user` and `createClient(Astro.request.headers, Astro.cookies)` (same pattern as existing API routes). Render a page header with the title "My Recipes" and an "Add Recipe" link (anchor styled as a button) pointing to `/recipes/new`. If the returned array is non-empty, render a responsive card grid of `<RecipeCard>` components. If empty, render `<RecipeEmptyState>`. Wrap in `<Layout>` with `<Topbar>`.

#### 4. Recipe card component

**File**: `.bootstrap-scaffold/src/components/recipes/RecipeCard.astro`

**Intent**: Display a single recipe's summary in the list view; the card is the navigation target to the edit page.

**Contract**: Accept a `RecipeWithIngredients` prop. Render as an anchor (`<a href="/recipes/{recipe.id}/edit">`) wrapping a glassmorphism card block (`rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl`). Show: recipe name (gradient heading), description truncated at ~100 characters, prep time formatted as `{n} min` (omit the field when `null`), and ingredient count as `{n} ingredient(s)`.

#### 5. Empty state component

**File**: `.bootstrap-scaffold/src/components/recipes/RecipeEmptyState.astro`

**Intent**: Guide first-time users toward the only available action when no recipes exist.

**Contract**: Render a centred block with a heading ("No recipes yet"), a short description ("Add your first recipe to start building your personal collection."), and a prominent "Add Recipe" anchor styled as a primary-style large button pointing to `/recipes/new`. Follow the cosmic glassmorphism container style.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes with all new files.
- `npm run lint` passes.
- `npx astro sync && npx tsc --noEmit` type checking passes.

#### Manual Verification:

- Unauthenticated user navigating to `/recipes` is redirected to `/auth/signin`.
- Logged-in user with no recipes sees the empty state with "Add Recipe" CTA.
- Logged-in user with existing recipes sees a card grid.
- Each card shows name, description preview, prep time, and ingredient count.
- Topbar shows a "Recipes" link when logged in; clicking it navigates to `/recipes`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Recipe Create Form

### Overview

Implement the `RecipeForm` React island with dynamic ingredient rows and wire it to `/recipes/new`. This is the first mutation path and establishes the shared form component reused in Phase 3.

### Changes Required:

#### 1. Recipe form React island

**File**: `.bootstrap-scaffold/src/components/recipes/RecipeForm.tsx`

**Intent**: Reusable interactive form handling both create and edit modes, with dynamic ingredient rows and inline validation errors on submit.

**Contract**: Export a default React component accepting:
- `initialValues?: { name: string; description?: string | null; prep_time_minutes?: number | null; ingredients: Array<{ name: string; quantity?: string | null; unit?: string | null; storage_type: "fresh" | "durable" }> }` — undefined means create mode, defined means edit mode.
- `recipeId?: string` — when defined, submits to `PATCH /api/recipes/{recipeId}`; when absent, submits to `POST /api/recipes`.

Internal state: recipe fields (`name`, `description`, `prepTimeMinutes` as string for input binding), `ingredients` array of `{ name, quantity, unit, storage_type }` rows, `errors: Record<string, string>`, and `submitting: boolean`.

Behaviour:
- "Add ingredient" button appends a blank row with `storage_type: "fresh"` default.
- Each row has a remove (×) button; the row is removed immediately from state.
- On submit: validate client-side — name required, description ≤ 5 000 chars, prep_time_minutes integer 0–1 440 (if provided), each ingredient name required. On failure set `errors` keyed by field path (e.g. `"name"`, `"ingredients.0.name"`) and do not call the API. On success: POST or PATCH JSON body `{ name, description, prep_time_minutes, ingredients }` to the appropriate endpoint; on 2xx redirect to `/recipes` via `window.location.href`; on error show a top-level error message from the response body.
- Error messages render as `<p className="mt-1 text-sm text-red-400">` beneath the relevant field or ingredient-row field.
- Use `Button` from `@/components/ui/button` and `cn()` from `@/lib/utils`.
- `storage_type` field rendered as a `<select>` with options `fresh` and `durable`.

#### 2. Create recipe page

**File**: `.bootstrap-scaffold/src/pages/recipes/new.astro`

**Intent**: Protected Astro page that mounts the form island in create mode.

**Contract**: Server-side guard: redirect to `/auth/signin` if `Astro.locals.user` is absent. Render `<RecipeForm client:load />` (no props = create mode) inside `<Layout>` with `<Topbar>`. Include a page title "Add Recipe" and a back link to `/recipes`.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes.
- `npm run lint` passes.
- Type checking passes.

#### Manual Verification:

- "Add Recipe" links from the list page and empty state navigate to `/recipes/new`.
- Form renders with name, description, prep time fields, and an ingredient section.
- "Add ingredient" button adds a new row with all four fields; × button removes it.
- Submitting with an empty name shows an inline error below the name field without navigating.
- Submitting with a blank ingredient name shows an inline error on that row's name field.
- A valid submission creates the recipe and redirects to `/recipes` where the new card appears.
- Prep time entered as `30` shows `30 min` on the recipe card.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Recipe Edit & Delete

### Overview

Extend the update API (type, validation schema, service, handler) to accept an optional ingredient set, then build the edit page. Ingredient replacement must run through a DB-side transactional path so the edit flow can safely replace the full ingredient set without partial data loss. `RecipeForm` from Phase 2 is reused in edit mode with pre-filled values. Delete flows through the edit page.

### Changes Required:

#### 0. Transactional ingredient replacement function

**File**: `.bootstrap-scaffold/supabase/migrations/<timestamp>_replace_recipe_ingredients_rpc.sql`

**Intent**: Move full ingredient-set replacement into a single database transaction so the edit path actually satisfies the plan's atomicity guarantee.

**Contract**: Add a SQL function (or equivalent Postgres RPC) that accepts the authenticated recipe id plus the replacement ingredient payload and performs delete-old + insert-new inside one transaction boundary. The function must fail the entire replacement if any ingredient row is invalid, leaving the previous ingredient set intact.

#### 1. Extend UpdateRecipePayload type

**File**: `.bootstrap-scaffold/src/types.ts`

**Intent**: Allow update payloads to carry an optional ingredient list for atomic ingredient replacement on edit.

**Contract**: Add `ingredients?: CreateIngredientPayload[]` to the `UpdateRecipePayload` interface.

#### 2. Extend update validation schema

**File**: `.bootstrap-scaffold/src/lib/validation/recipes.ts`

**Intent**: Allow PATCH requests to include an optional ingredients array; preserve the "at least one field" guard.

**Contract**: Add `ingredients: z.array(ingredientSchema).max(200, "Too many ingredients").optional()` as a field inside `updateRecipeSchema`. Update the `.refine()` predicate so that a payload containing only `ingredients` (with no recipe scalar fields) is also considered valid — e.g. check `Object.keys(payload).length > 0 || payload.ingredients !== undefined`.

#### 3. Extend updateRecipe service

**File**: `.bootstrap-scaffold/src/lib/services/recipes.ts`

**Intent**: When an edit request includes `ingredients`, replace the recipe's ingredient set atomically.

**Contract**: After the recipe-fields UPDATE completes successfully, if `payload.ingredients` is defined (including an empty array), call the transactional SQL function/RPC from item 0 with the replacement ingredient set. When `payload.ingredients` is `undefined`, skip ingredient handling entirely (preserving existing ingredients unchanged). Return early with the Supabase error if the RPC fails.

#### 4. Extend PATCH API handler

**File**: `.bootstrap-scaffold/src/pages/api/recipes/[id].ts`

**Intent**: Thread the `ingredients` field from the validated request body through to the service layer.

**Contract**: The validated payload from `updateRecipeSchema.safeParse()` now includes `ingredients`. Pass it through to the `updateRecipe` service call without filtering it out.

#### 5. Recipe edit page

**File**: `.bootstrap-scaffold/src/pages/recipes/[id]/edit.astro`

**Intent**: Protected edit page that pre-populates `RecipeForm` with the existing recipe data and exposes a delete action.

**Contract**: Server-side: validate `Astro.params.id` with `recipeIdSchema`; fetch recipe via `getRecipe(supabase, userId, id)`; redirect to `/recipes` if not found or user mismatch. Map `recipe.recipe_ingredients` to the `initialValues.ingredients` shape (pick `name`, `quantity`, `unit`, `storage_type` fields). Render `<RecipeForm client:load recipeId={id} initialValues={mapped} />` inside `<Layout>` with `<Topbar>`. Include a page title "Edit Recipe" and a back link to `/recipes`. Delete: render a "Delete" button outside the form; on click, show a native `confirm()` dialog with `"Delete "${recipe.name}"? This cannot be undone."`; on confirm, send `DELETE /api/recipes/{id}` and redirect to `/recipes` on success. Handle this with an inline `<script>` block or a small client component — keep it simple.

#### 6. Existing API contract tests

**File**: `.bootstrap-scaffold/src/pages/api/recipes.test.ts`

**Intent**: Keep the existing schema-level verification aligned with the Phase 3 payload contract change.

**Contract**: Extend the `updateRecipeSchema` tests to cover: ingredients-only update passes, empty ingredients array passes, invalid ingredient payload fails, and completely empty update payload still fails.

**File**: `.bootstrap-scaffold/src/pages/api/recipes.api.smoke.test.ts`

**Intent**: Keep the PATCH route smoke coverage aligned with the new optional `ingredients` semantics.

**Contract**: Add smoke coverage proving that PATCH preserves existing ingredients when the `ingredients` field is omitted and successfully replaces the full ingredient set when the field is present.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes.
- `npm run lint` passes.
- Type checking passes.

#### Manual Verification:

- Clicking a recipe card navigates to `/recipes/[id]/edit` with all fields pre-filled (name, description, prep time, ingredient rows).
- Editing the recipe name and saving updates the card on `/recipes`.
- Adding/removing ingredient rows in edit mode and saving persists the new ingredient set (removed ingredients are gone; new ones appear).
- Accessing `/recipes/[random-valid-uuid]/edit` for a non-existent recipe redirects to `/recipes`.
- Delete button shows a `confirm()` dialog; confirming deletes the recipe and redirects to `/recipes` (card is gone); cancelling returns the user to the edit form unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `RecipeForm` client-side validation: empty name blocked, ingredient row with blank name blocked, prep_time_minutes boundary (0 and 1440 valid, 1441 invalid).
- `updateRecipeSchema` refine: payload with only `ingredients` field is valid; completely empty object is invalid.

### Integration Tests:

- Edit recipe including ingredient changes: verify old ingredients absent and new ones present after PATCH.
- Edit recipe without `ingredients` field in payload: verify existing ingredients unchanged.
- PATCH smoke coverage exercises both omitted-ingredients and replace-all update paths.

### Manual Testing Steps:

1. Sign in, navigate to `/recipes` — see empty state; click CTA → `/recipes/new`.
2. Create a recipe with 3 ingredients — verify card appears with name, ingredient count `3`, prep time.
3. Click the card → `/recipes/[id]/edit` — verify form pre-filled with all fields and all 3 ingredient rows.
4. Remove 1 ingredient, add 2 new ones, change recipe name → save → verify card shows updated name and ingredient count `4`.
5. Open the browser directly to `/recipes/[random-uuid]/edit` — verify redirect to `/recipes`.
6. Open the edit page for an existing recipe, click Delete, confirm — verify card removed from the list.

## Performance Considerations

- Recipe list query already uses `created_at DESC` ordering and filters soft-deletes in `listRecipes` — no additional query optimisation needed at MVP volumes.
- `RecipeForm` React island is loaded only on `/recipes/new` and `/recipes/[id]/edit`; the list page at `/recipes` is pure Astro (no JS bundle cost for list browsing).

## Migration Notes

- Phase 3 introduces one additive database migration for the transactional ingredient-replacement function/RPC.
- API extension in Phase 3 (`ingredients` field in update payload) is fully additive and backward-compatible; existing callers that omit `ingredients` continue to work unchanged.

## References

- F-01 plan: `context/changes/data-ownership-and-recipe-domain-base/plan.md`
- Product requirements: `context/foundation/prd.md` (FR-001)
- Roadmap: `context/foundation/roadmap.md` (S-01)
- Service layer: `.bootstrap-scaffold/src/lib/services/recipes.ts`
- Validation schemas: `.bootstrap-scaffold/src/lib/validation/recipes.ts`
- API routes: `.bootstrap-scaffold/src/pages/api/recipes/`
- Auth client: `.bootstrap-scaffold/src/lib/supabase.ts`
- Middleware: `.bootstrap-scaffold/src/middleware.ts`
- Button component: `.bootstrap-scaffold/src/components/ui/button.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Recipe List Page & Navigation

#### Automated

- [x] 1.1 npm run build passes with new files
- [x] 1.2 npm run lint passes
- [x] 1.3 Type checking passes (npx astro sync + npx tsc --noEmit)

#### Manual

- [ ] 1.4 Unauthenticated user navigating to /recipes is redirected to /auth/signin
- [x] 1.5 ~~Logged-in user with no recipes sees empty state with Add Recipe CTA~~
- [x] 1.6 Logged-in user with existing recipes sees card grid
- [x] 1.7 Each card shows name, description preview, prep time, and ingredient count
- [x] 1.8 ~~Topbar shows Recipes link when logged in; navigates to /recipes~~

### Phase 2: Recipe Create Form

#### Automated

- [x] 2.1 npm run build passes
- [x] 2.2 npm run lint passes
- [x] 2.3 Type checking passes

#### Manual

- [x] 2.4 ~~Add Recipe links navigate to /recipes/new~~
- [x] 2.5 ~~Form renders with name, description, prep time, and ingredient section~~
- [x] 2.6 Add ingredient button adds a new row; × button removes it
- [x] 2.7 Submitting with empty name shows inline error below name field
- [x] 2.8 Submitting with blank ingredient name shows inline error on that row
- [x] 2.9 ~~Valid submission creates recipe and redirects to /recipes with new card~~
- [x] 2.10 Prep time entered as 30 shows 30 min on the recipe card

### Phase 3: Recipe Edit & Delete

#### Automated

- [x] 3.1 npm run build passes
- [x] 3.2 npm run lint passes
- [x] 3.3 Type checking passes

#### Manual

- [x] 3.4 Recipe card click navigates to /recipes/[id]/edit with form pre-filled
- [x] 3.5 Editing and saving updates the card on /recipes
- [x] 3.6 Adding/removing ingredient rows in edit mode persists new ingredient set
- [x] 3.7 Accessing non-existent recipe edit URL redirects to /recipes
- [x] 3.8 ~~Delete confirmation removes recipe and redirects to /recipes~~
