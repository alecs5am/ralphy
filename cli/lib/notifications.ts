// Workspace notifications config reader/writer (#518) — the `notifications`
// block on workspace.json (mirrors cli/lib/trust.ts's `trust` block).
//
// The workspace.json manifest is engine STATE (like registry.json) — rewriting
// it does not touch the append-only contract (invariant #14). Quiet by
// default: a workspace with no `notifications` block reads back an
// `enabled: false` config, so nothing ever fires until an operator opts in.
//
// NOTE: this file does NOT read TELEGRAM_BOT_TOKEN — the secret lives only in
// cli/lib/farm/notify.ts (the sanctioned connector, invariant #1). Config here
// carries the chat id / webhook URL / event mapping ONLY.

import fs from "node:fs";
import { workspaceDir, workspaceManifestPath } from "./paths.js";
import {
  parseNotificationsConfig,
  type NotificationsConfig,
} from "./schemas/notifications.js";

function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The workspace's notifications config (defaults → quiet when unset/malformed). */
export function readNotificationsConfig(ws: string): NotificationsConfig {
  return parseNotificationsConfig(readManifest(ws).notifications ?? {});
}

/** Merge a partial notifications patch into workspace.json's `notifications` key. */
export function writeNotificationsConfig(
  ws: string,
  patch: Partial<NotificationsConfig>,
): NotificationsConfig {
  const manifest = readManifest(ws);
  const merged = parseNotificationsConfig({
    ...(manifest.notifications as object | undefined),
    ...patch,
  });
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(
    workspaceManifestPath(ws),
    JSON.stringify({ slug: ws, ...manifest, notifications: merged }, null, 2) + "\n",
  );
  return merged;
}
