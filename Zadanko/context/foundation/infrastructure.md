---
project: meal-plan
researched_at: 2026-05-26T00:00:00Z
recommended_platform: Cloudflare Workers + Pages
runner_up: Netlify
context_type: mvp
tech_stack:
  language: JavaScript/TypeScript
  framework: Astro 6
  runtime: Cloudflare Workers (via @astrojs/cloudflare)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

For this Astro-based MVP, Cloudflare scores highest on CLI-first operations, managed serverless ergonomics, and low-cost operation at 10k-100k monthly requests. Your interview answers also reinforce this choice: no persistent always-on process requirement, cost-first priority, single-region acceptable, and external providers allowed. With Astro 6 + `@astrojs/cloudflare` already selected in the stack, this path minimizes integration friction and time-to-first-production release.

## Platform Comparison

Scoring legend: Pass = 2, Partial = 1, Fail = 0.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers + Pages | Pass | Pass | Pass | Pass | Pass | 10 |
| Vercel | Pass | Pass | Pass | Pass | Pass | 10 |
| Netlify | Pass | Pass | Pass | Pass | Pass | 10 |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 7 |
| Railway | Pass | Partial | Pass | Pass | Pass | 8 |
| Render | Pass | Partial | Pass | Pass | Pass | 8 |

Cloudflare Workers + Pages: Excellent fit for Astro edge/serverless deployment, strong `wrangler` CLI (`deploy`, `tail`, versions), broad managed primitives (D1, R2, KV, Queues, Durable Objects), and strong cost profile for low traffic. Durable Objects and D1 are GA (checked 2026-05-26).

Vercel: Strong CLI and DX, first-class docs and agent integration, but less aligned with your Cloudflare-oriented starter direction and no persistent process model if future requirements drift toward always-on workers.

Netlify: Very strong MVP economics and workflow, mature CLI and MCP story, plus straightforward Astro support. It ranks as runner-up because your selected stack and deployment direction are already Cloudflare-native.

Fly.io: Excellent when persistent processes and container-level control are required; less "managed-serverless" than top options for this MVP and usually higher operational overhead for a solo after-hours project.

Railway: Strong DX and integrated managed services with official MCP support; however, always-on service cost profile is typically less favorable than edge/serverless for low predictable MVP traffic.

Render: Broad platform capabilities and official MCP support with good docs, but for this specific stack and cost-first MVP constraints it is usually a fallback behind Cloudflare/Netlify.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Wins on stack alignment (Astro + Cloudflare adapter), low MVP cost at your target traffic, and strong CLI-driven operations that match agent-friendly criteria.

#### 2. Netlify

Very competitive on cost and DX with strong automation tooling, but slightly weaker stack-alignment versus your current cloudflare-oriented setup.

#### 3. Render

Good fallback with broad runtime flexibility and operational tooling; loses mostly on expected cost/ops simplicity for this exact MVP profile.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. Vendor lock-in risk grows quickly if the app relies deeply on Cloudflare-specific primitives (Durable Objects, D1, KV).
2. Workers runtime is not identical to full Node.js; some npm packages may behave differently despite compatibility flags.
3. Edge/serverless observability can be harder to reason about than a single long-running server, especially during multi-service incidents.
4. Rollback of app code is fast, but data changes (schema/migrations) are not automatically reversible and can leave the system in mixed states.
5. CPU-time/quota limits can create cost or reliability surprises if SSR paths are not monitored and optimized.

### Pre-Mortem — How This Could Fail

The team assumed that choosing Cloudflare would automatically reduce operational risk because traffic was small and the platform was managed. Early deployments looked successful, but no one created a hard compatibility checklist for the Workers runtime. A few dependencies behaved differently in production than in local development, especially around SSR edge paths and auth/session handling. To keep velocity, releases continued without a strict migration policy for data changes. Then one deployment introduced a schema update and a subtle app bug at the same time. Rolling back code was quick, but data state remained partially migrated, causing endpoint failures and inconsistent user flows. Incident response relied mostly on ad-hoc log tailing, without clear alert thresholds or ownership for rollback gates. Over time, each release required more manual verification, and confidence in deployment speed dropped. Six months later, the platform itself was not the main problem; the failure came from underestimating runtime differences, migration discipline, and operational guardrails needed for reliable iteration.

### Unknown Unknowns

- Runtime differences between local dev and edge execution often appear only in specific SSR/auth paths, not in happy-path smoke tests.
- Some platform features or limits may vary by plan/region and are easy to miss when reading only top-level product pages.
- Preview environments need explicit access policy; otherwise test data or internal features can leak.
- External provider integrations (for example auth/database) can introduce subtle connection-limit or timeout behavior under edge execution.
- Migration difficulty away from Cloudflare increases non-linearly with each additional platform-native service adopted.

## Operational Story

- **Preview deploys**: Use Cloudflare Pages preview deployments per branch/PR. Protect non-public previews with Cloudflare Access when needed.
- **Secrets**: Keep runtime secrets in Cloudflare via `wrangler secret put` and CI secrets in GitHub Actions secrets. Restrict write access to maintainers; rotate with explicit owner approval.
- **Rollback**: Roll back app versions using Pages/Workers version history (or re-deploy prior known-good commit). Typical revert is minutes; database/schema changes require separate rollback plan.
- **Approval**: Human approval required for production publish, primary secret rotation, and destructive data operations. Agent may perform read-only checks, preview deploys, and non-destructive log inspection.
- **Logs**: Use `npx wrangler tail` for runtime logs and GitHub Actions logs for pipeline status; keep production access read-only by default for agent sessions.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Deep lock-in to Cloudflare-native data/compute services | Devil's advocate | M | H | Keep service boundaries explicit; prefer adapter layers for storage/auth; review portability quarterly. |
| Runtime incompatibility with Node-oriented libraries | Devil's advocate | M | H | Enforce production-like smoke tests on Workers runtime before each release; track unsupported packages. |
| Code rollback without safe data rollback | Pre-mortem | M | H | Introduce migration gates, reversible migration policy, and separate data-change approvals. |
| Weak incident detection from ad-hoc logging | Pre-mortem | M | M | Define error/latency alert thresholds and release checklist with owner sign-off. |
| Quota/CPU-time surprises under SSR load | Research finding | M | M | Add usage dashboards and monthly budget guardrails; optimize heavy SSR routes early. |
| Preview environment data exposure | Unknown unknowns | L | M | Put preview routes behind Access policy and sanitize non-production data. |

## Getting Started

1. In `Zadanko/.bootstrap-scaffold`, install dependencies and verify Node version from `.nvmrc` (target 22.14.0).
2. Verify Cloudflare auth with `npx wrangler whoami`.
3. Ensure Astro Cloudflare adapter is in use (`@astrojs/cloudflare` already present) and build with `npm run build`.
4. Set required secrets in Cloudflare: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
5. Deploy with `npx wrangler deploy` and validate runtime behavior using `npx wrangler tail` plus a smoke test of auth-protected routes.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
