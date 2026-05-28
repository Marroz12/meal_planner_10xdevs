import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createRecipe, listRecipes } from "@/lib/services/recipes";
import {
  createRecipeSchema,
  normalizeValidationError,
  parseJsonBody,
} from "@/lib/validation/recipes";
import { jsonError, jsonSuccess, logApiEvent, mapSupabaseError } from "@/lib/api/errors";

function getUserContext(context: Parameters<APIRoute>[0]) {
  const user = context.locals.user;

  if (!user) {
    return { userId: null, response: jsonError("UNAUTHORIZED", "Authentication required", 401) };
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return { userId: null, response: jsonError("INTERNAL_ERROR", "Supabase is not configured", 500) };
  }

  return { userId: user.id, supabase, response: null };
}

export const GET: APIRoute = async (context) => {
  const auth = getUserContext(context);
  if (auth.response) {
    logApiEvent({ action: "recipes.list", outcome: "denied", status: 401, code: "UNAUTHORIZED" });
    return auth.response;
  }

  const { data, error } = await listRecipes(auth.supabase, auth.userId);
  if (error) {
    const mapped = mapSupabaseError(error);
    logApiEvent({
      action: "recipes.list",
      outcome: "error",
      status: mapped.status,
      code: mapped.code,
      userId: auth.userId,
      reason: error.message,
    });
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  logApiEvent({ action: "recipes.list", outcome: "success", status: 200, userId: auth.userId });
  return jsonSuccess({ recipes: data ?? [] });
};

export const POST: APIRoute = async (context) => {
  const auth = getUserContext(context);
  if (auth.response) {
    logApiEvent({ action: "recipes.create", outcome: "denied", status: 401, code: "UNAUTHORIZED" });
    return auth.response;
  }

  const body = await parseJsonBody(context.request);
  const parsed = createRecipeSchema.safeParse(body);

  if (!parsed.success) {
    const message = normalizeValidationError(parsed.error);
    logApiEvent({
      action: "recipes.create",
      outcome: "denied",
      status: 400,
      code: "VALIDATION_ERROR",
      userId: auth.userId,
      reason: message,
    });
    return jsonError("VALIDATION_ERROR", message, 400);
  }

  const { data, error } = await createRecipe(auth.supabase, auth.userId, parsed.data);
  if (error || !data) {
    const mapped = mapSupabaseError(error);
    logApiEvent({
      action: "recipes.create",
      outcome: "error",
      status: mapped.status,
      code: mapped.code,
      userId: auth.userId,
      reason: error?.message,
    });
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  logApiEvent({
    action: "recipes.create",
    outcome: "success",
    status: 201,
    userId: auth.userId,
    recipeId: data.id,
  });
  return jsonSuccess({ recipe: data }, 201);
};
