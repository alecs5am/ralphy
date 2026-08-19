// Persistent-performer store (#555) — workspace-level trained avatars + cloned
// voices, keyed by a LOCAL slug.
//
// Why this exists: an avatar and a voice clone are account-level, reusable, and
// expensive to recreate (HeyGen bills $1.00 per avatar creation call and caps
// voice clones at 10 per account). They belong to the workspace, not a project,
// and every verb should take the local slug so no provider id ever has to
// appear on a command line.
//
// Storage: `.ralphy/workspaces/<ws>/avatars.json`, shape
//   { version: 1, avatars: { <slug>: StoredAvatar }, voices: { <slug>: StoredVoice } }
//
// APPEND-ONLY (AGENTS.md invariant #14). `putAvatar` / `putVoice` never
// overwrite an occupied slug — they version it to `<slug>.v2`, `<slug>.v3`, …
// and return the slug actually written. `removeAvatar` / `removeVoice` exist
// only for the explicit `delete` verbs and touch the local record, never the
// provider-side asset.

import fs from "node:fs/promises";
import { workspacePerformersPath } from "./paths.js";

export type StoredAvatar = {
  slug: string;
  /** Connector id that owns the remote asset (currently always "heygen"). */
  provider: string;
  name: string;
  /** Provider avatar family: digital_twin | photo | prompt. */
  type: string;
  /** The LOOK id — what a generation call wants as `avatar_id`, not the group id. */
  lookId: string;
  groupId?: string;
  /** Last observed training status: processing | completed | failed. */
  status?: string;
  /** Engines the look advertises once trained (avatar_v | avatar_iv | avatar_iii). */
  engines?: string[];
  /** Group consent state: null when not applicable (photo avatars). */
  consentStatus?: string | null;
  /** What the avatar was trained from, for provenance. */
  sourceRef?: string;
  createdAt: string;
  /** Last training error message, kept so `avatar show` can explain a failure. */
  error?: string | null;
};

export type StoredVoice = {
  slug: string;
  provider: string;
  name: string;
  /** Provider voice id passed to a generation call. */
  voiceId: string;
  language?: string;
  /** Last observed clone status (HeyGen: pending | complete | failed). */
  status?: string;
  sourceRef?: string;
  createdAt: string;
};

export type PerformerStore = {
  version: 1;
  avatars: Record<string, StoredAvatar>;
  voices: Record<string, StoredVoice>;
};

const EMPTY: PerformerStore = { version: 1, avatars: {}, voices: {} };

export async function loadPerformers(workspace: string): Promise<PerformerStore> {
  try {
    const raw = JSON.parse(await fs.readFile(workspacePerformersPath(workspace), "utf8"));
    return {
      version: 1,
      avatars: raw?.avatars && typeof raw.avatars === "object" ? raw.avatars : {},
      voices: raw?.voices && typeof raw.voices === "object" ? raw.voices : {},
    };
  } catch {
    return { ...EMPTY, avatars: {}, voices: {} };
  }
}

async function savePerformers(workspace: string, store: PerformerStore): Promise<void> {
  await fs.writeFile(
    workspacePerformersPath(workspace),
    JSON.stringify(store, null, 2) + "\n",
  );
}

/**
 * First free slug in the `<base>`, `<base>.v2`, `<base>.v3`, … series. Pure and
 * exported so the append-only behaviour is testable without touching disk.
 */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}.v${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Append an avatar record. Returns the slug actually written (may be versioned). */
export async function putAvatar(
  workspace: string,
  record: Omit<StoredAvatar, "slug" | "createdAt"> & { slug: string; createdAt?: string },
): Promise<StoredAvatar> {
  const store = await loadPerformers(workspace);
  const slug = nextFreeSlug(record.slug, Object.keys(store.avatars));
  const stored: StoredAvatar = {
    ...record,
    slug,
    createdAt: record.createdAt ?? new Date().toISOString(),
  };
  store.avatars[slug] = stored;
  await savePerformers(workspace, store);
  return stored;
}

/** Merge fresh provider-side state into an existing record. Not a new version. */
export async function patchAvatar(
  workspace: string,
  slug: string,
  patch: Partial<StoredAvatar>,
): Promise<StoredAvatar | null> {
  const store = await loadPerformers(workspace);
  const current = store.avatars[slug];
  if (!current) return null;
  const merged = { ...current, ...patch, slug };
  store.avatars[slug] = merged;
  await savePerformers(workspace, store);
  return merged;
}

export async function getAvatar(workspace: string, slug: string): Promise<StoredAvatar | null> {
  return (await loadPerformers(workspace)).avatars[slug] ?? null;
}

export async function removeAvatar(workspace: string, slug: string): Promise<boolean> {
  const store = await loadPerformers(workspace);
  if (!store.avatars[slug]) return false;
  delete store.avatars[slug];
  await savePerformers(workspace, store);
  return true;
}

/** Append a voice record. Returns the slug actually written (may be versioned). */
export async function putVoice(
  workspace: string,
  record: Omit<StoredVoice, "slug" | "createdAt"> & { slug: string; createdAt?: string },
): Promise<StoredVoice> {
  const store = await loadPerformers(workspace);
  const slug = nextFreeSlug(record.slug, Object.keys(store.voices));
  const stored: StoredVoice = {
    ...record,
    slug,
    createdAt: record.createdAt ?? new Date().toISOString(),
  };
  store.voices[slug] = stored;
  await savePerformers(workspace, store);
  return stored;
}

export async function patchVoice(
  workspace: string,
  slug: string,
  patch: Partial<StoredVoice>,
): Promise<StoredVoice | null> {
  const store = await loadPerformers(workspace);
  const current = store.voices[slug];
  if (!current) return null;
  const merged = { ...current, ...patch, slug };
  store.voices[slug] = merged;
  await savePerformers(workspace, store);
  return merged;
}

export async function getVoice(workspace: string, slug: string): Promise<StoredVoice | null> {
  return (await loadPerformers(workspace)).voices[slug] ?? null;
}

export async function removeVoice(workspace: string, slug: string): Promise<boolean> {
  const store = await loadPerformers(workspace);
  if (!store.voices[slug]) return false;
  delete store.voices[slug];
  await savePerformers(workspace, store);
  return true;
}

/**
 * Resolve a `--voice <slug|id>` argument: a known local slug wins, anything
 * else passes through as a raw provider voice id. Lets a command line name
 * either without a second flag.
 */
export async function resolveVoiceRef(
  workspace: string,
  ref: string,
): Promise<{ voiceId: string; slug?: string }> {
  const stored = await getVoice(workspace, ref);
  return stored ? { voiceId: stored.voiceId, slug: stored.slug } : { voiceId: ref };
}
