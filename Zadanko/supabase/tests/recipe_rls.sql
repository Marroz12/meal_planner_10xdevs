-- RLS policy verification for recipe_domain_base
-- Run with: npx supabase test db
-- Requires pgTAP extension (installed by default in Supabase local dev)
--
-- Rollback safety: entire file runs inside a transaction and is always
-- rolled back at the end — no persistent data is left behind.

BEGIN;

SELECT plan(14);

-- ============================================================
-- Override auth.uid() to simulate authenticated users in tests
-- The set_config / current_setting pattern is the standard
-- Supabase local-dev approach for pgTAP RLS testing.
-- ============================================================

CREATE OR REPLACE FUNCTION set_auth_uid(user_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_id::text)::text, true);
END;
$$;

-- ============================================================
-- Seed test data as superuser (bypasses RLS for setup only)
-- ============================================================

-- Seed minimal auth.users rows (local dev only — do not run against prod)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'user-a@test.local', 'x', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'user-b@test.local', 'x', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Seed recipes as superuser (bypasses RLS)
INSERT INTO public.recipes (id, user_id, name)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'User A Recipe'),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'User B Recipe')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Switch to authenticated role so RLS policies are enforced
-- ============================================================

SET LOCAL ROLE authenticated;

-- ================================================================
-- Phase 1: Same-user SELECT allows
-- ================================================================

PERFORM set_auth_uid('aaaaaaaa-0000-0000-0000-000000000001');

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '11111111-0000-0000-0000-000000000001'),
  1,
  '1.1 User A can SELECT own recipe'
);

-- ================================================================
-- Phase 2: Cross-user SELECT denies
-- ================================================================

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '22222222-0000-0000-0000-000000000002'),
  0,
  '2.1 User A cannot SELECT User B recipe'
);

PERFORM set_auth_uid('bbbbbbbb-0000-0000-0000-000000000002');

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '11111111-0000-0000-0000-000000000001'),
  0,
  '2.2 User B cannot SELECT User A recipe'
);

-- ================================================================
-- Phase 3: Same-user INSERT allows
-- ================================================================

PERFORM set_auth_uid('aaaaaaaa-0000-0000-0000-000000000001');

SELECT lives_ok(
  $$INSERT INTO public.recipes (id, user_id, name)
    VALUES ('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'User A New Recipe')$$,
  '3.1 User A can INSERT own recipe'
);

-- ================================================================
-- Phase 4: Cross-user INSERT denies (user_id spoofing)
-- ================================================================

SELECT throws_ok(
  $$INSERT INTO public.recipes (id, user_id, name)
    VALUES ('44444444-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', 'Spoofed Recipe')$$,
  '4.1 User A cannot INSERT recipe with User B as owner'
);

-- ================================================================
-- Phase 5: Same-user UPDATE allows
-- ================================================================

SELECT is(
  (SELECT count(*)::int
   FROM public.recipes
   WHERE id = '11111111-0000-0000-0000-000000000001' AND name = 'Updated by A'),
  0,
  '5.0 Pre-condition: recipe not yet updated'
);

UPDATE public.recipes SET name = 'Updated by A' WHERE id = '11111111-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*)::int
   FROM public.recipes
   WHERE id = '11111111-0000-0000-0000-000000000001' AND name = 'Updated by A'),
  1,
  '5.1 User A can UPDATE own recipe'
);

-- ================================================================
-- Phase 6: Cross-user UPDATE denies (zero rows affected)
-- ================================================================

UPDATE public.recipes SET name = 'Tampered' WHERE id = '22222222-0000-0000-0000-000000000002';

SELECT is(
  (SELECT count(*)::int
   FROM public.recipes
   WHERE id = '22222222-0000-0000-0000-000000000002' AND name = 'Tampered'),
  0,
  '6.1 User A UPDATE on User B recipe affects 0 rows'
);

-- ================================================================
-- Phase 7: Same-user soft-delete (UPDATE deleted_at) allows
-- ================================================================

UPDATE public.recipes SET deleted_at = now() WHERE id = '33333333-0000-0000-0000-000000000003';

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '33333333-0000-0000-0000-000000000003' AND deleted_at IS NOT NULL),
  1,
  '7.1 User A can soft-delete own recipe via deleted_at'
);

-- ================================================================
-- Phase 8: Same-user DELETE (hard) allows
-- ================================================================

SELECT lives_ok(
  $$DELETE FROM public.recipes WHERE id = '11111111-0000-0000-0000-000000000001'$$,
  '8.1 User A can hard-DELETE own recipe'
);

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '11111111-0000-0000-0000-000000000001'),
  0,
  '8.2 Deleted recipe no longer visible'
);

-- ================================================================
-- Phase 9: Cross-user DELETE denies (zero rows affected)
-- ================================================================

PERFORM set_auth_uid('aaaaaaaa-0000-0000-0000-000000000001');

DELETE FROM public.recipes WHERE id = '22222222-0000-0000-0000-000000000002';

SELECT is(
  (SELECT count(*)::int FROM public.recipes WHERE id = '22222222-0000-0000-0000-000000000002'),
  1,
  '9.1 User A DELETE on User B recipe affects 0 rows (row still exists)'
);

-- ================================================================
-- Phase 10: recipe_ingredients inherit owner isolation
-- ================================================================

-- Insert ingredient for User B recipe as User A (should fail — no matching recipe visible)
SELECT throws_ok(
  $$INSERT INTO public.recipe_ingredients (recipe_id, name)
    VALUES ('22222222-0000-0000-0000-000000000002', 'Spoofed Ingredient')$$,
  '10.1 User A cannot INSERT ingredient into User B recipe'
);

SELECT * FROM finish();

ROLLBACK;
