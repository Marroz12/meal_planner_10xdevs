import type { SupabaseClient } from "@supabase/supabase-js";
import type { Recipe, RecipeIngredient, CreateRecipePayload, UpdateRecipePayload } from "@/types";

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: RecipeIngredient[];
}

/**
 * List all active (non-deleted) recipes for the authenticated user.
 * RLS enforces ownership; this filter adds the soft-delete invariant.
 */
export async function listRecipes(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: RecipeWithIngredients[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return { data: data as RecipeWithIngredients[] | null, error };
}

/**
 * Get a single active recipe by ID for the authenticated user.
 */
export async function getRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
): Promise<{ data: RecipeWithIngredients | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  return { data: data as RecipeWithIngredients | null, error };
}

/**
 * Create a new recipe with optional ingredients for the authenticated user.
 */
export async function createRecipe(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateRecipePayload,
): Promise<{ data: Recipe | null; error: Error | null }> {
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      user_id: userId,
      name: payload.name,
      description: payload.description ?? null,
      prep_time_minutes: payload.prep_time_minutes ?? null,
    })
    .select()
    .single();

  if (recipeError || !recipe) {
    return { data: null, error: recipeError };
  }

  if (payload.ingredients && payload.ingredients.length > 0) {
    const ingredientRows = payload.ingredients.map((ing) => ({
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      storage_type: ing.storage_type ?? "fresh",
    }));

    const { error: ingError } = await supabase.from("recipe_ingredients").insert(ingredientRows);

    if (ingError) {
      return { data: recipe as Recipe, error: ingError };
    }
  }

  return { data: recipe as Recipe, error: null };
}

/**
 * Update a recipe owned by the authenticated user.
 */
export async function updateRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  payload: UpdateRecipePayload,
): Promise<{ data: Recipe | null; error: Error | null }> {
  const { ingredients, ...recipePatch } = payload;

  if (ingredients !== undefined) {
    const { data, error } = await supabase.rpc("update_recipe_with_ingredients", {
      p_recipe_id: recipeId,
      p_payload: recipePatch,
      p_ingredients: ingredients,
    });

    if (error || !data) {
      return { data: null, error };
    }

    return { data: data as Recipe, error: null };
  }

  const { data, error } = await supabase
    .from("recipes")
    .update({
      ...recipePatch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    return { data: data as Recipe | null, error };
  }

  return { data: data as Recipe | null, error };
}

/**
 * Soft-delete a recipe owned by the authenticated user.
 * Sets deleted_at instead of removing the row.
 */
export async function deleteRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
): Promise<{ data: Recipe | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("recipes")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select()
    .single();

  return { data: data as Recipe | null, error };
}
