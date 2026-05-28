#!/usr/bin/env tsx
/**
 * Lightweight p95 performance check for recipe list and read operations.
 *
 * Usage:
 *   npx tsx scripts/recipes-perf-check.ts
 *
 * Required environment variables (copy from .env.example / .dev.vars):
 *   SUPABASE_URL      — project URL
 *   SUPABASE_SERVICE_KEY — service_role key (bypasses RLS for benchmark setup/teardown)
 *
 * Target: p95 list and read < 300 ms for a representative dataset.
 * The script exits 1 if the target is exceeded so it can gate CI (optional).
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const P95_TARGET_MS = 300;
const ITERATIONS = 50;
const RECIPE_COUNT = 100;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY\n" +
      "Set them in .dev.vars or export them before running this script.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(samples.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

async function setup(): Promise<{ userId: string; recipeIds: string[] }> {
  const userId = randomUUID();

  // Insert seed user directly into auth schema (requires service_role)
  const { error: userError } = await supabase.rpc("create_perf_test_user", { uid: userId }).select();
  if (userError) {
    // Fallback: seed via raw insert if RPC not available
    const { error: insertError } = await supabase.from("profiles").upsert({ id: userId }).select();
    if (insertError) {
      console.warn("Could not seed user via profiles table — proceeding without profile row:", insertError.message);
    }
  }

  const recipes = Array.from({ length: RECIPE_COUNT }, (_, i) => ({
    id: randomUUID(),
    user_id: userId,
    name: `Perf Recipe ${i + 1}`,
    description: `Generated for perf benchmark`,
    prep_time_minutes: (i % 60) + 5,
  }));

  const { data, error } = await supabase.from("recipes").insert(recipes).select("id");
  if (error) {
    throw new Error(`Failed to seed recipes: ${error.message}`);
  }

  return { userId, recipeIds: (data ?? []).map((r: { id: string }) => r.id) };
}

async function teardown(userId: string): Promise<void> {
  // Hard-delete benchmark data (service_role bypasses RLS)
  await supabase.from("recipes").delete().eq("user_id", userId);
}

async function measureList(userId: string): Promise<number> {
  const start = performance.now();
  const { error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const elapsed = performance.now() - start;
  if (error) throw new Error(`List query failed: ${error.message}`);
  return elapsed;
}

async function measureRead(recipeId: string, userId: string): Promise<number> {
  const start = performance.now();
  const { error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();
  const elapsed = performance.now() - start;
  if (error && error.code !== "PGRST116") throw new Error(`Read query failed: ${error.message}`);
  return elapsed;
}

async function run() {
  console.log(`\nRecipes Performance Check`);
  console.log(`-------------------------`);
  console.log(`Dataset : ${RECIPE_COUNT} recipes`);
  console.log(`Samples : ${ITERATIONS} iterations per operation`);
  console.log(`Target  : p95 < ${P95_TARGET_MS} ms\n`);

  console.log("Setting up benchmark data...");
  const { userId, recipeIds } = await setup();
  console.log(`Seeded ${recipeIds.length} recipes for user ${userId}\n`);

  // --- LIST benchmarks ---
  const listSamples: number[] = [];
  process.stdout.write("Measuring list... ");
  for (let i = 0; i < ITERATIONS; i++) {
    listSamples.push(await measureList(userId));
  }
  const listP95 = p95(listSamples);
  const listMin = Math.min(...listSamples);
  const listMax = Math.max(...listSamples);
  console.log("done");

  // --- READ benchmarks (rotate through first 10 recipes) ---
  const readSamples: number[] = [];
  const sampleRecipes = recipeIds.slice(0, Math.min(10, recipeIds.length));
  process.stdout.write("Measuring read...  ");
  for (let i = 0; i < ITERATIONS; i++) {
    const id = sampleRecipes[i % sampleRecipes.length];
    readSamples.push(await measureRead(id, userId));
  }
  const readP95 = p95(readSamples);
  const readMin = Math.min(...readSamples);
  const readMax = Math.max(...readSamples);
  console.log("done\n");

  // --- Report ---
  const listPass = listP95 < P95_TARGET_MS;
  const readPass = readP95 < P95_TARGET_MS;

  console.log("Results:");
  console.log(
    `  List  p95=${listP95.toFixed(1)}ms  min=${listMin.toFixed(1)}ms  max=${listMax.toFixed(1)}ms  ${listPass ? "PASS" : "FAIL (exceeds target)"}`,
  );
  console.log(
    `  Read  p95=${readP95.toFixed(1)}ms  min=${readMin.toFixed(1)}ms  max=${readMax.toFixed(1)}ms  ${readPass ? "PASS" : "FAIL (exceeds target)"}`,
  );

  console.log("\nTearing down benchmark data...");
  await teardown(userId);
  console.log("Done.\n");

  if (!listPass || !readPass) {
    console.error(`FAIL: p95 target of ${P95_TARGET_MS}ms exceeded. Review indexes or query structure.`);
    process.exit(1);
  }

  console.log(`PASS: All operations within p95 < ${P95_TARGET_MS}ms target.`);
}

run().catch((err: unknown) => {
  console.error("Perf check error:", err);
  process.exit(1);
});
