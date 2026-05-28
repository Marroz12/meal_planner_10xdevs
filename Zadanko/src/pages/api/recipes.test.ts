import { beforeEach, describe, expect, it, vi } from "vitest";

import { jsonError, jsonSuccess, logApiEvent, mapSupabaseError } from "@/lib/api/errors";
import { createRecipeSchema, normalizeValidationError, updateRecipeSchema } from "@/lib/validation/recipes";
import { createClient } from "@/lib/supabase";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe } from "@/lib/services/recipes";
import { GET as listHandler, POST as createHandler } from "@/pages/api/recipes/index";
import {
  DELETE as deleteHandler,
  GET as getHandler,
  PATCH as updateHandler,
} from "@/pages/api/recipes/[id]";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/services/recipes", () => ({
  listRecipes: vi.fn(),
  createRecipe: vi.fn(),
  getRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);
const mockListRecipes = vi.mocked(listRecipes);
const mockCreateRecipe = vi.mocked(createRecipe);
const mockGetRecipe = vi.mocked(getRecipe);
const mockUpdateRecipe = vi.mocked(updateRecipe);
const mockDeleteRecipe = vi.mocked(deleteRecipe);

const TEST_USER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
// RFC 4122 compliant UUID (version 4, variant 9)
const TEST_RECIPE_ID = "a3b90464-78e8-45ff-9b77-a701fd8624f7";

function buildContext(opts: {
  method?: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
  userId?: string | null;
}) {
  return {
    request: new Request("http://localhost/api/recipes", {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
    locals: {
      user: opts.userId === null ? null : { id: opts.userId ?? TEST_USER_ID },
    },
    params: opts.params ?? {},
    cookies: {},
  } as never;
}

async function json(res: Response) {
  return (await res.json()) as { data: unknown; error: { code: string; message: string } | null };
}

// ===========================================================================
// API Error and Logging Utilities
// ===========================================================================

describe("API utilities", () => {
  describe("jsonSuccess", () => {
    it("wraps data with null error at default 200 status", () => {
      const res = jsonSuccess({ id: "x" });
      expect(res.status).toBe(200);
    });

    it("accepts custom status code", () => {
      const res = jsonSuccess({ id: "x" }, 201);
      expect(res.status).toBe(201);
    });

    it("sets Content-Type header", () => {
      const res = jsonSuccess({});
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("jsonError", () => {
    it("wraps error code and message with null data", async () => {
      const res = jsonError("VALIDATION_ERROR", "bad input", 400);
      const body = await json(res);
      expect(res.status).toBe(400);
      expect(body.data).toBeNull();
      expect(body.error?.code).toBe("VALIDATION_ERROR");
      expect(body.error?.message).toBe("bad input");
    });
  });

  describe("mapSupabaseError", () => {
    it("maps PGRST116 (no rows) to NOT_FOUND 404", () => {
      const mapped = mapSupabaseError({ code: "PGRST116", message: "no rows" });
      expect(mapped.code).toBe("NOT_FOUND");
      expect(mapped.status).toBe(404);
    });

    it("maps 42501 (permission denied) to FORBIDDEN 403", () => {
      const mapped = mapSupabaseError({ code: "42501", message: "denied" });
      expect(mapped.code).toBe("FORBIDDEN");
      expect(mapped.status).toBe(403);
    });

    it("maps 23505 (unique violation) to CONFLICT 409", () => {
      const mapped = mapSupabaseError({ code: "23505", message: "conflict" });
      expect(mapped.code).toBe("CONFLICT");
      expect(mapped.status).toBe(409);
    });

    it("maps unknown errors to INTERNAL_ERROR 500", () => {
      const mapped = mapSupabaseError({ code: "XXXX", message: "unknown" });
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.status).toBe(500);
    });

    it("maps null error to INTERNAL_ERROR 500", () => {
      const mapped = mapSupabaseError(null);
      expect(mapped.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("logApiEvent", () => {
    it("does not throw", () => {
      expect(() =>
        logApiEvent({ action: "recipes.test", outcome: "success", status: 200 }),
      ).not.toThrow();
    });
  });
});

// ===========================================================================
// Validation schemas
// ===========================================================================

describe("Validation schemas", () => {
  describe("createRecipeSchema", () => {
    it("accepts minimal valid payload", () => {
      const result = createRecipeSchema.safeParse({ name: "Pasta" });
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const result = createRecipeSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createRecipeSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects name exceeding 200 chars", () => {
      const result = createRecipeSchema.safeParse({ name: "a".repeat(201) });
      expect(result.success).toBe(false);
    });

    it("accepts full payload with ingredients", () => {
      const result = createRecipeSchema.safeParse({
        name: "Pasta",
        description: "Nice dish",
        prep_time_minutes: 20,
        ingredients: [{ name: "Flour", quantity: "200g", storage_type: "durable" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid storage_type on ingredient", () => {
      const result = createRecipeSchema.safeParse({
        name: "Pasta",
        ingredients: [{ name: "Flour", storage_type: "frozen" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative prep_time_minutes", () => {
      const result = createRecipeSchema.safeParse({ name: "Pasta", prep_time_minutes: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("updateRecipeSchema", () => {
    it("rejects empty payload", () => {
      const result = updateRecipeSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("accepts ingredients-only update", () => {
      const result = updateRecipeSchema.safeParse({
        ingredients: [{ name: "Carrot", storage_type: "fresh" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty ingredients array", () => {
      const result = updateRecipeSchema.safeParse({ ingredients: [] });
      expect(result.success).toBe(true);
    });

    it("rejects invalid ingredient payload", () => {
      const result = updateRecipeSchema.safeParse({
        ingredients: [{ name: "Carrot", storage_type: "frozen" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts partial name-only update", () => {
      const result = updateRecipeSchema.safeParse({ name: "New Name" });
      expect(result.success).toBe(true);
    });

    it("accepts null description to clear it", () => {
      const result = updateRecipeSchema.safeParse({ description: null });
      expect(result.success).toBe(true);
    });
  });

  describe("normalizeValidationError", () => {
    it("formats path.message pairs", () => {
      const result = createRecipeSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = normalizeValidationError(result.error);
        expect(msg).toContain("name");
      }
    });
  });
});

// ===========================================================================
// Collection endpoints — GET /api/recipes, POST /api/recipes
// ===========================================================================

describe("GET /api/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await listHandler(buildContext({ userId: null }));
    const body = await json(res);
    expect(res.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 500 when Supabase client is unavailable", async () => {
    mockCreateClient.mockReturnValue(null);
    const res = await listHandler(buildContext({}));
    expect(res.status).toBe(500);
  });

  it("returns 200 with recipes array for authenticated user", async () => {
    mockListRecipes.mockResolvedValue({ data: [], error: null } as never);
    const res = await listHandler(buildContext({}));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
  });

  it("propagates Supabase error as mapped API error", async () => {
    mockListRecipes.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } } as never);
    const res = await listHandler(buildContext({}));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await createHandler(buildContext({ method: "POST", userId: null, body: { name: "x" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await createHandler(buildContext({ method: "POST", body: { prep_time_minutes: 10 } }));
    const body = await json(res);
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 201 with created recipe on success", async () => {
    mockCreateRecipe.mockResolvedValue({ data: { id: TEST_RECIPE_ID }, error: null } as never);
    const res = await createHandler(buildContext({ method: "POST", body: { name: "Pasta" } }));
    expect(res.status).toBe(201);
  });

  it("returns 500 when Supabase returns no data without error", async () => {
    mockCreateRecipe.mockResolvedValue({ data: null, error: null } as never);
    const res = await createHandler(buildContext({ method: "POST", body: { name: "Pasta" } }));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// Per-recipe endpoints — GET/PATCH/DELETE /api/recipes/[id]
// ===========================================================================

describe("GET /api/recipes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await getHandler(buildContext({ userId: null, params: { id: TEST_RECIPE_ID } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID recipe id", async () => {
    const res = await getHandler(buildContext({ params: { id: "not-a-uuid" } }));
    const body = await json(res);
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with recipe on success", async () => {
    mockGetRecipe.mockResolvedValue({ data: { id: TEST_RECIPE_ID, recipe_ingredients: [] }, error: null } as never);
    const res = await getHandler(buildContext({ params: { id: TEST_RECIPE_ID } }));
    expect(res.status).toBe(200);
  });

  it("returns 403 when recipe not found (cross-user or deleted)", async () => {
    mockGetRecipe.mockResolvedValue({ data: null, error: null } as never);
    const res = await getHandler(buildContext({ params: { id: TEST_RECIPE_ID } }));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/recipes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await updateHandler(
      buildContext({ method: "PATCH", userId: null, params: { id: TEST_RECIPE_ID }, body: { name: "x" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty update payload", async () => {
    const res = await updateHandler(buildContext({ method: "PATCH", params: { id: TEST_RECIPE_ID }, body: {} }));
    const body = await json(res);
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 when target recipe not owned by caller", async () => {
    mockUpdateRecipe.mockResolvedValue({ data: null, error: null } as never);
    const res = await updateHandler(
      buildContext({ method: "PATCH", params: { id: TEST_RECIPE_ID }, body: { name: "x" } }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful update", async () => {
    mockUpdateRecipe.mockResolvedValue({ data: { id: TEST_RECIPE_ID }, error: null } as never);
    const res = await updateHandler(
      buildContext({ method: "PATCH", params: { id: TEST_RECIPE_ID }, body: { name: "New Name" } }),
    );
    expect(res.status).toBe(200);
  });

  it("passes ingredients to update service when present", async () => {
    mockUpdateRecipe.mockResolvedValue({ data: { id: TEST_RECIPE_ID }, error: null } as never);

    await updateHandler(
      buildContext({
        method: "PATCH",
        params: { id: TEST_RECIPE_ID },
        body: {
          ingredients: [{ name: "Flour", quantity: "200", unit: "g", storage_type: "durable" }],
        },
      }),
    );

    expect(mockUpdateRecipe).toHaveBeenCalledWith(
      expect.anything(),
      TEST_USER_ID,
      TEST_RECIPE_ID,
      expect.objectContaining({
        ingredients: [
          expect.objectContaining({
            name: "Flour",
            quantity: "200",
            unit: "g",
            storage_type: "durable",
          }),
        ],
      }),
    );
  });
});

describe("DELETE /api/recipes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await deleteHandler(
      buildContext({ method: "DELETE", userId: null, params: { id: TEST_RECIPE_ID } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when recipe not owned by caller", async () => {
    mockDeleteRecipe.mockResolvedValue({ data: null, error: null } as never);
    const res = await deleteHandler(buildContext({ method: "DELETE", params: { id: TEST_RECIPE_ID } }));
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful soft-delete", async () => {
    mockDeleteRecipe.mockResolvedValue({ data: { id: TEST_RECIPE_ID, deleted_at: new Date().toISOString() }, error: null } as never);
    const res = await deleteHandler(buildContext({ method: "DELETE", params: { id: TEST_RECIPE_ID } }));
    expect(res.status).toBe(200);
  });
});
