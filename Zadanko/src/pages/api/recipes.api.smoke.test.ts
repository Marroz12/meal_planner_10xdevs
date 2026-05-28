import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listRecipesHandler, POST as createRecipeHandler } from "@/pages/api/recipes/index";
import {
  DELETE as deleteRecipeHandler,
  GET as getRecipeHandler,
  PATCH as updateRecipeHandler,
} from "@/pages/api/recipes/[id]";
import { createClient } from "@/lib/supabase";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
} from "@/lib/services/recipes";

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

const createClientMock = vi.mocked(createClient);
const listRecipesMock = vi.mocked(listRecipes);
const createRecipeMock = vi.mocked(createRecipe);
const getRecipeMock = vi.mocked(getRecipe);
const updateRecipeMock = vi.mocked(updateRecipe);
const deleteRecipeMock = vi.mocked(deleteRecipe);

interface ContextOptions {
  method: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
  userId?: string | null;
}

function makeContext(options: ContextOptions) {
  const request = new Request("http://localhost/api/recipes", {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return {
    request,
    locals: {
      user: options.userId === null ? null : { id: options.userId ?? "user-1" },
    },
    params: options.params ?? {},
    cookies: {},
  } as never;
}

async function readJson(response: Response) {
  return (await response.json()) as {
    data: unknown;
    error: { code: string; message: string } | null;
  };
}

describe("recipes API smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({} as never);
  });

  it("returns recipes list for authenticated user", async () => {
    listRecipesMock.mockResolvedValue({
      data: [{ id: "recipe-1", recipe_ingredients: [] }],
      error: null,
    } as never);

    const response = await listRecipesHandler(makeContext({ method: "GET" }));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.error).toBeNull();
  });

  it("creates recipe for authenticated user", async () => {
    createRecipeMock.mockResolvedValue({
      data: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
      error: null,
    } as never);

    const response = await createRecipeHandler(
      makeContext({
        method: "POST",
        body: { name: "Test recipe", prep_time_minutes: 15 },
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(201);
    expect(payload.error).toBeNull();
  });

  it("returns 401 for unauthenticated requests", async () => {
    const response = await listRecipesHandler(makeContext({ method: "GET", userId: null }));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for unauthorized ownership update", async () => {
    updateRecipeMock.mockResolvedValue({ data: null, error: null } as never);

    const response = await updateRecipeHandler(
      makeContext({
        method: "PATCH",
        params: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
        body: { name: "Updated" },
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("FORBIDDEN");
  });

  it("passes ingredient replacement payload in PATCH", async () => {
    updateRecipeMock.mockResolvedValue({ data: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" }, error: null } as never);

    const response = await updateRecipeHandler(
      makeContext({
        method: "PATCH",
        params: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
        body: {
          ingredients: [{ name: "Tomato", quantity: "2", unit: "pcs", storage_type: "fresh" }],
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateRecipeMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "a3b90464-78e8-45ff-9b77-a701fd8624f7",
      expect.objectContaining({
        ingredients: [expect.objectContaining({ name: "Tomato", storage_type: "fresh" })],
      }),
    );
  });

  it("passes PATCH without ingredients to preserve existing ingredient set", async () => {
    updateRecipeMock.mockResolvedValue({ data: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" }, error: null } as never);

    const response = await updateRecipeHandler(
      makeContext({
        method: "PATCH",
        params: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
        body: { name: "Updated" },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateRecipeMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "a3b90464-78e8-45ff-9b77-a701fd8624f7",
      expect.not.objectContaining({ ingredients: expect.anything() }),
    );
  });

  it("returns validation error for invalid create payload", async () => {
    const response = await createRecipeHandler(makeContext({ method: "POST", body: {} }));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation error for invalid recipe id", async () => {
    const response = await getRecipeHandler(
      makeContext({
        method: "GET",
        params: { id: "not-a-uuid" },
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe("VALIDATION_ERROR");
  });

  it("gets recipe for authenticated owner", async () => {
    getRecipeMock.mockResolvedValue({
      data: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7", recipe_ingredients: [] },
      error: null,
    } as never);

    const response = await getRecipeHandler(
      makeContext({
        method: "GET",
        params: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("soft-deletes recipe for authenticated owner", async () => {
    deleteRecipeMock.mockResolvedValue({
      data: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
      error: null,
    } as never);

    const response = await deleteRecipeHandler(
      makeContext({
        method: "DELETE",
        params: { id: "a3b90464-78e8-45ff-9b77-a701fd8624f7" },
      }),
    );

    expect(response.status).toBe(200);
  });
});
