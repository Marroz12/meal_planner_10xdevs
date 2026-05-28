-- ============================================================
-- ROLLBACK STEPS (run in this order to reverse the migration):
--
--   DROP POLICY IF EXISTS "recipe_ingredients_delete_own" ON public.recipe_ingredients;
--   DROP POLICY IF EXISTS "recipe_ingredients_update_own" ON public.recipe_ingredients;
--   DROP POLICY IF EXISTS "recipe_ingredients_insert_own" ON public.recipe_ingredients;
--   DROP POLICY IF EXISTS "recipe_ingredients_select_own" ON public.recipe_ingredients;
--   DROP TABLE IF EXISTS public.recipe_ingredients;
--
--   DROP POLICY IF EXISTS "recipes_delete_own" ON public.recipes;
--   DROP POLICY IF EXISTS "recipes_update_own" ON public.recipes;
--   DROP POLICY IF EXISTS "recipes_insert_own" ON public.recipes;
--   DROP POLICY IF EXISTS "recipes_select_own" ON public.recipes;
--   DROP TABLE IF EXISTS public.recipes;
-- ============================================================

-- recipes: core recipe entity owned by a single user
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  prep_time_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Index for per-user listing (most common query path)
CREATE INDEX idx_recipes_user_id ON public.recipes (user_id);
-- Composite index for listing active (non-deleted) recipes per user
CREATE INDEX idx_recipes_user_active ON public.recipes (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated user can only access own recipes
CREATE POLICY "recipes_select_own" ON public.recipes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "recipes_insert_own" ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recipes_update_own" ON public.recipes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recipes_delete_own" ON public.recipes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- recipe_ingredients: ingredients belonging to a recipe
CREATE TABLE public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity text,
  unit text,
  storage_type text NOT NULL DEFAULT 'fresh'
    CHECK (storage_type IN ('fresh', 'durable')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fetching ingredients by recipe
CREATE INDEX idx_recipe_ingredients_recipe_id ON public.recipe_ingredients (recipe_id);

-- Enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS policies: access via recipe ownership (join to recipes.user_id)
CREATE POLICY "recipe_ingredients_select_own" ON public.recipe_ingredients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_ingredients_insert_own" ON public.recipe_ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_ingredients_update_own" ON public.recipe_ingredients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "recipe_ingredients_delete_own" ON public.recipe_ingredients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );
