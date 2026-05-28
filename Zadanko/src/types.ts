// Domain types for recipe entities and API contracts

// --- Database row types ---

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  prep_time_minutes: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  storage_type: "fresh" | "durable";
  created_at: string;
}

// --- DTO / payload types ---

export interface CreateRecipePayload {
  name: string;
  description?: string | null;
  prep_time_minutes?: number | null;
  ingredients?: CreateIngredientPayload[];
}

export interface CreateIngredientPayload {
  name: string;
  quantity?: string | null;
  unit?: string | null;
  storage_type?: "fresh" | "durable";
}

export interface UpdateRecipePayload {
  name?: string;
  description?: string | null;
  prep_time_minutes?: number | null;
  ingredients?: CreateIngredientPayload[];
}

// --- API response envelope ---

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface ApiSuccessResponse<T> {
  data: T;
  error: null;
}

export interface ApiErrorResponse {
  data: null;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
