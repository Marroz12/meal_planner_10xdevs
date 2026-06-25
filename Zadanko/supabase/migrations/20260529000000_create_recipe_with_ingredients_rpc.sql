-- ============================================================
-- ROLLBACK STEPS:
--
--   REVOKE EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.create_recipe_with_ingredients(jsonb, jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_recipe_with_ingredients(
  p_payload     jsonb,  -- { name, description?, prep_time_minutes? }
  p_ingredients jsonb   -- array of { name, quantity?, unit?, storage_type? }
)
RETURNS public.recipes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ingredient_item jsonb;
  new_recipe public.recipes;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'ingredients must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.recipes (
    user_id,
    name,
    description,
    prep_time_minutes
  )
  VALUES (
    auth.uid(),
    p_payload->>'name',
    NULLIF(TRIM(COALESCE(p_payload->>'description', '')), ''),
    CASE
      WHEN p_payload ? 'prep_time_minutes' THEN (p_payload->>'prep_time_minutes')::integer
      ELSE NULL
    END
  )
  RETURNING * INTO new_recipe;

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
      new_recipe.id,
      NULLIF(TRIM(ingredient_item->>'name'), ''),
      NULLIF(TRIM(COALESCE(ingredient_item->>'quantity', '')), ''),
      NULLIF(TRIM(COALESCE(ingredient_item->>'unit', '')), ''),
      COALESCE(NULLIF(TRIM(ingredient_item->>'storage_type'), ''), 'fresh')
    );
  END LOOP;

  RETURN new_recipe;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recipe_with_ingredients(jsonb, jsonb) TO authenticated;
