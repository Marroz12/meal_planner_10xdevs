import { z } from "zod";

const storageTypeSchema = z.enum(["fresh", "durable"]);

const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Ingredient name is required").max(200, "Ingredient name is too long"),
  quantity: z.string().trim().max(100, "Ingredient quantity is too long").nullable().optional(),
  unit: z.string().trim().max(50, "Ingredient unit is too long").nullable().optional(),
  storage_type: storageTypeSchema.optional(),
});

export const recipeIdSchema = z.object({
  id: z.uuid("Recipe id must be a valid UUID"),
});

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1, "Recipe name is required").max(200, "Recipe name is too long"),
  description: z.string().trim().max(5000, "Recipe description is too long").nullable().optional(),
  prep_time_minutes: z
    .number()
    .int("Preparation time must be an integer")
    .min(0, "Preparation time cannot be negative")
    .max(1440, "Preparation time cannot exceed 1440 minutes")
    .nullable()
    .optional(),
  ingredients: z.array(ingredientSchema).max(200, "Too many ingredients").optional(),
});

export const updateRecipeSchema = z
  .object({
    name: z.string().trim().min(1, "Recipe name is required").max(200, "Recipe name is too long").optional(),
    description: z.string().trim().max(5000, "Recipe description is too long").nullable().optional(),
    prep_time_minutes: z
      .number()
      .int("Preparation time must be an integer")
      .min(0, "Preparation time cannot be negative")
      .max(1440, "Preparation time cannot exceed 1440 minutes")
      .nullable()
      .optional(),
    ingredients: z.array(ingredientSchema).max(200, "Too many ingredients").optional(),
  })
  .refine((payload) =>
    payload.name !== undefined ||
    payload.description !== undefined ||
    payload.prep_time_minutes !== undefined ||
    payload.ingredients !== undefined,
  {
    message: "At least one field is required to update a recipe",
  });

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function normalizeValidationError(error: z.ZodError): string {
  if (!error.issues.length) {
    return "Validation failed";
  }

  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
