// In-memory source identity used while a research Run is executing.
// Durable source records are persisted with the Run/Document domain store.

import { normalizeUrl } from "./citation-verifier.js";

export type RegistryRecord = {
  url: string;
  text: string;
  retrievedAt: string;
  score: number;
  [key: string]: unknown;
};

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
