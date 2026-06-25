# Quality Contract: meal-plan

- **Written**: 2026-06-24
- **PRD version**: 1 (`context/foundation/prd.md`)
- **Roadmap version**: 1 (`context/foundation/roadmap.md`)
- **Test-base profile at writing**: sparse — vitest configured; 2 test files, both in `src/pages/api/`; no component, page, or e2e coverage

---

## §1 Strategy

Three load-bearing principles every test added through this rollout must satisfy:

**Principle 1 — Cost × signal.** Every test must answer: *what is the cheapest test that gives a real signal for this risk?* Unit before integration; integration before e2e. Promote only when no cheaper layer provides the same failure signal. Apply this cost-check to every planned sub-phase, every AI-native tool selection, and every CI gate addition.

**Principle 2 — User concerns are evidence.** Risks the team has directly articulated carry equal weight with PRD lines and roadmap data. The interview answer "plan generation returns fewer than 21 meals and the user doesn't notice" is a first-class risk source — not a nice-to-have.

**Principle 3 — Risks are scenarios, not code locations.** The risk map (§2) describes failure scenarios in user and business terms: what breaks for whom, and what evidence raised it. It does not cite specific files, functions, or schemas as "where the failure lives." File-level anchors belong in `/10x-research` output, produced per rollout phase against current code. A §2 row that contains `src/foo/bar.ts:42` is a violation of this principle.

---

## §2 Risk Map

### Risks

Impact and likelihood are rated High / Medium / Low on a user/business scale, not technical complexity.

| # | Risk (failure scenario) | Impact | Likelihood | Source — evidence |
|---|---|---|---|---|
| R1 | User creates a recipe with ingredients; ingredient insert fails silently; API returns HTTP 201; recipe exists in DB without ingredients; client shows success for broken state. | High | High | F-01 impl-review findings F1+F2 (both Decision: PENDING at time of writing) |
| R2 | Meal plan generation returns fewer than 21 meal slots (7 days × 3 meals); no structural completeness check validates the output before it reaches the user. | High | Medium | User interview Q1; PRD US-01 AC ("Wynik zawiera wszystkie 21 pozycji") |
| R3 | Authenticated user reads, modifies, or soft-deletes a recipe or plan belonging to another user via direct ID in an API request. | High | Low | PRD NFR-02 ("Użytkownik ma dostęp wyłącznie do własnych…"); PRD Access Control section; ghost recipe state introduced by R1 |
| R4 | Generated shopping list mixes fresh and durable items, or the split is absent. | High | Medium | PRD Guardrails ("Lista zakupów nie może mieszać produktów świeżych i trwałych — zawsze rozdzielona na dwie sekcje"); FR-003; US-01 AC |
| R5 | A new route (`/recipes/*`, `/plan`, or similar) is added to the app without being listed in `PROTECTED_ROUTES`; the route silently serves unauthenticated users. | Medium | Medium | PRD Access Control; S-01 plan (documents `PROTECTED_ROUTES` extension pattern); roadmap S-02 will add at least one new route |
| R6 | Meal plan generation exceeds the 5-second NFR under a typical recipe base; regression is not detected until user-visible latency complaints arrive. | Medium | Medium | PRD NFR-01 ("Generowanie planu tygodniowego jest dostępne dla użytkownika w czasie poniżej 5 sekund"); roadmap F-02 (timing measurement not yet wired) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context needed | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| R1 | Trigger an ingredient insert failure after recipe row succeeds; confirm API returns non-2xx and no orphan recipe row exists in DB after the call. | "No error in the response body means the operation succeeded." Also challenge: "error flag set on a response that includes `data` is handled correctly by the POST handler." | Entry point: POST /api/recipes; how `createRecipe` propagates mixed `{data, error}` returns; whether the API handler checks `error` independently of `data`. | Integration test: mock/seed a Supabase scenario where ingredient insert fails; assert HTTP status + DB state. | Happy-path-only assertion; asserting current output without verifying DB state; testing only the service layer without the HTTP boundary. |
| R2 | After S-02 ships: call the plan generation endpoint with a known recipe base; count meal slots in the response; assert count === 21 and every slot references a valid recipe owned by the caller. | "Any response with HTTP 200 is a complete plan." Also: "plan output correctness is obvious from eyeballing the UI." | S-02 plan generation endpoint shape, response schema, and what "a slot" looks like in the JSON. | Integration test: fixture recipe base → generate → parse response → count slots + validate references. | Asserting the response shape from the code that builds it (oracle problem); using snapshots of current output as "correct." |
| R3 | Set up two users with distinct recipes; user B attempts GET/PATCH/DELETE on user A's recipe ID; assert 403 is returned and no data is leaked or mutated. | "RLS policy covers all paths, including edge cases." Also: "ghost recipe rows from R1 can't be accessed cross-user." | Supabase RLS policy coverage for recipe and plan resources; whether ghost recipe state (R1) bypasses ownership checks. | Integration test (the SQL pgTAP tests in `supabase/tests/recipe_rls.sql` already cover direct DB access — extend or complement with HTTP-level cross-user tests). | Testing only the same-user happy path; trusting RLS alone without HTTP-layer ownership assertion; skipping orphan-state scenarios. |
| R4 | After S-02 ships: call the shopping list endpoint; assert that every item has a `storage_type` field resolved to `fresh` or `durable`; assert that the response has two distinct sections, one for each type; assert no item appears in both. | "A list with items is a split list." Also: "if there are no durable items, an empty section is fine and the UI will handle it." | S-02 shopping list response schema; how `storage_type` from `recipe_ingredients` is aggregated into the list output. | Integration test: fixture recipe base with known fresh/durable ingredients → generate → assert split structure and no cross-category leakage. | Snapshot test of current output; asserting only that both keys exist in the JSON without checking item assignment. |
| R5 | Enumerate all route files under `src/pages/`; assert that every route that is not a public page is present in `PROTECTED_ROUTES`; alternatively, make a real HTTP request to a protected URL without auth and assert redirect to sign-in. | "If it builds and deploys, the route is protected." Also: "middleware guards everything under `/` if it's not in the allow-list." | How `PROTECTED_ROUTES` in `src/middleware.ts` is evaluated and what the fallback is for unlisted routes. | Unit/static test: enumerate route files and compare against `PROTECTED_ROUTES` list; OR an integration smoke test hitting each route without a session token. | Trusting middleware coverage by reading its code; never actually making an unauthenticated request to the route. |
| R6 | Run the perf check script (`scripts/recipes-perf-check.ts`) after S-02 ships with a representative recipe base (≥ 20 recipes per user); assert p95 list + plan generation < 300 ms and < 5 000 ms respectively. | "Works fast locally with 2 test recipes." Also: "Cloudflare Worker cold start skews the number." | S-02 plan generation implementation; whether the generator is a rotation algorithm (fast) or involves an external API call (slow + variable). | Automated perf script (already scaffolded in `scripts/recipes-perf-check.ts`); extend for plan generation endpoint once S-02 lands. | Benchmarking only the service layer; ignoring Worker cold start; using a trivially small recipe base for the test. |

---

## §3 Phased Rollout

Status vocabulary: `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`

| # | Phase name | Goal | Risks covered | Test types | Change folder | Status |
|---|---|---|---|---|---|---|
| 1 | Recipe domain atomicity and IDOR baseline | Prove that recipe create/update/delete are transactionally consistent; prove cross-user access is blocked at the HTTP boundary | R1, R3 | Integration (HTTP-layer), unit | context/changes/testing-recipe-domain-atomicity | change opened |
| 2 | Critical user flows — plan completeness and auth gates | Prove that meal plan output always has 21 slots and references only user-owned recipes; prove that shopping list is always split; prove that all protected routes reject unauthenticated requests | R2, R4, R5 | Integration (HTTP + contract), static analysis | — | not started |
| 3 | Performance baseline and quality gates wiring | Lock CI enforcement (lint + typecheck + test suite on every push); validate plan generation p95 < 5 s for representative recipe base | R6 | Perf script, CI gate configuration | — | not started |

> §3 is the orchestrator state. `/10x-test-plan` re-reads this table on every invocation and updates Status and Change folder cells as the rollout advances. Do not rename the Phase name column; do not add Status values outside the vocabulary above.

---

## §4 Stack

| Layer | Technology | Test runner / tool |
|---|---|---|
| Language | TypeScript 5 | — |
| Web framework | Astro 5 (SSR, Cloudflare adapter) | — |
| Database | Supabase (Postgres + RLS) | pgTAP (`supabase/tests/*.sql`) |
| Runtime | Cloudflare Workers | — |
| Unit/integration | Vitest | `npx vitest run` (or `npm test` if wired in package.json) |
| Perf scripts | TypeScript / Supabase client | `scripts/recipes-perf-check.ts` |
| CI | GitHub Actions | `npm ci` → `astro sync` → `lint` → `build` (currently; tests not yet in CI) |
| E2e | None wired | Not warranted at current MVP scale |

**Stack grounding tools (current session):**
- Docs: none — no Context7 or framework docs MCP available; grounded from local manifests and `vitest.config.ts`; checked: 2026-06-24
- Search: none — no Exa.ai or web search MCP available; checked: 2026-06-24
- Runtime/browser: none — no Playwright MCP; e2e not recommended at this scale; checked: 2026-06-24
- Provider/platform: none — no Supabase, Cloudflare, or GitHub MCP available; checked: 2026-06-24

---

## §5 Quality Gates

| Gate | Command | Required | Timing |
|---|---|---|---|
| Lint | `npm run lint` | Yes | On every push (CI); local pre-commit hook recommended |
| Typecheck | `npx tsc --noEmit` | Yes | Required wired in CI after §3 Phase 3 (not currently in CI) |
| Unit + integration suite | `npx vitest run` | Yes | Required wired in CI after §3 Phase 1 |
| SQL policy tests | `supabase test db` (or `pg_prove`) | Yes | Required locally; CI wiring in §3 Phase 3 |
| Performance baseline | `npx tsx scripts/recipes-perf-check.ts` | Required after §3 Phase 3 | Run on demand / feature-branch PR for S-02 and beyond |
| E2e | — | Not required at MVP | Revisit at §3 Phase 3 if Cloudflare Worker routing issues surface |

**Post-edit hook (recommended local, not CI substitute):** run `npm run lint` and `npx vitest run --changed` before pushing.

---

## §6 Cookbook

This section fills in as each rollout phase ships. After Phase N is complete, `/10x-plan` for that phase adds a sub-phase that writes the relevant entry below. After all phases, §6 becomes the canonical answer to "how do I add a test for X in this project?"

### 6.1 Recipe API integration test (HTTP boundary)

TBD — see §3 Phase 1 for recipe atomicity / IDOR test pattern. Will cover: how to mock a Supabase partial-failure response, how to assert HTTP status codes independently of `data` in the response, how to use two-user fixtures.

### 6.2 Cross-user ownership test fixture

TBD — see §3 Phase 1 for cross-user IDOR test pattern. Will cover: how to set up two users in Vitest fixtures without live Supabase, how to assert 403 vs 200 on same resource ID.

### 6.3 Meal plan completeness test

TBD — see §3 Phase 2 for plan completeness pattern (after S-02 ships). Will cover: fixture recipe base shape, how to count slots in plan response, oracle: assert against PRD spec (21 slots) not against code output.

### 6.4 Shopping list split assertion

TBD — see §3 Phase 2 for shopping list split test pattern (after S-02 ships). Will cover: which field carries `storage_type`, how to assert two disjoint categories, how to catch the "no-split" regression.

### 6.5 Protected route smoke assertion

TBD — see §3 Phase 2 for auth gate pattern. Will cover: how to enumerate route files, how to compare against `PROTECTED_ROUTES`, or how to make an unauthenticated HTTP request to a route and assert redirect.

### 6.6 Plan generation performance baseline

TBD — see §3 Phase 3 for perf baseline pattern. Will cover: representative dataset size, how to extend `scripts/recipes-perf-check.ts` for plan generation, p95 threshold, CI integration.

---

## §7 Negative Space

What this rollout deliberately does not test, and why.

| Area | Reason |
|---|---|
| Auth pages (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) | Thin wrappers over Supabase Auth client. Regression would surface as Supabase SDK behavior change, not product logic error. |
| UI snapshot tests for recipe cards and layout components | Marketing-adjacent; would break on every style change without catching logic regressions. Cost exceeds signal at MVP scale. |
| Generated TypeScript types from Supabase schema | The generator is the test. Type errors surface at compile time via `tsc --noEmit`. |
| Import/file upload flows | Explicitly out of scope per PRD Non-Goals (no PDF/DOCX import). |
| Multi-user collaborative planning | PRD Non-Goals. |
| Mobile layout / responsiveness | PRD explicitly scopes MVP to web only. |
| Admin tooling | No admin surface exists in MVP. |
| Supabase Auth internals (JWT expiry, refresh token rotation) | Supabase vendor responsibility; outside product logic boundary. |

> Note: user stated "no strong opinions yet" on negative space (Q5). This section is derived from PRD Non-Goals and practical cost × signal assessment. Revisit with `/10x-test-plan --refresh` if team gains stronger opinions after first rollout phase ships.
