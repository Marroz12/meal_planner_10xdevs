import type { ApiErrorCode, ApiErrorResponse, ApiSuccessResponse } from "@/types";

interface SupabaseLikeError {
  code?: string;
  message?: string;
}

export interface ApiLogEvent {
  action: string;
  outcome: "success" | "error" | "denied";
  status: number;
  code?: ApiErrorCode;
  userId?: string;
  recipeId?: string;
  reason?: string;
}

export function jsonSuccess<T>(data: T, status = 200): Response {
  const body: ApiSuccessResponse<T> = {
    data,
    error: null,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function jsonError(code: ApiErrorCode, message: string, status: number): Response {
  const body: ApiErrorResponse = {
    data: null,
    error: {
      code,
      message,
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function mapSupabaseError(error: SupabaseLikeError | null): {
  code: ApiErrorCode;
  status: number;
  message: string;
} {
  if (!error) {
    return {
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Unexpected server error",
    };
  }

  switch (error.code) {
    case "42501":
      return {
        code: "FORBIDDEN",
        status: 403,
        message: "Access denied",
      };
    case "23505":
      return {
        code: "CONFLICT",
        status: 409,
        message: "Resource conflict",
      };
    case "PGRST116":
      return {
        code: "NOT_FOUND",
        status: 404,
        message: "Recipe not found",
      };
    default:
      return {
        code: "INTERNAL_ERROR",
        status: 500,
        message: error.message ?? "Unexpected server error",
      };
  }
}

export function logApiEvent(event: ApiLogEvent): void {
  console.info(
    JSON.stringify({
      scope: "recipes_api",
      timestamp: new Date().toISOString(),
      ...event,
    }),
  );
}
