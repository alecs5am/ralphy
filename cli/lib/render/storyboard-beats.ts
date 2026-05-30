// STORYBOARD.md → snapshot timestamp parser (issue #028).
//
// `ralphy hyperframes snapshot <project>` auto-picks `--at` timestamps when
// the caller doesn't pass any. The CLI looks at two sources, in order:
//
//   1. `<project>/scenario.json` — if it has a `scenes` record / array with
//      numeric `startSec` / `endSec` (the canonical shape, e.g. spring-002),
//      snapshot at the midpoint of every scene.
//   2. `<project>/STORYBOARD.md` — fallback when scenario.json is missing or
//      doesn't carry timings. We parse the human-authored scene headers, which
//      conventionally carry a `(0.00–1.80s · 54f)` range in the heading line.
//
// The parser is intentionally narrow: anything outside this convention gets
// ignored, the caller falls back to `--at 0` (single mid-render frame) and
// the agent can pass explicit `--at` values if needed.

import { readFile } from "node:fs/promises";
import path from "node:path";

export type SceneBeat = {
  /** Scene id from the heading, e.g. "scene-01", "scene-03b", or the raw label. */
  id: string;
  /** Start seconds (inclusive). */
  startSec: number;
  /** End seconds (exclusive). */
  endSec: number;
};

/**
 * Parse scene-range headings out of a STORYBOARD.md body. Picks up lines that
 * look like a markdown header AND carry a `(A.BB–C.DD s)` range. The dash is
 * either en-dash, em-dash, or ASCII hyphen-minus. Returns beats in source order.
 *
 * Examples that match:
 *   ### Scene 01 — HOOK (0.00–1.80s · 54f)
 *   ### Scene 03b — INSERT (5.60–6.40 s)
 *   ## scene-04 - chibi invasion (6.40-8.20s)
 */
export function parseStoryboardBeats(md: string): SceneBeat[] {
  const beats: SceneBeat[] = [];
  // Header line + range:
  //   group 1: heading content (after the leading #s + space)
  //   group 2: start seconds
  //   group 3: end seconds
  const headerRe =
    /^#{1,6}\s+(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*s\b[^)]*\)/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(md)) !== null) {
    const headline = (m[1] ?? "").trim();
    const start = Number(m[2]);
    const end = Number(m[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const id = extractSceneId(headline);
    beats.push({ id, startSec: start, endSec: end });
  }
  return beats;
}

/**
 * Lift a stable scene-id out of a heading like "Scene 03b — INSERT: COIN-MAGNET".
 * Falls back to a slug of the whole heading when we can't spot a scene token.
 */
function extractSceneId(headline: string): string {
  const m = /\bscene[\s-]*(\d+[a-z]?)\b/i.exec(headline);
  if (m) return `scene-${m[1]!.toLowerCase()}`;
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Parse beats from a scenario.json `scenes` field. Accepts both shapes:
 *   - canonical record:  { "scene-01": { startSec, endSec, ... }, ... }
 *   - legacy array:      [ { id, startSec, endSec }, ... ]
 * Returns [] when the shape doesn't carry numeric timings.
 */
export function parseScenarioBeats(scenarioJson: unknown): SceneBeat[] {
  if (!scenarioJson || typeof scenarioJson !== "object") return [];
  const scenes = (scenarioJson as { scenes?: unknown }).scenes;
  if (!scenes) return [];

  const out: SceneBeat[] = [];
  const ingest = (id: string, s: unknown) => {
    if (!s || typeof s !== "object") return;
    const rec = s as { startSec?: unknown; endSec?: unknown; durationSec?: unknown; id?: unknown };
    const startSec = Number(rec.startSec);
    let endSec = Number(rec.endSec);
    if (!Number.isFinite(endSec) && Number.isFinite(startSec) && Number.isFinite(Number(rec.durationSec))) {
      endSec = startSec + Number(rec.durationSec);
    }
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return;
    const sceneId = typeof rec.id === "string" && rec.id ? rec.id : id;
    out.push({ id: sceneId, startSec, endSec });
  };

  if (Array.isArray(scenes)) {
    for (const s of scenes) {
      const rec = s as { id?: string };
      ingest(typeof rec?.id === "string" ? rec.id : "scene", s);
    }
  } else if (typeof scenes === "object") {
    for (const [key, s] of Object.entries(scenes as Record<string, unknown>)) {
      ingest(key, s);
    }
  }
  return out;
}

/**
 * Resolve snapshot timestamps for a project. Tries scenario.json first, then
 * STORYBOARD.md. Returns a list of midpoint timestamps (one per beat). When no
 * source is parseable, returns `[]` — the caller decides the fallback.
 */
export async function resolveSnapshotTimestamps(projectDir: string): Promise<{
  source: "scenario.json" | "STORYBOARD.md" | null;
  beats: SceneBeat[];
  midpoints: number[];
}> {
  // 1. scenario.json
  try {
    const raw = await readFile(path.join(projectDir, "scenario.json"), "utf8");
    const j = JSON.parse(raw);
    const beats = parseScenarioBeats(j);
    if (beats.length > 0) {
      return {
        source: "scenario.json",
        beats,
        midpoints: beats.map((b) => roundTs((b.startSec + b.endSec) / 2)),
      };
    }
  } catch (err) {
    if ((err as { code?: string } | undefined)?.code !== "ENOENT") {
      // JSON parse error or read error — don't crash snapshot just because
      // scenario.json is malformed. Fall through to STORYBOARD.md.
    }
  }

  // 2. STORYBOARD.md
  try {
    const md = await readFile(path.join(projectDir, "STORYBOARD.md"), "utf8");
    const beats = parseStoryboardBeats(md);
    if (beats.length > 0) {
      return {
        source: "STORYBOARD.md",
        beats,
        midpoints: beats.map((b) => roundTs((b.startSec + b.endSec) / 2)),
      };
    }
  } catch (err) {
    if ((err as { code?: string } | undefined)?.code !== "ENOENT") {
      // ignore
    }
  }

  return { source: null, beats: [], midpoints: [] };
}

function roundTs(n: number): number {
  return Math.round(n * 100) / 100;
}
