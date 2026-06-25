# Phase 1 Testing: Recipe Domain Atomicity and IDOR Baseline — Plan Brief

> Full plan: `context/changes/testing-recipe-domain-atomicity/plan.md`
> Research: `context/changes/testing-recipe-domain-atomicity/research.md`

## What & Why

Fix the non-atomic `createRecipe` bug (R1 from the quality contract) and add HTTP-boundary regression tests for both R1 and cross-user IDOR (R3). The bug allows a recipe row to be committed to the database even when the ingredient INSERT fails, producing an orphan row with no ingredients while the API returns an error — a broken state that existed silently before the impl-review caught it.

## Starting Point

Two test files exist (`recipes.test.ts`, `recipes.api.smoke.test.ts`), both mocking at the service boundary. `updateRecipe` is already atomic via an RPC; `createRecipe` uses a non-atomic two-step insert. The middleware only protects page routes; each API handler independently enforces auth via `getUserContext()`. No two-user fixture exists; no `create_recipe_with_ingredients` RPC exists.

## Desired End State

POST `/api/recipes` either fully succeeds (recipe + all ingredients committed atomically) or fully fails (nothing committed). GET/PATCH/DELETE with a foreign recipe ID always returns 403 — proven by automated tests. §6.1 and §6.2 of the quality contract are filled with the patterns established in this change, and §3 Phase 1 is marked `complete`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| R1 fix scope | Fix atomicity + tests in one phase | Bug and tests are tightly coupled; shipping the fix without tests leaves no regression guard | Plan |
| RPC approach | New `create_recipe_with_ingredients` migration | Mirrors the existing `update_recipe_with_ingredients` pattern — atomicity enforced at DB level, not app layer | Research / Plan |
| Always use RPC for ingredient path | RPC only when ingredients are non-empty | No-ingredients path is already clean and atomic; minimal change | Plan |
| Supabase key type | Anon key confirmed | RLS is the ownership gatekeeper; service `.eq(user_id)` is defense-in-depth | Plan (user answered) |
| R3 IDOR verb coverage | GET + PATCH + DELETE | All three verbs have 403 paths in `[id].ts`; leaving PATCH or DELETE untested creates a regression blind spot | Plan (user answered) |
| Test file organization | Extend `recipes.test.ts` | One authoritative contract test file; existing 331-line file has room | Plan (user answered) |
| pgTAP DELETE gap | Harden in Phase 3 | Closes weaker assertion flagged in research; ~5 lines of SQL | Plan (user answered) |
| F6 dead branch | Remove in Phase 1 | One-line removal, same file as R3 targets, impl-review PENDING | Plan (user answered) |

## Scope

**In scope:**
- New `create_recipe_with_ingredients` PL/pgSQL migration
- `createRecipe` service refactor (RPC delegation for ingredient path)
- POST handler guard fix: `if (error || !data)` → `if (error)` (F2)
- Dead null-check removal in `[id].ts` (F6)
- Atomicity regression tests + two-user IDOR test suite in `recipes.test.ts`
- pgTAP DELETE cross-user assertion hardening
- Smoke test split-rationale comment (F7)
- §6.1 + §6.2 cookbook entries + §3 Phase 1 status advance

**Out of scope:**
- `listRecipes` ingredient limits / pagination (F4)
- Perf script silent seed failure (F5) — Phase 3
- CI gate wiring — Phase 3
- Dropping `replace_recipe_ingredients` unused RPC
- `updateRecipe` RPC path ownership verification in tests

## Architecture / Approach

The fix follows the existing atomic-RPC pattern established by `update_recipe_with_ingredients`: a SECURITY INVOKER PL/pgSQL function owns the full create transaction (`INSERT recipes` + `INSERT recipe_ingredients` in one block), returns `public.recipes`, and uses `auth.uid()` for `user_id` — no user_id parameter needed. The service delegates to this RPC when ingredients are present; the no-ingredient path stays as a direct INSERT. Tests mock at the service boundary (`vi.mock`) and call handlers directly via `buildContext({userId})` — no HTTP server, no live Supabase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Atomic create fix | New RPC + migration, service wiring, two one-liner code fixes | Migration timestamp conflict if local Supabase has a newer migration |
| 2. Regression tests | Atomicity boundary test + GET/PATCH/DELETE IDOR suite in recipes.test.ts | Two-user fixture mock setup mismatches existing `beforeEach` reset pattern |
| 3. Hardening + cookbook | pgTAP DELETE hardening, smoke comment, §6.1/6.2 filled, §3 Phase 1 marked complete | pgTAP helper syntax differs from existing assertions — check file before writing |

**Prerequisites:** Local Supabase running (`supabase start`); `npm ci` clean.
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- `SUPABASE_KEY` confirmed as anon key by the user — if this is wrong, R3 tests need different assertions (service `.eq(user_id)` is the only guard, not RLS).
- The unused `replace_recipe_ingredients` RPC remains in the DB. Future agents must not assume it is the canonical ingredients-replace path; the new `create_recipe_with_ingredients` RPC is.
- `buildContext()` constructs `locals.user` from `userId` — if the actual Astro `locals` shape changes, all tests break. This is a known fragility of the direct-handler test pattern.

## Success Criteria (Summary)

- POST `/api/recipes` with a forced ingredient failure returns non-2xx and leaves no orphan recipe row
- GET/PATCH/DELETE as an attacker (different `userId`) returns 403 for all three verbs
- §6.1 + §6.2 cookbook entries are self-contained enough for a new agent to write a recipe API test without reading this plan
