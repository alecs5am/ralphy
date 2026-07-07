// Workspace cadence config reader/writer (#525) — the `cadence` block on
// workspace.json (mirrors cli/lib/notifications.ts / cli/lib/trust.ts).
//
// PRESENCE gates the layer: a workspace with NO `cadence` block reads back the
// DISABLED config (enabled: false → sampling is a no-op, exact slot times).
// Only once a block exists does `enabled` default true and sampling turn on.
// This is what lets every pre-#525 calendar test keep its exact-time
// assertions untouched.

import fs from "node:fs";
import { workspaceDir, workspaceManifestPath } from "./paths.js";
import {
  parseCadenceConfig,
  DISABLED_CADENCE_CONFIG,
  type CadenceConfig,
} from "./schemas/cadence.js";

function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The workspace's cadence config. An ABSENT `cadence` block reads back the
 * disabled config (the no-op) — a present block parses with defaults ON.
 */
export function readCadenceConfig(ws: string): CadenceConfig {
  const raw = readManifest(ws).cadence;
  if (raw === undefined || raw === null) return DISABLED_CADENCE_CONFIG;
  return parseCadenceConfig(raw);
}

/** Merge a partial cadence patch into workspace.json's `cadence` key. */
export function writeCadenceConfig(ws: string, patch: Partial<CadenceConfig>): CadenceConfig {
  const manifest = readManifest(ws);
  const merged = parseCadenceConfig({
    ...(manifest.cadence as object | undefined),
    ...patch,
  });
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(
    workspaceManifestPath(ws),
    JSON.stringify({ slug: ws, ...manifest, cadence: merged }, null, 2) + "\n",
  );
  return merged;
}
