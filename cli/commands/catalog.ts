// `ralphy catalog` — the transitions + motion-elements catalog (#563).
//
//   catalog list            query items by kind / mood / energy / tag / sfx tag
//   catalog show <id>       one item: params, usage notes, fragment + preview paths
//   catalog sfx harvest     copy + dedupe + tag + loudnorm project SFX into the shared pack
//   catalog sfx list        query the SFX pack
//   catalog use <id>        insert one item into a project's index.html as a
//                           HyperFrames sub-composition clip, snapshot first,
//                           and record the use (#594)
//   catalog build-previews  assemble + render each item's 9:16 preview mp4 (local, free)
//   catalog page            write the static, filterable catalog page
//   catalog fonts list|pairs|sync|lint|preview
//                           free font library: license manifest, glyph
//                           coverage, font pairs by register (#565)
//
// Definitions are repo-tracked (`catalog/manifest.json` + `catalog/items/`);
// binaries live under the gitignored data root (`.ralphy/catalog/`). See
// cli/lib/catalog/paths.ts for why.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { catalogListRow, filterCatalogItems, fragmentPath, loadCatalogManifest } from "../lib/catalog/manifest.js";
import { CATALOG_ENERGIES, CATALOG_KINDS, CATALOG_MOODS, SFX_TAGS, type CatalogEnergy, type CatalogKind } from "../lib/catalog/schema.js";
import { harvestSfx, loadSfxManifest } from "../lib/catalog/sfx.js";
import { buildPreviewHtml, previewTiming, HARNESS_CSS } from "../lib/catalog/harness.js";
import {
  COVERAGE_TAGS,
  fontFacesForHtml,
  fontLintSources,
  fontManifestPath,
  fontsDataDir,
  lintFontManifest,
  loadFontManifest,
  syncFonts,
  type FontManifest,
} from "../lib/catalog/fonts.js";
import { buildFontPairHtml } from "../lib/catalog/font-pairs.js";
import { captionContrast, captionLimitsFromPreset } from "../lib/catalog/captions.js";
import { buildCatalogPage } from "../lib/catalog/page.js";
import {
  catalogBuildDir,
  catalogDataDir,
  catalogManifestPath,
  catalogPagePath,
  catalogPreviewsDir,
  catalogSfxDir,
} from "../lib/catalog/paths.js";
import { runHyperframesRender } from "../lib/render/hyperframes.js";
import { lintHyperframesHtml } from "../lib/render/hyperframes-lint.js";
import {
  CAPTION_TAIL_SEC,
  CATALOG_COPY_DIR,
  CATALOG_USES_LOG,
  CONTEXT_KEYS,
  CatalogUseInputError,
  ITEM_HEIGHT,
  ITEM_WIDTH,
  buildSubComposition,
  clipMarkup,
  coerceParamValue,
  compositionLength,
  insertIntoRoot,
  inspectComposition,
  nextUseId,
  parseWordTimings,
  placeVersioned,
  planClip,
  planFileSnapshot,
  planSfxTrack,
  resolveParams,
  round3,
  sfxMarkup,
  sha256,
  writeNew,
  type Word,
} from "../lib/catalog/use.js";
import { getCommandContext } from "../lib/context-state.js";
import { findCompatibilityProject } from "../lib/project-lookup.js";
import { projectDir } from "../lib/paths.js";
import { renderCompositionForProject } from "../lib/project-tree-composition.js";

function checkEnum(flag: string, value: string | undefined, allowed: readonly string[], verb: string): void {
  if (value !== undefined && !allowed.includes(value)) {
    raiseError("E_FLAG_UNKNOWN", { flag, value, allowed: allowed.join(", "), verb });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function manifestOrFail() {
  try {
    return await loadCatalogManifest();
  } catch (e) {
    raiseError("E_FILE_MALFORMED", { format: "catalog manifest", path: catalogManifestPath(), detail: String((e as Error)?.message ?? e).slice(0, 400) });
  }
}

async function fontManifestOrNull(): Promise<FontManifest | null> {
  try {
    return await loadFontManifest();
  } catch {
    return null;
  }
}

async function fontManifestOrFail(): Promise<FontManifest> {
  try {
    return await loadFontManifest();
  } catch (e) {
    raiseError("E_FILE_MALFORMED", { format: "font manifest", path: fontManifestPath(), detail: String((e as Error)?.message ?? e).slice(0, 400) });
  }
}

/** Declare vendored font files for every manifest family the page names and copy them into the build dir. */
async function vendorFonts(html: string, dir: string, fonts: FontManifest | null, warnings: string[], id: string) {
  if (!fonts) return undefined;
  const { faces, copies, missing } = await fontFacesForHtml(html, fonts);
  if (missing.length > 0) warnings.push(`${id}: ${missing.length} font file(s) not synced (${missing.slice(0, 3).join(", ")}); run ralphy catalog fonts sync`);
  if (copies.length > 0) await fs.mkdir(path.join(dir, "fonts"), { recursive: true });
  for (const c of copies) await fs.copyFile(c.from, path.join(dir, c.to));
  return faces;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

type CatalogUseOpts = {
  project: string;
  at?: string;
  duration?: string;
  param: string[];
  track?: string;
  from?: string;
  to?: string;
  target?: string;
  words?: string;
  bind: string[];
  dryRun: boolean;
};

const USE_VERB = "catalog use";

function inputError(e: unknown): never {
  if (e instanceof CatalogUseInputError) raiseError("E_INPUT_INVALID", { field: e.field, detail: e.detail, verb: USE_VERB });
  throw e;
}

function seconds(flag: string, raw: string | undefined, { positive }: { positive: boolean }): number | undefined {
  if (raw === undefined) return undefined;
  const n = raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) {
    raiseError("E_INPUT_INVALID", { field: flag, detail: `expected ${positive ? "a positive" : "a non-negative"} number of seconds, got '${raw}'`, verb: USE_VERB });
  }
  return n;
}

/**
 * `ralphy catalog use` (#594). Validates everything first, then (unless
 * --dry-run) snapshots index.html, writes the fragment copy and the SFX copy
 * (append-only), rewrites index.html with the new clip, and appends the usage
 * record. The library half lives in cli/lib/catalog/use.ts.
 */
async function catalogUse(id: string, opts: CatalogUseOpts): Promise<void> {
  const manifest = await manifestOrFail();
  const item = manifest.items.find((i) => i.id === id);
  if (!item) raiseError("E_NOT_FOUND", { kind: "catalog", id });

  // ── kind-specific host bindings ──────────────────────────────────────────
  const context: Record<string, unknown> = {};
  const allowed = CONTEXT_KEYS[item.kind];
  for (const key of ["from", "to", "target", "words"] as const) {
    if (opts[key] !== undefined && !allowed.includes(key)) {
      raiseError("E_INPUT_INVALID", { field: key, detail: `--${key} does not apply to a ${item.kind} item (${item.id})`, verb: USE_VERB });
    }
  }
  // Layer recipes (parallax, dolly zoom) move o.layers, not o.target.
  const layerRecipe = item.kind === "camera" && item.camera?.input === "layers";
  const required = item.kind === "transition" ? ["from", "to"] : item.kind === "camera" && !layerRecipe ? ["target"] : item.kind === "caption" ? ["words"] : [];
  for (const key of required) {
    if (opts[key as keyof CatalogUseOpts] === undefined) raiseError("E_FLAG_MISSING", { flag: key, verb: USE_VERB });
  }
  if (layerRecipe && !opts.bind.some((pair) => pair.trim().startsWith("bg="))) {
    raiseError("E_FLAG_MISSING", { flag: "bind bg=<selector>", verb: USE_VERB });
  }
  if (item.kind === "camera" && item.camera?.input === "track") {
    raiseError("E_INPUT_INVALID", {
      field: "item",
      detail: `${item.id} follows a point track (o.track from \`ralphy track point\`); \`catalog use\` does not wire tracks, call the function by hand (editor/references/virtual-camera.md)`,
      verb: USE_VERB,
    });
  }
  if (opts.from) context.from = opts.from;
  if (opts.to) context.to = opts.to;
  if (opts.target) context.target = opts.target;
  for (const pair of opts.bind) {
    const eq = pair.indexOf("=");
    const key = eq > 0 ? pair.slice(0, eq).trim() : "";
    if (!key || eq === pair.length - 1 || !allowed.includes(key) || ["from", "to", "target", "words"].includes(key)) {
      const keys = allowed.filter((k) => !["from", "to", "target", "words"].includes(k)).join(", ");
      raiseError("E_INPUT_INVALID", { field: "bind", detail: `expected key=selector with key one of ${keys} for a ${item.kind} item, got '${pair}'`, verb: USE_VERB });
    }
    context[key] = pair.slice(eq + 1);
  }

  // ── params, numbers ──────────────────────────────────────────────────────
  let params: ReturnType<typeof resolveParams>;
  try {
    params = resolveParams(item, opts.param);
  } catch (e) {
    inputError(e);
  }
  const atFlag = seconds("at", opts.at, { positive: false });
  const durationFlag = seconds("duration", opts.duration, { positive: true });
  let trackFlag: number | undefined;
  if (opts.track !== undefined) {
    if (!/^\d+$/.test(opts.track)) raiseError("E_INPUT_INVALID", { field: "track", detail: `expected a non-negative integer, got '${opts.track}'`, verb: USE_VERB });
    trackFlag = Number(opts.track);
  }
  const hasDurationParam = item.params.some((p) => p.id === "duration");
  if (hasDurationParam && durationFlag !== undefined && !params.explicit.has("duration")) {
    try {
      params.values.duration = coerceParamValue(item, "duration", String(durationFlag), "duration");
    } catch (e) {
      inputError(e);
    }
  }

  // ── the project and its composition ──────────────────────────────────────
  const commandContext = getCommandContext();
  const found = await findCompatibilityProject(opts.project);
  let dir = found?.dir ?? null;
  if (dir === null && commandContext === null) {
    const guess = projectDir(opts.project);
    if (await exists(guess)) dir = guess;
  }
  if (dir === null) raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
  const indexPath = path.join(dir, "index.html");
  let indexHtml: string;
  try {
    indexHtml = await fs.readFile(indexPath, "utf-8");
  } catch {
    raiseError("E_FILE_UNREADABLE", { path: indexPath });
  }
  const info = inspectComposition(indexHtml);
  if (!info.root) {
    raiseError("E_FILE_MALFORMED", { format: "HyperFrames composition", path: indexPath, detail: "no root element with data-composition-id" });
  }
  const length = compositionLength(info);
  if (length === null) {
    raiseError("E_FILE_MALFORMED", { format: "HyperFrames composition", path: indexPath, detail: "the root composition has no data-duration and no timed clips" });
  }
  for (const key of ["from", "to", "target", "subject", "bg", "mid", "fg", "stage"]) {
    const sel = context[key];
    const m = typeof sel === "string" ? /^#([A-Za-z_][\w-]*)$/.exec(sel) : null;
    if (m && !info.ids.has(m[1]!)) {
      raiseError("E_INPUT_INVALID", { field: key, detail: `index.html has no element with id '${m[1]}'`, verb: USE_VERB });
    }
  }

  // ── caption word timings ─────────────────────────────────────────────────
  let words: Word[] | null = null;
  let wordsFile: string | null = null;
  if (opts.words !== undefined) {
    const candidates = path.isAbsolute(opts.words) ? [opts.words] : [path.resolve(process.cwd(), opts.words), path.join(dir, opts.words)];
    for (const c of candidates) if (wordsFile === null && (await exists(c))) wordsFile = c;
    if (wordsFile === null) raiseError("E_FILE_UNREADABLE", { path: candidates[candidates.length - 1]! });
    try {
      words = parseWordTimings(JSON.parse(await fs.readFile(wordsFile, "utf-8")));
    } catch (e) {
      raiseError("E_FILE_MALFORMED", { format: "word timings", path: wordsFile, detail: String((e as Error)?.message ?? e).slice(0, 300) });
    }
    context.words = words;
  }

  // ── timing ───────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  let duration: number;
  if (durationFlag !== undefined) duration = durationFlag;
  else if (hasDurationParam) duration = Number(params.values.duration);
  else if (words) {
    const lastEnd = Math.max(...words.map((w) => w.end));
    duration = lastEnd + CAPTION_TAIL_SEC;
    // Trim only the tail when the composition ends sooner.
    const room = length - (atFlag ?? 0);
    if (atFlag !== undefined && duration > room && lastEnd <= room) duration = room;
  } else duration = item.duration;
  if (hasDurationParam && duration < Number(params.values.duration)) {
    warnings.push(`clip duration ${duration}s is shorter than the effect (duration param ${params.values.duration}s); the effect is cut off`);
  }
  let clip: ReturnType<typeof planClip>;
  try {
    clip = planClip({ info, length, duration, at: atFlag, track: trackFlag });
  } catch (e) {
    inputError(e);
  }
  if (info.root.width !== null && info.root.height !== null && (info.root.width !== ITEM_WIDTH || info.root.height !== ITEM_HEIGHT)) {
    warnings.push(`catalog items are authored for ${ITEM_WIDTH}x${ITEM_HEIGHT}; this composition is ${info.root.width}x${info.root.height}`);
  }

  // ── files ────────────────────────────────────────────────────────────────
  let subComposition: string;
  try {
    subComposition = buildSubComposition(item, await fs.readFile(fragmentPath(item), "utf-8"));
  } catch (e) {
    raiseError("E_FILE_MALFORMED", { format: "catalog fragment", path: fragmentPath(item), detail: String((e as Error)?.message ?? e).slice(0, 300) });
  }
  const itemSha256 = sha256(subComposition);
  const copyDir = path.join(dir, CATALOG_COPY_DIR);
  const copy = await placeVersioned(copyDir, item.id, ".html", itemSha256);
  const copyRel = `${CATALOG_COPY_DIR}/${copy.name}`;

  const useId = nextUseId(info, item);
  let sfxPlan: { id: string; from: string; path: string; action: "write" | "reuse"; start: number; duration: number; track: number; volume: number; markup: string } | null = null;
  if (item.sfx) {
    const pack = await loadSfxManifest();
    const entry = pack?.entries.find((e) => e.id === item.sfx!.id);
    const start = round3(Math.max(0, clip.start + item.sfx.at));
    if (!pack) {
      warnings.push(`SFX pack not found at ${catalogSfxDir()}; the clip is silent (run \`ralphy catalog sfx harvest\`, then use the item again or add ${item.sfx.id} by hand)`);
    } else if (!entry) {
      warnings.push(`SFX ${item.sfx.id} is not in the pack at ${catalogSfxDir()}; the clip is silent`);
    } else if (start >= length) {
      warnings.push(`SFX ${item.sfx.id} would start at ${start}s, past the composition end; skipped`);
    } else {
      const from = path.join(catalogSfxDir(), entry.file);
      let bytes: Uint8Array | null = null;
      try {
        bytes = await fs.readFile(from);
      } catch {
        warnings.push(`SFX file ${from} is unreadable; the clip is silent`);
      }
      if (bytes) {
        const sfxDuration = round3(Math.min(item.sfx.trim ?? entry.durationSec, length - start));
        const ext = path.extname(entry.file) || ".mp3";
        const placed = await placeVersioned(path.join(dir, "artifacts", "sfx"), entry.id, ext, sha256(bytes));
        const rel = `artifacts/sfx/${placed.name}`;
        const track = planSfxTrack(info, length, clip, start, start + sfxDuration);
        sfxPlan = {
          id: entry.id,
          from,
          path: rel,
          action: placed.action,
          start,
          duration: sfxDuration,
          track,
          volume: item.sfx.volume,
          markup: sfxMarkup({ useId, src: rel, start, duration: sfxDuration, track, volume: item.sfx.volume }),
        };
      }
    }
  }

  const markup = clipMarkup({ useId, item, src: copyRel, clip, values: params.values, context });
  const nextHtml = insertIntoRoot(indexHtml, sfxPlan ? [markup, sfxPlan.markup] : [markup]);

  // ── snapshot ─────────────────────────────────────────────────────────────
  // Store root: the #591 project-tree Composition records the tree as a sealed,
  // append-only revision (what `render` builds), so the pre-edit state is that
  // revision. Tree-only root (no store): append-only compositions/v<N>.html.
  let snapshot: Record<string, unknown>;
  let fileSnapshot: { path: string; action: "write" | "reuse" } | null = null;
  if (commandContext !== null) {
    const query = commandContext.kind === "session"
      ? { sessionId: commandContext.sessionId }
      : { workspaceId: commandContext.workspaceId, ...(commandContext.projectId ? { projectId: commandContext.projectId } : {}) };
    const resolved = await renderCompositionForProject({
      context: query,
      workspaceId: commandContext.workspaceId,
      projectId: commandContext.projectId ?? found!.id,
      treeDir: dir,
      reference: opts.project,
      verb: USE_VERB,
      dryRun: opts.dryRun,
      ...(commandContext.kind === "session" ? { authoredBySessionId: commandContext.sessionId } : {}),
    });
    if (resolved.projectTree === null) {
      raiseError("E_INPUT_INVALID", {
        field: "project",
        detail: `the video Composition of ${opts.project} (revision ${resolved.revisionId}) was authored outside its Project tree, so render does not read ${indexPath}; edit that Composition instead`,
        verb: USE_VERB,
      });
    }
    snapshot = { kind: "composition-revision", compositionId: resolved.compositionId, revisionId: resolved.revisionId, revision: resolved.projectTree.revision };
  } else {
    fileSnapshot = await planFileSnapshot(dir, indexHtml);
    snapshot = { kind: "file", path: fileSnapshot.path, action: fileSnapshot.action };
  }

  // The record keeps the word count and file, not every timing.
  const recordContext: Record<string, unknown> = { ...context };
  if (words) recordContext.words = { count: words.length, file: wordsFile };
  const record = {
    schema: "ralphy.catalog-use/v1",
    timestamp: new Date().toISOString(),
    project: opts.project,
    projectId: found?.id ?? opts.project,
    useId,
    item: item.id,
    kind: item.kind,
    itemSha256,
    catalogUpdated: manifest.updated,
    copy: copyRel,
    composition: "index.html",
    start: clip.start,
    duration: clip.duration,
    end: clip.end,
    track: clip.track,
    params: params.values,
    context: recordContext,
    sfx: sfxPlan ? { id: sfxPlan.id, file: sfxPlan.path, start: sfxPlan.start, volume: sfxPlan.volume } : null,
    snapshot,
  };
  const files = [
    ...(fileSnapshot ? [{ path: fileSnapshot.path, action: fileSnapshot.action }] : []),
    { path: copyRel, action: copy.action },
    ...(sfxPlan ? [{ path: sfxPlan.path, action: sfxPlan.action }] : []),
    { path: "index.html", action: "update" },
    { path: CATALOG_USES_LOG, action: "append" },
  ];

  if (!opts.dryRun) {
    if (fileSnapshot?.action === "write") await writeNew(path.join(dir, fileSnapshot.path), indexHtml);
    if (copy.action === "write") await writeNew(path.join(dir, copyRel), subComposition);
    if (sfxPlan?.action === "write") await writeNew(path.join(dir, sfxPlan.path), await fs.readFile(sfxPlan.from));
    await fs.writeFile(indexPath, nextHtml);
    await fs.mkdir(path.join(dir, path.dirname(CATALOG_USES_LOG)), { recursive: true });
    await fs.appendFile(path.join(dir, CATALOG_USES_LOG), JSON.stringify(record) + "\n");
    ok(`${item.id} -> ${opts.project} index.html at ${clip.start}s on track ${clip.track} (${useId})`);
  }
  out({
    dryRun: opts.dryRun,
    project: opts.project,
    projectDir: dir,
    item: item.id,
    kind: item.kind,
    useId,
    clip: {
      id: useId,
      start: clip.start,
      duration: clip.duration,
      end: clip.end,
      track: clip.track,
      ...(item.cutAt !== undefined ? { swapAt: round3(clip.start + item.cutAt * (Number(params.values.duration ?? item.duration) / item.duration)) } : {}),
      markup,
    },
    params: params.values,
    context: recordContext,
    copy: { path: copyRel, action: copy.action, sha256: itemSha256 },
    sfx: sfxPlan ? { id: sfxPlan.id, path: sfxPlan.path, action: sfxPlan.action, start: sfxPlan.start, duration: sfxPlan.duration, track: sfxPlan.track, volume: sfxPlan.volume, markup: sfxPlan.markup } : null,
    snapshot,
    files,
    record: { path: CATALOG_USES_LOG, entry: record },
    warnings,
  });
}

export function catalogCmd() {
  const cmd = new Command("catalog").description(
    "Transitions + motion-elements catalog: 9:16 HyperFrames fragments with params, SFX and rendered previews (#563)",
  );
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy catalog list --kind transition --mood energetic
  ralphy catalog list --kind element --energy calm
  ralphy catalog show zoom-punch
  ralphy catalog use flash-white --project demo-001 --at 2.8 --from "#s1" --to "#s2" --dry-run
  ralphy catalog use cap-one-word-pop --project demo-001 --at 0 --words artifacts/captions/vo.json
  ralphy catalog sfx harvest --dry-run
  ralphy catalog sfx list --tag whoosh
  ralphy catalog build-previews --id zoom-punch whip-pan
  ralphy catalog page
  ralphy catalog list --kind layout
  ralphy catalog fonts list --script cyrillic
  ralphy catalog fonts pairs
  ralphy catalog fonts sync --write
  ralphy catalog fonts lint
  ralphy catalog fonts preview --pair bold-creator
`,
  );

  cmd
    .command("list")
    .description("List catalog items, filtered by facet (AND across flags)")
    .option("--kind <kind>", `Item kind: ${CATALOG_KINDS.join(" | ")}`)
    .option("--mood <mood>", `Mood: ${CATALOG_MOODS.join(" | ")}`)
    .option("--energy <energy>", `Energy: ${CATALOG_ENERGIES.join(" | ")}`)
    .option("--tag <tag>", "Free-form item tag (e.g. reveal, text, data)")
    .option("--sfx <tag>", `Items whose SFX carries this tag: ${SFX_TAGS.join(" | ")}`)
    .action(async (opts: { kind?: string; mood?: string; energy?: string; tag?: string; sfx?: string }) => {
      checkEnum("kind", opts.kind, CATALOG_KINDS, "catalog list");
      checkEnum("mood", opts.mood, CATALOG_MOODS, "catalog list");
      checkEnum("energy", opts.energy, CATALOG_ENERGIES, "catalog list");
      checkEnum("sfx", opts.sfx, SFX_TAGS, "catalog list");
      const manifest = await manifestOrFail();
      const rows = filterCatalogItems(manifest.items, {
        kind: opts.kind as CatalogKind | undefined,
        mood: opts.mood,
        energy: opts.energy as CatalogEnergy | undefined,
        tag: opts.tag,
        sfx: opts.sfx,
      }).map(catalogListRow);
      out(rows);
    });

  cmd
    .command("show")
    .description("Show one catalog item: params, when to use / not use, SFX cue, fragment and preview paths")
    .argument("<id>", "Item id (see `ralphy catalog list`)")
    .action(async (id: string) => {
      const manifest = await manifestOrFail();
      const item = manifest.items.find((i) => i.id === id);
      if (!item) raiseError("E_NOT_FOUND", { kind: "catalog", id });
      const previewAbs = path.join(catalogDataDir(), item.preview);
      out({
        ...item,
        fragment: fragmentPath(item),
        previewPath: previewAbs,
        previewExists: await exists(previewAbs),
        timing: previewTiming(item),
        ...(item.caption ? { contrast: captionContrast(item.caption), gateLimits: captionLimitsFromPreset(item.id, item.caption) } : {}),
      });
    });

  cmd
    .command("use")
    .description(
      "Insert a catalog item into a project's index.html as a HyperFrames sub-composition clip: snapshot index.html first, " +
        "copy the fragment to compositions/catalog/, validate --param against the manifest, copy its SFX into artifacts/sfx/, " +
        "and append the use to logs/catalog-uses.jsonl (#594)",
    )
    .argument("<item-id>", "Item id (see `ralphy catalog list`)")
    .requiredOption("--project <id>", "Project id or slug")
    .option("--at <sec>", "Clip start in composition seconds (default: the end of the last clip on the target track, 0 when it is empty)")
    .option("--duration <sec>", "Clip length (default: the item's manifest duration; captions: the last word's end + 0.6 s). Drives the item's duration param when it has one")
    .option("--param <key=value>", "Typed item param, repeatable (see `ralphy catalog show <id>`)", collect, [] as string[])
    .option("--track <n>", "data-track-index (default: the first free track above every non-catalog clip)")
    .option("--from <selector>", "Transitions: the outgoing scene")
    .option("--to <selector>", "Transitions: the incoming scene (it must start at opacity 0; the transition reveals it)")
    .option("--target <selector>", "Camera recipes: the element the camera moves (wrap the shot, not the scene root); layer recipes take --bind bg=... instead")
    .option("--words <file>", "Captions: word timings in seconds from the clip start ([{text,start,end}], or `ralphy generate captions` JSON)")
    .option("--bind <key=selector>", "Another host element, repeatable: stage, or subject / bg / mid / fg for camera recipes", collect, [] as string[])
    .option("--dry-run", "Print the plan (files to write, clip markup, usage record); write nothing", false)
    .action(async (id: string, opts: CatalogUseOpts) => catalogUse(id, opts));

  const sfx = cmd.command("sfx").description("Shared SFX pack harvested from past projects (copies only; sources untouched)");

  sfx
    .command("harvest")
    .description("Copy every project SFX into .ralphy/catalog/sfx/, dedupe (sha256 + envelope fingerprint), tag, loudness-normalize (ffmpeg loudnorm recipe)")
    .option("--dry-run", "Scan, hash, fingerprint and tag only; write nothing", false)
    .option("--concurrency <n>", "Parallel ffmpeg jobs", (v) => parseInt(v, 10), 6)
    .action(async (opts: { dryRun: boolean; concurrency: number }) => {
      const result = await harvestSfx({ dryRun: opts.dryRun, concurrency: opts.concurrency });
      if (!opts.dryRun) ok(`SFX pack: ${result.unique} unique sounds -> ${result.packDir}`);
      out({ ...result, failed: result.failed.slice(0, 20) });
    });

  sfx
    .command("list")
    .description("List the SFX pack (run `ralphy catalog sfx harvest` first)")
    .option("--tag <tag>", `SFX tag: ${SFX_TAGS.join(" | ")}`)
    .option("--max-duration <s>", "Only sounds at most this long (seconds)", (v) => parseFloat(v))
    .action(async (opts: { tag?: string; maxDuration?: number }) => {
      checkEnum("tag", opts.tag, SFX_TAGS, "catalog sfx list");
      const manifest = await loadSfxManifest();
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "catalog sfx", id: path.join(catalogSfxDir(), "manifest.json") });
      const rows = manifest.entries
        .filter((e) => (!opts.tag || e.tag === opts.tag) && (opts.maxDuration === undefined || e.durationSec <= opts.maxDuration))
        .map((e) => ({
          id: e.id,
          tag: e.tag,
          durationSec: e.durationSec,
          file: path.join(catalogSfxDir(), e.file),
          source: `${e.source.workspace}/${e.source.project}/${e.source.file}`,
          duplicates: e.duplicates.length,
        }));
      out(rows);
    });

  cmd
    .command("build-previews")
    .description("Assemble each item into a standalone 1080x1920 HyperFrames composition and render its preview mp4 (local, free)")
    .option("--id <ids...>", "Only these item ids")
    .option("--force", "Re-render previews that already exist (previews are derived build output)", false)
    .option("--quality <q>", "HyperFrames quality: draft | standard | high", "standard")
    .option("--workers <n>", "Capture workers per render (number or auto)", "2")
    .option("--build-only", "Write the compositions; skip rendering", false)
    .action(async (opts: { id?: string[]; force: boolean; quality: string; workers: string; buildOnly: boolean }) => {
      checkEnum("quality", opts.quality, ["draft", "standard", "high"], "catalog build-previews");
      const manifest = await manifestOrFail();
      const sfxManifest = await loadSfxManifest();
      const fonts = await fontManifestOrNull();
      const wanted = opts.id ? new Set(opts.id) : null;
      if (wanted) {
        for (const id of wanted) {
          if (!manifest.items.some((i) => i.id === id)) raiseError("E_NOT_FOUND", { kind: "catalog", id });
        }
      }
      const items = manifest.items.filter((i) => !wanted || wanted.has(i.id));
      const built: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const warnings: string[] = [];
      await fs.mkdir(catalogPreviewsDir(), { recursive: true });
      for (const item of items) {
        const outPath = path.join(catalogDataDir(), item.preview);
        if (!opts.force && !opts.buildOnly && (await exists(outPath))) {
          skipped.push(item.id);
          continue;
        }
        const dir = path.join(catalogBuildDir(), item.id);
        await fs.mkdir(dir, { recursive: true });
        let sfxFile: string | null = null;
        if (item.sfx) {
          const entry = sfxManifest?.entries.find((e) => e.id === item.sfx!.id);
          if (entry) {
            sfxFile = "sfx.mp3";
            await fs.copyFile(path.join(catalogSfxDir(), entry.file), path.join(dir, sfxFile));
          } else {
            warnings.push(`${item.id}: SFX ${item.sfx.id} not in the pack; preview renders silent (run catalog sfx harvest)`);
          }
        }
        let html: string;
        try {
          const fragmentHtml = await fs.readFile(fragmentPath(item), "utf-8");
          const fontFaces = await vendorFonts(`${HARNESS_CSS}\n${fragmentHtml}`, dir, fonts, warnings, item.id);
          html = buildPreviewHtml({ item, fragmentHtml, sfxFile, fontFaces });
        } catch (e) {
          failed.push({ id: item.id, error: String((e as Error)?.message ?? e).slice(0, 300) });
          continue;
        }
        const lint = lintHyperframesHtml(html);
        if (!lint.ok) {
          failed.push({ id: item.id, error: `lint: ${lint.errors.map((f) => f.code).join(", ")}` });
          continue;
        }
        await fs.writeFile(path.join(dir, "index.html"), html);
        if (opts.buildOnly) {
          built.push(item.id);
          continue;
        }
        const r = await runHyperframesRender({
          projectDir: dir,
          outputPath: outPath,
          quality: opts.quality as "draft" | "standard" | "high",
          workers: opts.workers,
          quiet: true,
        });
        if (r.exitCode === 0) built.push(item.id);
        else failed.push({ id: item.id, error: r.stderr.slice(-300) });
      }
      out({ built, skipped, failed, warnings, previewsDir: catalogPreviewsDir(), buildDir: catalogBuildDir() });
    });


  const fontsCmd = cmd.command("fonts").description("Free font library (#565): license manifest, glyph coverage tags, font pairs by register");

  fontsCmd
    .command("list")
    .description("List the licensed fonts with coverage tags (catalog/fonts.json)")
    .option("--script <tag>", `Only fonts covering: ${COVERAGE_TAGS.join(" | ")}`)
    .action(async (opts: { script?: string }) => {
      checkEnum("script", opts.script, COVERAGE_TAGS, "catalog fonts list");
      const m = await fontManifestOrFail();
      const rows = [];
      for (const f of m.fonts) {
        if (opts.script && !(f.coverage?.tags ?? []).includes(opts.script as (typeof COVERAGE_TAGS)[number])) continue;
        let synced = true;
        for (const file of f.files) if (!(await exists(path.join(fontsDataDir(), f.id, file.local)))) synced = false;
        rows.push({
          id: f.id,
          family: f.family,
          category: f.category,
          license: f.license.id,
          coverage: f.coverage?.tags ?? [],
          weights: f.files.map((x) => x.weight ?? "?"),
          bytes: f.files.reduce((n, x) => n + (x.bytes ?? 0), 0),
          synced,
        });
      }
      out(rows);
    });

  fontsCmd
    .command("pairs")
    .description("List the curated font pairs by register, with the scripts both fonts cover")
    .option("--script <tag>", `Only pairs whose two fonts cover: ${COVERAGE_TAGS.join(" | ")}`)
    .action(async (opts: { script?: string }) => {
      checkEnum("script", opts.script, COVERAGE_TAGS, "catalog fonts pairs");
      const m = await fontManifestOrFail();
      const byId = new Map(m.fonts.map((f) => [f.id, f]));
      const rows = m.pairs
        .map((p) => {
          const d = byId.get(p.display.font)!;
          const b = byId.get(p.body.font)!;
          const scripts = (d.coverage?.tags ?? []).filter((t) => (b.coverage?.tags ?? []).includes(t));
          return {
            id: p.id,
            register: p.register,
            display: `${d.family} ${p.display.weight}${p.display.transform === "uppercase" ? " caps" : ""}`,
            body: `${b.family} ${p.body.weight}`,
            scripts,
            preview: `previews/fonts/${p.id}.mp4`,
            whenToUse: p.whenToUse,
          };
        })
        .filter((r) => !opts.script || r.scripts.includes(opts.script as (typeof COVERAGE_TAGS)[number]));
      out(rows);
    });

  fontsCmd
    .command("sync")
    .description("Download every font from google/fonts at the pinned commit into .ralphy/catalog/fonts/, verify the license text and sha256, measure glyph coverage. --write records hashes, weights and coverage tags in catalog/fonts.json")
    .option("--id <ids...>", "Only these font ids")
    .option("--write", "Write sha256, sizes, weights and coverage back to catalog/fonts.json", false)
    .action(async (opts: { id?: string[]; write: boolean }) => {
      const m = await fontManifestOrFail();
      const { manifest: next, rows } = await syncFonts(m, { ids: opts.id });
      if (opts.write) await fs.writeFile(fontManifestPath(), JSON.stringify(next, null, 2) + "\n");
      const failed = rows.filter((r) => r.error);
      out({ written: opts.write ? fontManifestPath() : null, dataDir: fontsDataDir(), fonts: rows.length, failed: failed.length, rows });
      if (failed.length > 0) process.exitCode = 1;
    });

  fontsCmd
    .command("lint")
    .description("Fail on any font without a recorded, allowed license: every font-family named in catalog fragments must be in catalog/fonts.json with a pinned license and files")
    .action(async () => {
      const m = await fontManifestOrFail();
      const issues = lintFontManifest(m, [{ where: "cli/lib/catalog/harness.ts", text: HARNESS_CSS }, ...(await fontLintSources())]);
      const errors = issues.filter((i) => i.severity === "error").length;
      out({ ok: errors === 0, fonts: m.fonts.length, pairs: m.pairs.length, errors, warnings: issues.length - errors, issues });
      if (errors > 0) process.exitCode = 1;
    });

  fontsCmd
    .command("preview")
    .description("Render a 9:16 specimen mp4 per font pair (English then Russian) into .ralphy/catalog/previews/fonts/ (local, free)")
    .option("--pair <ids...>", "Only these pair ids")
    .option("--force", "Re-render existing previews", false)
    .option("--build-only", "Write the compositions; skip rendering", false)
    .option("--workers <n>", "Capture workers per render (number or auto)", "2")
    .action(async (opts: { pair?: string[]; force: boolean; buildOnly: boolean; workers: string }) => {
      const m = await fontManifestOrFail();
      for (const id of opts.pair ?? []) if (!m.pairs.some((p) => p.id === id)) raiseError("E_NOT_FOUND", { kind: "font pair", id });
      const outDir = path.join(catalogPreviewsDir(), "fonts");
      await fs.mkdir(outDir, { recursive: true });
      const built: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const warnings: string[] = [];
      for (const pair of m.pairs.filter((p) => !opts.pair || opts.pair.includes(p.id))) {
        const outPath = path.join(outDir, `${pair.id}.mp4`);
        if (!opts.force && !opts.buildOnly && (await exists(outPath))) {
          skipped.push(pair.id);
          continue;
        }
        const dir = path.join(catalogBuildDir(), `font-pair-${pair.id}`);
        await fs.mkdir(dir, { recursive: true });
        const draft = buildFontPairHtml(pair, m, []);
        const faces = await vendorFonts(draft, dir, m, warnings, pair.id);
        const html = buildFontPairHtml(pair, m, faces ?? []);
        await fs.writeFile(path.join(dir, "index.html"), html);
        if (opts.buildOnly) {
          built.push(pair.id);
          continue;
        }
        const r = await runHyperframesRender({ projectDir: dir, outputPath: outPath, quality: "standard", workers: opts.workers, quiet: true });
        if (r.exitCode === 0) built.push(pair.id);
        else failed.push({ id: pair.id, error: r.stderr.slice(-300) });
      }
      out({ built, skipped, failed, warnings, previewsDir: outDir });
    });

  cmd
    .command("page")
    .description("Write the static catalog page (filters by kind / mood / energy, playable local previews)")
    .action(async () => {
      const manifest = await manifestOrFail();
      const result = await buildCatalogPage(manifest, await loadSfxManifest(), await fontManifestOrNull());
      ok(`Catalog page -> ${catalogPagePath()}`);
      out(result);
    });

  return cmd;
}
