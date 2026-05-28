-- ============================================================
-- ROLLBACK STEPS:
--
--   REVOKE EXECUTE ON FUNCTION public.update_recipe_with_ingredients(uuid, jsonb, jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.update_recipe_with_ingredients(uuid, jsonb, jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_recipe_with_ingredients(
  p_recipe_id uuid,
  p_payload jsonb,
  p_ingredients jsonb
)
RETURNS public.recipes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ingredient_item jsonb;
  updated_recipe public.recipes;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'ingredients must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.recipes
  SET
    name = CASE
      WHEN p_payload ? 'name' THEN p_payload->>'name'
      ELSE name
    END,
    description = CASE
      WHEN p_payload ? 'description' THEN NULLIF(TRIM(COALESCE(p_payload->>'description', '')), '')
      ELSE description
    END,
    prep_time_minutes = CASE
      WHEN p_payload ? 'prep_time_minutes' THEN (p_payload->>'prep_time_minutes')::integer
      ELSE prep_time_minutes
    END,
    updated_at = NOW()
  WHERE id = p_recipe_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  RETURNING * INTO updated_recipe;

  IF updated_recipe IS NULL THEN
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

  RETURN updated_recipe;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_recipe_with_ingredients(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_recipe_with_ingredients(uuid, jsonb, jsonb) TO authenticated;
