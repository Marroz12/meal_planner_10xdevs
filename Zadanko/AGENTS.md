# Repository Guidelines

This workspace contains planning artifacts and a scaffolded app in `.bootstrap-scaffold/` for the meal-plan MVP. Treat `context/` as source-of-truth documentation and `.bootstrap-scaffold/` as the only implementation area.

## Hard Rules / Agent-Specific Instructions

- Never write to `context/archive/`.
- Do not delete or rewrite historical records under `context/changes/`.
- Implement application code only in `.bootstrap-scaffold/` unless the task is explicitly about docs/process files.
- Before feature work, read `@context/foundation/prd.md`, `@context/foundation/tech-stack.md`, and `@context/changes/bootstrap-verification/verification.md`.
- Link to canonical docs instead of duplicating long explanations from `@.bootstrap-scaffold/README.md` or `@.bootstrap-scaffold/CLAUDE.md`.

## Project Structure & Module Organization

- Product context and planning: `context/foundation/`.
- Bootstrap/audit history: `context/changes/bootstrap-verification/`.
- Application runtime code: `.bootstrap-scaffold/src/` with `pages/`, `components/`, `lib/`, `layouts/`, `styles/`, and `middleware.ts`.
- Deployment/config for the app: `@.bootstrap-scaffold/wrangler.jsonc`, `@.bootstrap-scaffold/astro.config.mjs`, `@.bootstrap-scaffold/tsconfig.json`.

## Build, Test, and Development Commands

Run commands from `.bootstrap-scaffold/`.

- `npm run dev` - local development server.
- `npm run lint` - ESLint checks.
- `npm run lint:fix` - auto-fix lint issues.
- `npm run build` - production build.
- `npm run preview` - preview built app.
- `npm run format` - Prettier formatting.

## Coding Style & Naming Conventions

- Use Astro components for static/layout content; use React only for interactive islands.
- Use `@/*` imports for `src/*` paths.
- Use `cn()` from `@/lib/utils` for Tailwind class merging; do not hand-concatenate conditional class strings.
- Place shared logic in `src/lib/`; shared DTO/entity types in `src/types.ts`.
- For API routes, use explicit method exports and input validation.

## Testing, CI, and Configuration

- CI in `@.bootstrap-scaffold/.github/workflows/ci.yml` runs `npm ci`, `npx astro sync`, `npm run lint`, and `npm run build`.
- CI build requires `SUPABASE_URL` and `SUPABASE_KEY` secrets.
- Local env setup is defined in `@.bootstrap-scaffold/.env.example`; Cloudflare local secrets belong in `.dev.vars`.
- On Windows PowerShell, use `npm.cmd`/`npx.cmd` if script execution policy blocks `npm.ps1` or `npx.ps1`.
