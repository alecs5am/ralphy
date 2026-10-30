// `ralphy editor poster` (#598): plan and apply a poster-collage build inside
// one Project tree. The pure assembly is in ./assemble.ts; the command
// (cli/commands/editor.ts) resolves the project, the duration and the
// snapshot kind, then calls planPoster() and applyPosterPlan().
//
// What a build writes, all inside the Project tree:
//   index.html                      the assembled composition (replaced)
//   fonts/<font>.ttf                Oswald, Caveat, Inter from the licensed
//   fonts/<font>-LICENSE.txt        catalog fonts (#565), copied only when
//                                   missing: an existing file is never
//                                   overwritten, whatever its bytes
// and, before index.html is replaced, a snapshot of the previous one
// (applyPosterPlan takes the snapshot step from the caller: a store root
// records the tree as a Composition revision, a tree-only root writes an
// append-only compositions/v<N>.html; see fileSnapshot()). Nothing is deleted.

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { planFileSnapshot, writeNew } from "../catalog/use.js";
import { POSTER_FONTS, PosterScenesError, buildPosterHtml, checkScenes, evaluateScenes } from "./assemble.js";

/** A file the build needs that is not usable; a real build refuses, a dry run lists it. */
export type MissingAsset = {
  key: string;
  /** The ASSETS path, or null when the key is not in ASSETS. */
  path: string | null;
  reason: "not in ASSETS" | "file missing" | "outside the project";
  uses: string[];
};

/** A referenced asset that loads (or would load) from the project. */
export type ReferencedAsset = { key: string; path: string; remote: boolean; uses: number };

export type FontCopy = { file: string; from: string; action: "copy" | "keep" | "missing" };

/** A Lottie file that is not JSON or has no frame range; reported as malformed. */
export class PosterAssetError extends Error {
  constructor(readonly format: string, readonly file: string, readonly detail: string) {
    super(`${file}: ${detail}`);
    this.name = "PosterAssetError";
  }
}

export type PosterPlan = {
  scenes: { file: string; sha256: string; count: number; items: number };
  assets: { referenced: ReferencedAsset[]; missing: MissingAsset[]; unused: string[] };
  lottie: { inlined: Array<{ key: string; path: string; bytes: number }>; bytes: number };
  fonts: FontCopy[];
  index: { path: "index.html"; action: "create" | "update" | "unchanged"; bytes: number };
  /** The index.html being replaced; null when there is none. */
  previousIndex: string | null;
  html: string;
  warnings: string[];
};

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Where an ASSETS path points: a URL, a file inside the project, or somewhere it must not. */
export function assetLocation(projectDir: string, p: string): { kind: "remote" } | { kind: "local"; abs: string } | { kind: "outside" } {
  if (REMOTE.test(p)) return { kind: "remote" };
  if (path.isAbsolute(p)) return { kind: "outside" };
  const abs = path.resolve(projectDir, p);
  const rel = path.relative(projectDir, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return { kind: "outside" };
  return { kind: "local", abs };
}

/** The fonts the shell names, and their license files, with what a build does with each. */
export async function planFonts(projectDir: string, fontsDataDir: string): Promise<FontCopy[]> {
  const rows: FontCopy[] = [];
  for (const font of POSTER_FONTS) {
    const pairs = [
      { file: `fonts/${font.file}`, from: path.join(fontsDataDir, font.id, font.file) },
      { file: `fonts/${font.id}-LICENSE.txt`, from: path.join(fontsDataDir, font.id, "LICENSE.txt") },
    ];
    for (const pair of pairs) {
      const action = (await exists(path.join(projectDir, pair.file))) ? "keep" : (await exists(pair.from)) ? "copy" : "missing";
      rows.push({ ...pair, action });
    }
  }
  return rows;
}

export type PlanPosterInput = {
  projectDir: string;
  /** Path of the scenes file, for messages and the plan. */
  scenesFile: string;
  scenesSource: string;
  compositionId: string;
  duration: number;
  lang: string;
  title: string;
  audioSrc: string;
  /** `.ralphy/catalog/fonts`, where `ralphy catalog fonts sync` puts the licensed files. */
  fontsDataDir: string;
};

/**
 * Validate the scenes against the engine and the disk, read the referenced
 * Lottie files, plan the font copies, and assemble the HTML. Writes nothing.
 * Scenes defects throw PosterScenesError, a bad Lottie file PosterAssetError;
 * missing assets are listed in `assets.missing` (the caller refuses them on a
 * real build).
 */
export async function planPoster(input: PlanPosterInput): Promise<PosterPlan> {
  const parsed = evaluateScenes(input.scenesSource, { compositionId: input.compositionId, duration: input.duration });
  const check = checkScenes(parsed, { duration: input.duration });
  const warnings = [...check.warnings];
  const referenced: ReferencedAsset[] = [];
  const missing: MissingAsset[] = [];
  const local = new Map<string, string>();
  for (const ref of check.referenced) {
    if (ref.path === null) {
      missing.push({ key: ref.key, path: null, reason: "not in ASSETS", uses: ref.uses });
      continue;
    }
    const where = assetLocation(input.projectDir, ref.path);
    if (where.kind === "outside") {
      missing.push({ key: ref.key, path: ref.path, reason: "outside the project", uses: ref.uses });
      continue;
    }
    if (where.kind === "remote") {
      warnings.push(`ASSETS.${ref.key} (${ref.path}) loads over the network at render time; pull it into the project for a reproducible render`);
      referenced.push({ key: ref.key, path: ref.path, remote: true, uses: ref.uses.length });
      continue;
    }
    if (!(await exists(where.abs))) {
      missing.push({ key: ref.key, path: ref.path, reason: "file missing", uses: ref.uses });
      continue;
    }
    local.set(ref.key, where.abs);
    referenced.push({ key: ref.key, path: ref.path, remote: false, uses: ref.uses.length });
  }

  // Inline every referenced, present Lottie JSON (one copy per path).
  const lottie: Record<string, unknown> = {};
  const inlined: PosterPlan["lottie"]["inlined"] = [];
  for (const key of check.lottieKeys) {
    const abs = local.get(key);
    const rel = parsed.assets[key];
    if (!abs || rel === undefined || Object.prototype.hasOwnProperty.call(lottie, rel)) continue;
    if (path.extname(rel).toLowerCase() !== ".json") {
      warnings.push(`ASSETS.${key} (${rel}) is not Lottie JSON, so it is not inlined; lottie-web loads it by path, async, and may miss early frames`);
      continue;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(await fs.readFile(abs, "utf-8"));
    } catch (e) {
      throw new PosterAssetError("Lottie JSON", abs, String((e as Error)?.message ?? e).slice(0, 200));
    }
    const d = doc as { ip?: unknown; op?: unknown };
    if (typeof doc !== "object" || doc === null || typeof d.ip !== "number" || typeof d.op !== "number" || d.op <= d.ip) {
      throw new PosterAssetError("Lottie JSON", abs, "not a Lottie animation (needs numeric ip < op)");
    }
    lottie[rel] = doc;
    inlined.push({ key, path: rel, bytes: Buffer.byteLength(JSON.stringify(doc)) });
  }

  const fonts = await planFonts(input.projectDir, input.fontsDataDir);
  for (const f of fonts) {
    if (f.action === "missing") warnings.push(`${f.file} is not in the project and ${f.from} does not exist; run \`ralphy catalog fonts sync\`, then build again`);
  }

  const html = buildPosterHtml({
    scenesSource: input.scenesSource,
    lottie,
    compositionId: input.compositionId,
    duration: input.duration,
    lang: input.lang,
    title: input.title,
    audioSrc: input.audioSrc,
  });
  let previousIndex: string | null = null;
  try {
    previousIndex = await fs.readFile(path.join(input.projectDir, "index.html"), "utf-8");
  } catch {
    previousIndex = null;
  }
  return {
    scenes: {
      file: input.scenesFile,
      sha256: createHash("sha256").update(input.scenesSource).digest("hex"),
      count: check.sceneCount,
      items: check.itemCount,
    },
    assets: { referenced, missing, unused: check.unused },
    lottie: { inlined, bytes: inlined.reduce((n, l) => n + l.bytes, 0) },
    fonts,
    index: {
      path: "index.html",
      action: previousIndex === null ? "create" : previousIndex === html ? "unchanged" : "update",
      bytes: Buffer.byteLength(html),
    },
    previousIndex,
    html,
    warnings,
  };
}

/** Snapshot of the index.html about to be replaced (store revision or file copy). */
export type PosterSnapshot = Record<string, unknown>;

/**
 * The tree-only snapshot: the previous index.html as an append-only
 * `compositions/v<N>.html` (reused when the newest one holds the same bytes),
 * the same placement `ralphy catalog use` uses (#594).
 */
export function fileSnapshot(projectDir: string): (previousIndex: string) => Promise<PosterSnapshot> {
  return async (previousIndex) => {
    const planned = await planFileSnapshot(projectDir, previousIndex);
    if (planned.action === "write") await writeNew(path.join(projectDir, planned.path), previousIndex);
    return { kind: "file", path: planned.path, action: planned.action };
  };
}

/**
 * Write the plan: snapshot the previous index.html FIRST (while it is still on
 * disk), then copy the missing fonts (never over an existing file), then
 * replace index.html. Returns the snapshot record and every file touched.
 */
export async function applyPosterPlan(
  projectDir: string,
  plan: PosterPlan,
  snapshot: (previousIndex: string) => Promise<PosterSnapshot>,
): Promise<{ snapshot: PosterSnapshot | null; files: Array<{ path: string; action: string }> }> {
  const files: Array<{ path: string; action: string }> = [];
  let snap: PosterSnapshot | null = null;
  if (plan.previousIndex !== null) {
    snap = await snapshot(plan.previousIndex);
    if (typeof snap.path === "string") files.push({ path: snap.path, action: String(snap.action ?? "write") });
  }
  for (const font of plan.fonts) {
    if (font.action !== "copy") continue;
    const to = path.join(projectDir, font.file);
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.copyFile(font.from, to, fsConstants.COPYFILE_EXCL);
      files.push({ path: font.file, action: "copy" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") throw e;
    }
  }
  await fs.writeFile(path.join(projectDir, "index.html"), plan.html);
  files.push({ path: "index.html", action: plan.index.action });
  return { snapshot: snap, files };
}

export { PosterScenesError };
