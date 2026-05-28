# S-01: User Manages Personal Recipe Base — Plan Brief

> Full plan: `context/changes/personal-recipe-base-management/plan.md`

## What & Why

We are building the recipe management UI for S-01 — the first user-facing slice of the meal-plan product. Users need to add and manage a personal recipe base (with ingredients) before any plan generation or shopping list features can provide value. This slice turns F-01's complete but invisible API into something a user can actually interact with.

## Starting Point

F-01 delivered a full CRUD API (`/api/recipes`, `/api/recipes/[id]`), a service layer, Zod validation schemas, RLS-enforced ownership, and typed contracts — all verified and landed across three commits. The frontend today has only auth pages and a minimal dashboard placeholder; no recipe UI exists. The `updateRecipeSchema` does not yet accept ingredients, requiring a small additive extension before the edit form can replace ingredient sets.

## Desired End State

An authenticated user can navigate to `/recipes` from the Topbar, see their recipe collection as a card grid (or a prominent empty-state CTA), create a new recipe with a name, description, prep time, and dynamically added/removed ingredient rows, open any card to edit all fields including ingredients, and delete a recipe with a confirmation step. All `/recipes` subroutes are protected — unauthenticated users are redirected to sign-in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Navigation placement | Dedicated `/recipes` section with Topbar link | Clean URL structure, consistent with how the app routes future features | Plan |
| Form interactivity | React island (`RecipeForm.tsx`) | Dynamic ingredient rows require stateful JS; follows the existing island pattern (SignInForm) | Plan |
| Edit flow | Edit page only (`/recipes/[id]/edit`) | No stable-URL need for a read-only view at MVP; fewer pages to maintain | Plan |
| List layout | Card grid | Fits cosmic glassmorphism aesthetic; shows name, description, prep time, ingredient count at a glance | Plan |
| Empty state | Prominent CTA | Critical onboarding moment — guides users to the only action before plan generation is possible | Plan |
| Delete UX | Confirmation dialog (`confirm()`) | Irreversible soft-delete warrants a safety gate; native confirm is zero-overhead for MVP | Plan |
| Validation feedback | Inline field errors on submit | Industry-standard; form stays open so users see exactly which field to fix | Plan |
| Ingredient form UX | Dynamic add/remove rows (single submit) | Best UX; consistent with the React island choice; avoids multi-step ingredient save | Plan |
| Ingredient update strategy | Delete-then-reinsert on edit | Simplest correct approach for MVP; ingredients have no `deleted_at`, so replace-all is safe | Plan |

## Scope

**In scope:**
- `/recipes` list page (card grid + empty state + protected route)
- Topbar navigation update (Recipes link)
- `RecipeForm` React island (create and edit mode, dynamic ingredient rows, inline errors)
- `/recipes/new` create page
- `/recipes/[id]/edit` edit page (server-prefetch, pre-filled form)
- Delete action from edit page (confirm dialog → soft-delete → redirect)
- Additive API extension: `updateRecipeSchema` + `updateRecipe` service + PATCH handler to accept optional `ingredients`

**Out of scope:**
- Recipe search, sort, or filter
- Image or file attachment
- Read-only recipe detail page
- Individual ingredient-level CRUD
- Meal plan generation (S-02) or recipe suggestions (S-03)

## Architecture / Approach

Three Astro pages under `src/pages/recipes/` consume the existing API through server-side fetches using the established `createClient` + `Astro.locals.user` pattern. The `RecipeForm` React island is the only interactive component — it manages ingredient-row state and submits a single JSON payload to the API. The list page is pure Astro (no JS bundle cost). The additive API extension (Phase 3) is backward-compatible: callers that omit `ingredients` continue to work unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Recipe List Page & Navigation | Protected `/recipes` route, card grid, empty state, Topbar link | None significant — read-only, builds on proven API |
| 2. Recipe Create Form | `RecipeForm` React island, `/recipes/new`, first mutation path | Dynamic ingredient row state is the most complex UI logic in this slice |
| 3. Recipe Edit & Delete | API ingredient-update extension, `/recipes/[id]/edit`, delete with confirm | API extension must handle `ingredients: undefined` vs `ingredients: []` correctly |

**Prerequisites:** F-01 fully landed (confirmed — all phases done).  
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- The `confirm()` native dialog is used for delete confirmation; if the cosmic theme requires a styled modal instead, Phase 3 needs a small React component for the dialog.
- Client-side Zod-equivalent validation in `RecipeForm` duplicates server-schema rules by hand — if schemas diverge, validation gaps may appear. Consider sharing the Zod schema via a common import if the form grows.
- Ingredient row order is not explicitly persisted (no `sort_order` column) — ingredient ordering after edit/reload may differ from what the user entered.

## Success Criteria (Summary)

- User can create a recipe with ingredients and immediately see it on the `/recipes` list.
- User can open a recipe, modify any field or ingredient, save, and see the changes reflected on the list card.
- User can delete a recipe from the edit page; the card disappears from the list.
