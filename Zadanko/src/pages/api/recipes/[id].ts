import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteRecipe, getRecipe, updateRecipe } from "@/lib/services/recipes";
import {
  normalizeValidationError,
  parseJsonBody,
  recipeIdSchema,
  updateRecipeSchema,
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

function validateRecipeId(params: Record<string, string | undefined>): {
  recipeId: string | undefined;
  response: Response | null;
} {
  const parsed = recipeIdSchema.safeParse({ id: params.id });
  if (!parsed.success) {
    const message = normalizeValidationError(parsed.error);
    return {
      recipeId: undefined,
      response: jsonError("VALIDATION_ERROR", message, 400),
    };
  }

  return {
    recipeId: parsed.data.id,
    response: null,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = getUserContext(context);
  if (auth.response) {
    logApiEvent({ action: "recipes.get", outcome: "denied", status: 401, code: "UNAUTHORIZED" });
    return auth.response;
  }

  const idCheck = validateRecipeId(context.params);
  if (idCheck.response) {
    logApiEvent({
      action: "recipes.get",
      outcome: "denied",
      status: 400,
      code: "VALIDATION_ERROR",
      userId: auth.userId,
    });
    return idCheck.response;
  }
  const recipeId = idCheck.recipeId;
  if (!recipeId) {
    return jsonError("VALIDATION_ERROR", "Recipe id is required", 400);
  }

  const { data, error } = await getRecipe(auth.supabase, auth.userId, recipeId);
  if (error) {
    const mapped = mapSupabaseError(error);
    logApiEvent({
      action: "recipes.get",
      outcome: "error",
      status: mapped.status,
      code: mapped.code,
      userId: auth.userId,
      recipeId,
      reason: error.message,
    });
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  if (!data) {
    logApiEvent({
      action: "recipes.get",
      outcome: "denied",
      status: 403,
      code: "FORBIDDEN",
      userId: auth.userId,
      recipeId,
      reason: "Recipe does not belong to user or does not exist",
    });
    return jsonError("FORBIDDEN", "Recipe does not belong to the authenticated user", 403);
  }

  logApiEvent({
    action: "recipes.get",
    outcome: "success",
    status: 200,
    userId: auth.userId,
    recipeId,
  });
  return jsonSuccess({ recipe: data });
};

export const PATCH: APIRoute = async (context) => {
  const auth = getUserContext(context);
  if (auth.response) {
    logApiEvent({ action: "recipes.update", outcome: "denied", status: 401, code: "UNAUTHORIZED" });
    return auth.response;
  }

  const idCheck = validateRecipeId(context.params);
  if (idCheck.response) {
    logApiEvent({
      action: "recipes.update",
      outcome: "denied",
      status: 400,
      code: "VALIDATION_ERROR",
      userId: auth.userId,
    });
    return idCheck.response;
  }
  const recipeId = idCheck.recipeId;
  if (!recipeId) {
    return jsonError("VALIDATION_ERROR", "Recipe id is required", 400);
  }

  const body = await parseJsonBody(context.request);
  const parsed = updateRecipeSchema.safeParse(body);
  if (!parsed.success) {
    const message = normalizeValidationError(parsed.error);
    logApiEvent({
      action: "recipes.update",
      outcome: "denied",
      status: 400,
      code: "VALIDATION_ERROR",
      userId: auth.userId,
      recipeId,
      reason: message,
    });
    return jsonError("VALIDATION_ERROR", message, 400);
  }

  const { data, error } = await updateRecipe(auth.supabase, auth.userId, recipeId, parsed.data);
  if (error) {
    const mapped = mapSupabaseError(error);
    logApiEvent({
      action: "recipes.update",
      outcome: "error",
      status: mapped.status,
      code: mapped.code,
      userId: auth.userId,
      recipeId,
      reason: error.message,
    });
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  if (!data) {
    logApiEvent({
      action: "recipes.update",
      outcome: "denied",
      status: 403,
      code: "FORBIDDEN",
      userId: auth.userId,
      recipeId,
      reason: "Recipe does not belong to user or is deleted",
    });
    return jsonError("FORBIDDEN", "Recipe does not belong to the authenticated user", 403);
  }

  logApiEvent({
    action: "recipes.update",
    outcome: "success",
    status: 200,
    userId: auth.userId,
    recipeId,
  });
  return jsonSuccess({ recipe: data });
};

export const DELETE: APIRoute = async (context) => {
  const auth = getUserContext(context);
  if (auth.response) {
    logApiEvent({ action: "recipes.delete", outcome: "denied", status: 401, code: "UNAUTHORIZED" });
    return auth.response;
  }

  const idCheck = validateRecipeId(context.params);
  if (idCheck.response) {
    logApiEvent({
      action: "recipes.delete",
      outcome: "denied",
      status: 400,
      code: "VALIDATION_ERROR",
      userId: auth.userId,
    });
    return idCheck.response;
  }
  const recipeId = idCheck.recipeId;
  if (!recipeId) {
    return jsonError("VALIDATION_ERROR", "Recipe id is required", 400);
  }

  const { data, error } = await deleteRecipe(auth.supabase, auth.userId, recipeId);
  if (error) {
    const mapped = mapSupabaseError(error);
    logApiEvent({
      action: "recipes.delete",
      outcome: "error",
      status: mapped.status,
      code: mapped.code,
      userId: auth.userId,
      recipeId,
      reason: error.message,
    });
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  if (!data) {
    logApiEvent({
      action: "recipes.delete",
      outcome: "denied",
      status: 403,
      code: "FORBIDDEN",
      userId: auth.userId,
      recipeId,
      reason: "Recipe does not belong to user or is already deleted",
    });
    return jsonError("FORBIDDEN", "Recipe does not belong to the authenticated user", 403);
  }

  logApiEvent({
    action: "recipes.delete",
    outcome: "success",
    status: 200,
    userId: auth.userId,
    recipeId,
  });
  return jsonSuccess({ recipe: data });
};
