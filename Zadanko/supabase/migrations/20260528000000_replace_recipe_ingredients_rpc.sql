-- ============================================================
-- ROLLBACK STEPS:
--
--   REVOKE EXECUTE ON FUNCTION public.replace_recipe_ingredients(uuid, jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.replace_recipe_ingredients(uuid, jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION public.replace_recipe_ingredients(
  p_recipe_id uuid,
  p_ingredients jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ingredient_item jsonb;
BEGIN
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'ingredients must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.recipes
    WHERE id = p_recipe_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'recipe does not belong to authenticated user'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.recipe_ingredients
  WHERE recipe_id = p_recipe_id;

  FOR ingredient_item IN SELECT value FROM jsonb_array_elements(p_ingredients)
  LOOP
    INSERT INTO public.recipe_ingredients (
      recipe_id,
      name,
      quantity,
      unit,
      storage_type
    )
    VALUES (
      p_recipe_id,
      NULLIF(TRIM(ingredient_item->>'name'), ''),
      NULLIF(TRIM(COALESCE(ingredient_item->>'quantity', '')), ''),
      NULLIF(TRIM(COALESCE(ingredient_item->>'unit', '')), ''),
      COALESCE(NULLIF(TRIM(ingredient_item->>'storage_type'), ''), 'fresh')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_recipe_ingredients(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_recipe_ingredients(uuid, jsonb) TO authenticated;