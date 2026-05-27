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