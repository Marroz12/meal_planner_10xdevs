# S-02: Weekly Plan and Split Shopping List — Plan Brief

> Full plan: `context/changes/weekly-plan-and-split-shopping-list/plan.md`

## What & Why

S-02 delivers the core product value: an authenticated user can generate a 7-day × 3-meal plan from their personal recipe base and receive a shopping list split into Fresh and Durable sections in one click. This is the North Star slice — the first moment where the product's full proposition (recipe rotation + split shopping) is validated end-to-end.

## Starting Point

F-01 and S-01 are complete: `recipes` and `recipe_ingredients` tables exist with RLS, soft-delete, and `storage_type` on every ingredient. Users can create, view, edit, and delete recipes via a full CRUD API and UI. The data model and service layer are already in place; S-02 extends them without structural rework.

## Desired End State

An authenticated user with at least one recipe per meal type navigates to `/plan`, clicks "Generate Plan", and within a second sees a 7-day × 3-meal grid populated with their recipe names, followed by a shopping list in two sections (Fresh, Durable). If any meal-type pool is empty, a clear error names the missing type and links to recipe creation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Plan persistence | On-the-fly, no DB storage | Zero new DB tables; matches US-01 which describes generation and immediate receipt, not later retrieval | Plan |
| Recipe meal typing | Add meal_type field (breakfast / lunch / dinner / any) | More realistic plan output; 'any' default keeps all existing recipes backward-compatible | Plan |
| Existing recipe default | meal_type = 'any' | Fills all pools without requiring users to re-edit every recipe | Plan |
| Missing meal type handling | Block generation, name the missing type | Clear error; no silent partial results | Plan |
| Generation UX | React island + POST /api/plan | Consistent with S-01 RecipeForm pattern; allows loading state without page reload | Plan |
| Rotation algorithm | Shuffle + cycle per meal-type pool | Simple, randomizes output each time, spreads repetition evenly across 7 days | Plan |
| Same-day uniqueness | Best-effort (advance cycler up to pool.length − 1 times) | Good UX without risk of infinite loop when a pool has only one recipe | Plan |
| Shopping list format | All ingredients listed, split by storage_type — no de-duplication | Text-based quantities make arithmetic aggregation unreliable | Plan |

## Scope

**In scope:**
- `meal_type` column on `recipes` table (migration + RPC update in one file)
- `RecipeForm` meal type selector (Any / Breakfast / Lunch / Dinner)
- `generateWeeklyPlan()` service function with shuffle+cycle algorithm
- `POST /api/plan` endpoint following existing route conventions
- `/plan` Astro page protected by middleware
- Topbar "Plan" navigation link (authenticated only)
- `PlanGenerator.tsx` React island: generate button, loading state, plan grid, shopping list, error state

**Out of scope:**
- Plan persistence (no meal_plans table)
- AI-powered recipe suggestions (S-03)
- Shopping list editing or checkboxes
- Plan editing (regenerate to get a new plan)
- Recipe category management beyond the meal_type field

## Architecture / Approach

Three phases in dependency order: (1) extend the data model with `meal_type` so the generation has typed pools to work from; (2) build the stateless generation algorithm and API endpoint; (3) wire the UI. The algorithm runs entirely in-memory on Cloudflare Workers over the user's recipe list — no external service calls, no DB writes at generation time. Each recipe tagged 'any' contributes to all three meal-type pools.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Meal Type Field | Schema + types + validation + RecipeForm selector | RPC must be updated in the same migration as ALTER TABLE — if applied separately, meal_type updates are silently dropped on ingredient-inclusive edits |
| 2. Plan Generation API | Algorithm function + POST /api/plan | Empty-pool error path must clearly identify which meal type is missing; best-effort de-dupe must cap retries to avoid infinite loop on 1-recipe pools |
| 3. Plan Page & Navigation | /plan page + PlanGenerator island + Topbar link | Error UX must guide the user to add the missing meal type, not just show a raw error string |

**Prerequisites:** F-01 and S-01 fully complete and deployed to the working environment.  
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- With only 1 recipe per meal type, the 7-day plan repeats that recipe in every matching slot — expected and acceptable for MVP.
- Best-effort same-day uniqueness cannot be guaranteed when any pool has exactly 1 recipe.
- The `update_recipe_with_ingredients` RPC must be updated in the same migration as the schema change — partial application would leave a silent data-loss window for `meal_type` on ingredient-inclusive edits.

## Success Criteria (Summary)

- User with ≥1 recipe per meal type generates a complete 21-slot plan and a two-section shopping list in under 5 seconds.
- User missing a meal type sees a clear error naming the missing type with a link to add more recipes.
- Unauthenticated access to `/plan` redirects to sign-in.
