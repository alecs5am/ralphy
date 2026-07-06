// Workspace-scoped ingestion state (#500): the per-topic `since` cursor and
// the append-only seen-store the farm dedups against ("never two videos about
// the same news item"). Both live under `<workspace>/ingestion/` and every
// function takes the ABSOLUTE workspace dir (executors pass ctx.workspaceDir),
// keeping this module decoupled from the paths-root singleton and trivially
// testable.
//
// Append-only contract: `seen.jsonl` is only ever appended to — loading builds
// the in-memory set. `cursor.json` is engine STATE (like registry.json),
// updated by topic; it is not a generation artifact, so rewriting it does not
// touch invariant #14.

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { SourceItem } from "../schemas/source-item.js";

export function ingestionDir(workspaceDir: string): string {
  return path.join(workspaceDir, "ingestion");
}

/** `<workspace>/ingestion/cursor.json` — topic → ISO ts of the newest emitted item. */
export function cursorPath(workspaceDir: string): string {
  return path.join(ingestionDir(workspaceDir), "cursor.json");
}

/** `<workspace>/ingestion/seen.jsonl` — append-only, one line per seen item. */
export function seenPath(workspaceDir: string): string {
  return path.join(ingestionDir(workspaceDir), "seen.jsonl");
}

// ─── since-cursor ────────────────────────────────────────────────────────────

export function readCursor(workspaceDir: string): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(cursorPath(workspaceDir), "utf8"));
    return typeof raw === "object" && raw !== null ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Advance a topic's cursor to `iso` (monotonic — an older ts never rewinds it). */
export function advanceCursor(workspaceDir: string, topic: string, iso: string): void {
  const cur = readCursor(workspaceDir);
  if (cur[topic] && cur[topic] >= iso) return;
  cur[topic] = iso;
  fs.mkdirSync(ingestionDir(workspaceDir), { recursive: true });
  fs.writeFileSync(cursorPath(workspaceDir), JSON.stringify(cur, null, 2) + "\n");
}

// ─── dedup window ────────────────────────────────────────────────────────────

const WINDOW_RE = /^(\d+)([smhdw])$/;
const UNIT_MS: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };

/** Parse a dedup window like "14d" / "12h" / "30m" into milliseconds. */
export function parseWindow(spec: string): number {
  const m = WINDOW_RE.exec(spec.trim());
  if (!m) throw new Error(`invalid dedup window "${spec}" — use <n><s|m|h|d|w>, e.g. "14d"`);
  return Number(m[1]) * UNIT_MS[m[2]];
}

// ─── seen-store ──────────────────────────────────────────────────────────────

const normUrl = (url: string) => url.trim().toLowerCase();

/** Content hash of an item: sha256 over normalized url + title. */
export function itemHash(item: Pick<SourceItem, "url" | "title">): string {
  const norm = `${normUrl(item.url)}\n${item.title.trim().toLowerCase()}`;
  return crypto.createHash("sha256").update(norm).digest("hex");
}

export interface SeenSet {
  hashes: Set<string>;
  urls: Set<string>;
}

/**
 * Load the seen set. With `windowMs`, lines seen longer ago than the window
 * no longer count as duplicates (the item may be covered again).
 */
export function loadSeen(workspaceDir: string, windowMs?: number, now = Date.now()): SeenSet {
  const seen: SeenSet = { hashes: new Set(), urls: new Set() };
  let raw = "";
  try {
    raw = fs.readFileSync(seenPath(workspaceDir), "utf8");
  } catch {
    return seen;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { hash?: string; url?: string; seenAt?: string };
      if (windowMs !== undefined && rec.seenAt && now - Date.parse(rec.seenAt) > windowMs) continue;
      if (rec.hash) seen.hashes.add(rec.hash);
      if (rec.url) seen.urls.add(normUrl(rec.url));
    } catch {
      // skip a corrupt line — append-only stores tolerate torn writes
    }
  }
  return seen;
}

/** Append items to the seen store (one JSONL line each). No-op on an empty list. */
export function appendSeen(
  workspaceDir: string,
  items: SourceItem[],
  now = new Date().toISOString(),
): void {
  if (items.length === 0) return;
  fs.mkdirSync(ingestionDir(workspaceDir), { recursive: true });
  const lines = items
    .map((i) => JSON.stringify({ hash: itemHash(i), url: i.url, ts: i.ts, seenAt: now }))
    .join("\n");
  fs.appendFileSync(seenPath(workspaceDir), lines + "\n");
}

/** Items not in the seen set (by content hash OR normalized url). */
export function filterFresh(items: SourceItem[], seen: SeenSet): SourceItem[] {
  return items.filter((i) => !seen.hashes.has(itemHash(i)) && !seen.urls.has(normUrl(i.url)));
}
