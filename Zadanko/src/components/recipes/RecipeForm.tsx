import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StorageType = "fresh" | "durable";

interface IngredientInput {
  name: string;
  quantity: string;
  unit: string;
  storage_type: StorageType;
}

export interface RecipeFormValues {
  name: string;
  description?: string | null;
  prep_time_minutes?: number | null;
  ingredients: Array<{
    name: string;
    quantity?: string | null;
    unit?: string | null;
    storage_type: StorageType;
  }>;
}

interface RecipeFormProps {
  initialValues?: RecipeFormValues;
  recipeId?: string;
}

const inputBase =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:outline-none focus:ring-2";

const ingredientTemplate: IngredientInput = {
  name: "",
  quantity: "",
  unit: "",
  storage_type: "fresh",
};

function toIngredientInput(values?: RecipeFormValues): IngredientInput[] {
  if (!values || values.ingredients.length === 0) {
    return [];
  }

  return values.ingredients.map((ingredient) => ({
    name: ingredient.name ?? "",
    quantity: ingredient.quantity ?? "",
    unit: ingredient.unit ?? "",
    storage_type: ingredient.storage_type,
  }));
}

export default function RecipeForm({ initialValues, recipeId }: RecipeFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(
    initialValues?.prep_time_minutes === null || initialValues?.prep_time_minutes === undefined
      ? ""
      : String(initialValues.prep_time_minutes),
  );
  const [ingredients, setIngredients] = useState<IngredientInput[]>(toIngredientInput(initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditMode = useMemo(() => Boolean(recipeId), [recipeId]);

  function setFieldError(path: string, message?: string) {
    setErrors((prev) => {
      if (!message) {
        const next = { ...prev };
        delete next[path];
        return next;
      }

      return { ...prev, [path]: message };
    });
  }

  function handleIngredientChange(index: number, field: keyof IngredientInput, value: string) {
    const normalizedValue = field === "storage_type" ? (value as StorageType) : value;

    setIngredients((prev) =>
      prev.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? { ...ingredient, [field]: normalizedValue } : ingredient,
      ),
    );

    if (field === "name") {
      setFieldError(`ingredients.${index}.name`);
    }
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { ...ingredientTemplate }]);
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, ingredientIndex) => ingredientIndex !== index));

    setErrors((prev) => {
      const next: Record<string, string> = {};

      Object.entries(prev).forEach(([path, message]) => {
        if (!path.startsWith("ingredients.")) {
          next[path] = message;
          return;
        }

        const segments = path.split(".");
        const currentIndex = Number(segments[1]);
        if (Number.isNaN(currentIndex) || currentIndex === index) {
          return;
        }

        const shiftedIndex = currentIndex > index ? currentIndex - 1 : currentIndex;
        segments[1] = String(shiftedIndex);
        next[segments.join(".")] = message;
      });

      return next;
    });
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = "Recipe name is required";
    } else if (name.trim().length > 200) {
      nextErrors.name = "Recipe name is too long";
    }

    if (description && description.trim().length > 5000) {
      nextErrors.description = "Recipe description is too long";
    }

    if (prepTimeMinutes.trim()) {
      const asNumber = Number(prepTimeMinutes);
      const asInteger = Number.isInteger(asNumber);

      if (!asInteger) {
        nextErrors.prep_time_minutes = "Preparation time must be an integer";
      } else if (asNumber < 0) {
        nextErrors.prep_time_minutes = "Preparation time cannot be negative";
      } else if (asNumber > 1440) {
        nextErrors.prep_time_minutes = "Preparation time cannot exceed 1440 minutes";
      }
    }

    ingredients.forEach((ingredient, index) => {
      if (!ingredient.name.trim()) {
        nextErrors[`ingredients.${index}.name`] = "Ingredient name is required";
      } else if (ingredient.name.trim().length > 200) {
        nextErrors[`ingredients.${index}.name`] = "Ingredient name is too long";
      }

      if (ingredient.quantity.trim().length > 100) {
        nextErrors[`ingredients.${index}.quantity`] = "Ingredient quantity is too long";
      }

      if (ingredient.unit.trim().length > 50) {
        nextErrors[`ingredients.${index}.unit`] = "Ingredient unit is too long";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!validate()) {
      return;
    }

    setSubmitting(true);

    const payload = {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      prep_time_minutes: prepTimeMinutes.trim() ? Number(prepTimeMinutes) : null,
      ingredients: ingredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim() ? ingredient.quantity.trim() : null,
        unit: ingredient.unit.trim() ? ingredient.unit.trim() : null,
        storage_type: ingredient.storage_type,
      })),
    };

    const endpoint = recipeId ? `/api/recipes/${recipeId}` : "/api/recipes";
    const method = recipeId ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        setSubmitError(responseBody?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      window.location.href = "/recipes";
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm text-blue-100/80">
          Name
        </label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldError("name");
          }}
          placeholder="Weeknight tomato pasta"
          className={cn(
            inputBase,
            errors.name ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
        {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm text-blue-100/80">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={description ?? ""}
          onChange={(event) => {
            setDescription(event.target.value);
            setFieldError("description");
          }}
          placeholder="Quick and cozy dinner that works well with pantry ingredients."
          className={cn(
            `${inputBase} resize-none`,
            errors.description
              ? "border-red-400/60 focus:ring-red-400"
              : "border-white/20 focus:ring-purple-400",
          )}
        />
        {errors.description && <p className="mt-1 text-sm text-red-400">{errors.description}</p>}
      </div>

      <div>
        <label htmlFor="prep-time" className="mb-1 block text-sm text-blue-100/80">
          Prep time (minutes)
        </label>
        <input
          id="prep-time"
          name="prep_time_minutes"
          inputMode="numeric"
          value={prepTimeMinutes}
          onChange={(event) => {
            setPrepTimeMinutes(event.target.value);
            setFieldError("prep_time_minutes");
          }}
          placeholder="30"
          className={cn(
            inputBase,
            errors.prep_time_minutes
              ? "border-red-400/60 focus:ring-red-400"
              : "border-white/20 focus:ring-purple-400",
          )}
        />
        {errors.prep_time_minutes && <p className="mt-1 text-sm text-red-400">{errors.prep_time_minutes}</p>}
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Ingredients</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addIngredient}>
            <Plus className="size-4" />
            Add ingredient
          </Button>
        </div>

        {ingredients.length === 0 ? (
          <p className="text-sm text-blue-100/65">No ingredients added yet.</p>
        ) : (
          <div className="space-y-3">
            {ingredients.map((ingredient, index) => (
              <div
                key={`ingredient-${index}`}
                className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-blue-100/80">Ingredient {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      removeIngredient(index);
                    }}
                    aria-label={`Remove ingredient ${index + 1}`}
                    className="text-red-300 hover:text-red-200"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-blue-100/70">Name</label>
                    <input
                      value={ingredient.name}
                      onChange={(event) => {
                        handleIngredientChange(index, "name", event.target.value);
                      }}
                      placeholder="Tomatoes"
                      className={cn(
                        inputBase,
                        errors[`ingredients.${index}.name`]
                          ? "border-red-400/60 focus:ring-red-400"
                          : "border-white/20 focus:ring-purple-400",
                      )}
                    />
                    {errors[`ingredients.${index}.name`] && (
                      <p className="mt-1 text-sm text-red-400">{errors[`ingredients.${index}.name`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-blue-100/70">Storage type</label>
                    <select
                      value={ingredient.storage_type}
                      onChange={(event) => {
                        handleIngredientChange(index, "storage_type", event.target.value);
                      }}
                      className={cn(inputBase, "border-white/20 focus:ring-purple-400")}
                    >
                      <option value="fresh" className="text-black">
                        fresh
                      </option>
                      <option value="durable" className="text-black">
                        durable
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-blue-100/70">Quantity</label>
                    <input
                      value={ingredient.quantity}
                      onChange={(event) => {
                        handleIngredientChange(index, "quantity", event.target.value);
                      }}
                      placeholder="2"
                      className={cn(
                        inputBase,
                        errors[`ingredients.${index}.quantity`]
                          ? "border-red-400/60 focus:ring-red-400"
                          : "border-white/20 focus:ring-purple-400",
                      )}
                    />
                    {errors[`ingredients.${index}.quantity`] && (
                      <p className="mt-1 text-sm text-red-400">{errors[`ingredients.${index}.quantity`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-blue-100/70">Unit</label>
                    <input
                      value={ingredient.unit}
                      onChange={(event) => {
                        handleIngredientChange(index, "unit", event.target.value);
                      }}
                      placeholder="pcs"
                      className={cn(
                        inputBase,
                        errors[`ingredients.${index}.unit`]
                          ? "border-red-400/60 focus:ring-red-400"
                          : "border-white/20 focus:ring-purple-400",
                      )}
                    />
                    {errors[`ingredients.${index}.unit`] && (
                      <p className="mt-1 text-sm text-red-400">{errors[`ingredients.${index}.unit`]}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {submitError}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? "Saving..." : isEditMode ? "Save changes" : "Create recipe"}
        </Button>
      </div>
    </form>
  );
}