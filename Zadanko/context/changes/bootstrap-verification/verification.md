---
bootstrapped_at: 2026-05-21T20:33:12Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: meal-plan
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: failed
audit_command: npm audit --json
---

## Hand-off

---
starter_id: 10x-astro-starter
package_manager: npm
project_name: meal-plan
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

This project is a small, after-hours web MVP with a three-week timeline, so a mainstream, opinionated starter with strong defaults is the safest path. 10x Astro Starter fits that profile by combining a typed full-stack setup, clear conventions, and integrated auth/database/deployment primitives that reduce setup overhead before feature work starts. Cloudflare Pages keeps first deploy simple, and GitHub Actions with auto-deploy on merge matches the fastest feedback loop for solo delivery. Given the short schedule and the choice to follow the recommended path, this selection prioritizes predictable scaffolding and low-friction execution over custom architecture work.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | not-applicable | cmd_template starts with git clone |
| GitHub repo | not run | unknown | gh CLI unavailable in environment |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 1
**Stderr (last 20 lines)**:

```text
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system. For more information, see about_Execution_Policies at https:/go.microsoft.com/fwlink/?LinkID=135170.
At line:1 char:235
+ ... { exit $LASTEXITCODE }; Set-Location .bootstrap-scaffold; npm install ...
+                                                               ~~~
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess
```

**.bootstrap-scaffold left in place at**: `.bootstrap-scaffold/`

## Post-scaffold audit

**Audit not run**: scaffold halted at Step 2; no project to audit.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | false |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | false |

## Next steps

Scaffold stopped before merge because npm could not run under the current PowerShell execution policy. Fix execution policy or run npm via npm.cmd, then re-run bootstrap.
