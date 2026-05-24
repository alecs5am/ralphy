// Append-only `sources.jsonl` store for a deep-research job.
//
// Layout (per job-id):
//   workspace/.ralph/research/<job-id>/sources.jsonl
//
// One JSON object per line. Order is insertion order. Dedup is by
// `normalizeUrl(url)` from citation-verifier — two writes of the same
// logical URL (different casing, utm params) collapse to one entry.
//
// AGENTS.md invariant #14: append-only; never rewrite, never truncate.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeUrl } from "./citation-verifier.js";

export type RegistryRecord = {
  url: string;
  text: string;
  retrievedAt: string;
  score: number;
  [key: string]: unknown;
};

export function registryPathFor(jobDir: string): string {
  return path.join(jobDir, "sources.jsonl");
}

export async function loadRegistry(jobDir: string): Promise<RegistryRecord[]> {
  const p = registryPathFor(jobDir);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: RegistryRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as RegistryRecord;
      if (obj && typeof obj.url === "string") out.push(obj);
    } catch {
      // corrupt line — skip, don't crash the whole load
    }
  }
  return out;
}

// Per-directory serializing queue. Promise-chained so concurrent appends to
// the same job-dir do not interleave their read-check-write windows and
// double-write a duplicate URL.
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(jobDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(jobDir) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    jobDir,
    next.catch(() => undefined),
  );
  return next;
}

export type AppendResult = { added: boolean; entry: RegistryRecord };

export async function appendSource(
  jobDir: string,
  entry: RegistryRecord,
): Promise<AppendResult> {
  return enqueue(jobDir, async () => {
    const existing = await loadRegistry(jobDir);
    const found = findSource(existing, entry.url);
    if (found) return { added: false, entry: found };
    await mkdir(jobDir, { recursive: true });
    await appendFile(registryPathFor(jobDir), JSON.stringify(entry) + "\n");
    return { added: true, entry };
  });
}

export function findSource(
  registry: RegistryRecord[],
  url: string,
): RegistryRecord | null {
  let target: string;
  try {
    target = normalizeUrl(url);
  } catch {
    return null;
  }
  for (const entry of registry) {
    try {
      if (normalizeUrl(entry.url) === target) return entry;
    } catch {
      continue;
    }
  }
  return null;
}
