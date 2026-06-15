// Image-pack workflow glue (#429) — the SCAFFOLD + the eval RUBRIC.
//
// This module is the thin glue around pieces that already exist; it builds
// NOTHING the rest of the pipeline already does:
//   • generation        → `generate image --batch <jsonl>` / `--variants` (#024).
//   • project kind probe → `cli/lib/contract.ts` (a `selected/` sibling ⇒
//                          image-pack; scenario requirement relaxed).
//   • packaging          → `ralphy unit create` + `unit package` (#423).
//   • selection          → variant tournament (#421).
//   • product fidelity   → `ralphy eval fidelity` (#422).
//
// The two things THIS module owns:
//
//   1. scaffoldImagePack({ projectId, kind, count? })
//        Lays out the pack folders, writes pack.json (the ImagePackSpec +
//        provenance), and writes prompts/pack.jsonl — a batch-ready skeleton in
//        EXACTLY the `generate image --batch` line shape ({slot, prompt}), one
//        line per spec slot, prompt = a role-templated stub the art-director
//        fills. Append-only: never clobbers an existing pack.json (auto-versions
//        unless --force).
//
//   2. scoreImagePack({ projectId })
//        The image-pack eval RUBRIC. Deterministic checks emitting eval Findings
//        (reusing the `Finding` shape + `score()` from cli/lib/eval) — role
//        coverage, aspect consistency, selected-set cohesion. Model-dependent
//        checks (text/safe-area, product fidelity) are left as SEAMS to #439
//        (OCR/text gate) + #422 (fidelity) — marked with `ponytail:` and NOT
//        implemented here.
//
// PURE-on-fs reads for the rubric; the scaffold is the only writer (and append-
// only). English-only-on-disk.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  ARTIFACT_KINDS,
  artifactKindDir,
  projectDir,
  resolveArtifactKindDir,
} from "./paths.js";
import {
  IMAGE_PACK_ARTIFACT,
  IMAGE_PACK_PROMPTS_ARTIFACT,
  ImagePackSpecSchema,
  defaultSpecForKind,
  type ImagePackKind,
  type ImagePackSpec,
} from "./schemas/image-pack.js";
import { protectExistingAsset } from "./providers/shared.js";
import { score } from "./eval/findings.js";
import type { Finding, ScoringBreakdown } from "./eval/types.js";

// ─── pack.json (spec + provenance) ──────────────────────────────────────────────

/** The on-disk pack manifest: the spec plus light provenance. */
export interface ImagePackManifest {
  /** Schema version. */
  version: 1;
  /** The project id the pack belongs to. */
  projectId: string;
  /** The pack kind (mirrors spec.kind for top-level convenience). */
  kind: ImagePackKind;
  /** ISO timestamp the pack was scaffolded. */
  scaffoldedAt: string;
  /** The validated ImagePackSpec (kind / aspect / slots). */
  spec: ImagePackSpec;
}

/** Read + parse the on-disk pack.json for a project, or null when absent / malformed. */
export function readImagePack(projectId: string): ImagePackManifest | null {
  try {
    const abs = path.join(projectDir(projectId), IMAGE_PACK_ARTIFACT);
    if (!existsSync(abs)) return null;
    const raw = JSON.parse(readFileSync(abs, "utf8")) as ImagePackManifest;
    // Re-validate the embedded spec; a malformed spec → treat as absent.
    ImagePackSpecSchema.parse(raw.spec);
    return raw;
  } catch {
    return null;
  }
}

/**
 * The batch-jsonl prompt stub for one slot — a role-templated placeholder the
 * art-director fills. English-on-disk. Deliberately verbose enough to be a real
 * starting prompt, while flagged `[TODO ...]` so a blank fan-out is obvious.
 */
function promptStubForSlot(slot: { role: string; compositionClass: string; note: string }, aspect: string): string {
  const note = slot.note ? ` ${slot.note}` : "";
  return `[TODO art-director] ${slot.role} still, ${slot.compositionClass} composition, ${aspect}.${note} Fill the brand/product specifics, palette, and copy before generation.`;
}

// ─── scaffoldImagePack ──────────────────────────────────────────────────────────

export interface ScaffoldImagePackArgs {
  projectId: string;
  kind: ImagePackKind;
  /** Tunes the repeatable middle of the slot set (see defaultSpecForKind). */
  count?: number;
  /** Bypass append-only auto-versioning and overwrite an existing pack.json. */
  force?: boolean;
}

export interface ScaffoldImagePackResult {
  projectId: string;
  kind: ImagePackKind;
  spec: ImagePackSpec;
  /** Absolute paths created / written. */
  dirs: string[];
  packJson: string;
  promptsJsonl: string;
  /** Number of jsonl lines written (== spec.slots.length). */
  slotCount: number;
  /** Archived path when an existing pack.json was auto-versioned (append-only). */
  archivedPackJson?: string;
  /** The exact `generate image --batch` invocation to run next. */
  batchCommand: string;
}

/**
 * Scaffold an image-pack project: lay out the folders, write pack.json (spec +
 * provenance), and write prompts/pack.jsonl (one batch-ready `{slot, prompt}`
 * line per spec slot). Best-effort + append-only (AGENTS.md #14): an existing
 * pack.json is auto-versioned to pack.v{N}.json unless `force` is set.
 *
 * Creates the `selected/` sibling so `cli/lib/contract.ts probeKind()` correctly
 * types the project as `image-pack` (relaxing the scenario requirement).
 */
export async function scaffoldImagePack(args: ScaffoldImagePackArgs): Promise<ScaffoldImagePackResult> {
  const { projectId, kind, count, force } = args;
  const dir = projectDir(projectId);
  const spec = defaultSpecForKind(kind, count);

  // Folders: the per-kind artifact tree (reuse ARTIFACT_KINDS so images/ +
  // refs/ etc. exist), plus the image-pack siblings (selected/, prompts/, logs/).
  const created: string[] = [];
  await fs.mkdir(dir, { recursive: true });
  // artifacts/<kind>/ — at minimum images + refs; create the full set so the
  // project is shaped like every other project (idempotent).
  for (const k of ARTIFACT_KINDS) {
    const kd = artifactKindDir(projectId, k);
    await fs.mkdir(kd, { recursive: true });
  }
  created.push(resolveArtifactKindDir(projectId, "images"));
  created.push(resolveArtifactKindDir(projectId, "refs"));
  for (const sib of ["selected", "prompts", "logs"]) {
    const p = path.join(dir, sib);
    await fs.mkdir(p, { recursive: true });
    created.push(p);
  }

  // pack.json — append-only: auto-version a prior pack.json unless --force.
  const packPath = path.join(dir, IMAGE_PACK_ARTIFACT);
  const archived = await protectExistingAsset(packPath, force);
  const manifest: ImagePackManifest = {
    version: 1,
    projectId,
    kind,
    scaffoldedAt: new Date().toISOString(),
    spec,
  };
  await fs.writeFile(packPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // prompts/pack.jsonl — one `{slot, prompt}` line per spec slot, in EXACTLY the
  // `generate image --batch` line shape. Append-only: auto-version a prior file.
  const promptsPath = path.join(dir, IMAGE_PACK_PROMPTS_ARTIFACT);
  await protectExistingAsset(promptsPath, force);
  const lines = spec.slots.map((s) =>
    JSON.stringify({ slot: s.id, prompt: promptStubForSlot(s, spec.aspect) }),
  );
  await fs.writeFile(promptsPath, lines.join("\n") + "\n", "utf8");

  const batchCommand = `ralphy generate image --project ${projectId} --batch ${IMAGE_PACK_PROMPTS_ARTIFACT} --aspect ${spec.aspect}`;

  return {
    projectId,
    kind,
    spec,
    dirs: created,
    packJson: packPath,
    promptsJsonl: promptsPath,
    slotCount: spec.slots.length,
    ...(archived ? { archivedPackJson: archived } : {}),
    batchCommand,
  };
}

// ─── scoreImagePack (the eval RUBRIC) ─────────────────────────────────────────────

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/** List image files in a dir (top level only). Never throws. */
function listImages(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => {
        try {
          return statSync(path.join(dir, f)).isFile() && IMAGE_EXT.has(path.extname(f).toLowerCase());
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * Does a generated image exist for `slotId`? Matches `<slot>.<ext>` and any
 * auto-versioned / variant sibling (`<slot>.v2.png`, `<slot>-v1.png`) so a
 * re-rolled or A/B'd slot still counts as covered. Pure read.
 */
function slotHasImage(images: string[], slotId: string): boolean {
  return images.some((f) => {
    const stem = path.basename(f, path.extname(f)).toLowerCase();
    const s = slotId.toLowerCase();
    return stem === s || stem.startsWith(`${s}.`) || stem.startsWith(`${s}-v`);
  });
}

export interface ScoreImagePackResult {
  project: string;
  kind: ImagePackKind | null;
  /** Slots in the spec. */
  expectedSlots: number;
  /** Slots with at least one generated image in artifacts/images/. */
  coveredSlots: number;
  /** Images present in selected/ (the curated handoff subset). */
  selectedCount: number;
  findings: Finding[];
  scoring: ScoringBreakdown;
}

/**
 * The image-pack eval RUBRIC (#429). Deterministic checks against the project on
 * disk, emitting eval `Finding`s and a `score()` verdict:
 *
 *   • role coverage      — every spec slot has a generated image (the load-
 *                          bearing check; a missing slot is a `fail`).
 *   • aspect consistency — the pack declares one aspect; a mixed-aspect note is
 *                          surfaced (deterministic on the declared spec; pixel-
 *                          level aspect verification is an ffprobe SEAM, below).
 *   • selected-set cohesion — the count in selected/ matches the expected pack
 *                          size (all slots) — a short / over-full handoff set is
 *                          a `warn`.
 *
 * Model-dependent checks are SEAMS, not implemented here (see the `ponytail:`
 * markers): safe-area / on-image-text quality → #439 (OCR/text gate); product /
 * brand fidelity → `ralphy eval fidelity` (#422). The rubric NEVER calls a model
 * and never re-runs fidelity.
 *
 * Pure read — never mutates the project, never throws on a bare dir.
 */
export function scoreImagePack(args: { projectId: string }): ScoreImagePackResult {
  const { projectId } = args;
  const pack = readImagePack(projectId);
  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => findings.push({ id: `IP${nextId++}`, ...x });

  if (!pack) {
    add({
      category: "image-pack.missing-spec",
      severity: "fail",
      sceneIndex: null,
      timestampSec: null,
      message: "No pack.json found — the project is not a scaffolded image pack.",
      fixHint: "Run `ralphy project image-pack <id> --kind <k>` to scaffold the pack spec first.",
      fixCommand: `ralphy project image-pack ${projectId} --kind app-store`,
    });
    return {
      project: projectId,
      kind: null,
      expectedSlots: 0,
      coveredSlots: 0,
      selectedCount: 0,
      findings,
      scoring: score(findings),
    };
  }

  const spec = pack.spec;
  const images = listImages(resolveArtifactKindDir(projectId, "images"));

  // — Role coverage: every spec slot must have a generated image.
  const missing: string[] = [];
  for (const slot of spec.slots) {
    if (!slotHasImage(images, slot.id)) missing.push(slot.id);
  }
  const coveredSlots = spec.slots.length - missing.length;
  if (missing.length > 0) {
    add({
      category: "image-pack.role-coverage",
      severity: "fail",
      sceneIndex: null,
      timestampSec: null,
      message: `${missing.length} of ${spec.slots.length} spec slot(s) have no generated image: ${missing.join(", ")}.`,
      fixHint: "Generate the missing slots via the batch jsonl, then re-score.",
      fixCommand: `ralphy generate image --project ${projectId} --batch ${IMAGE_PACK_PROMPTS_ARTIFACT} --aspect ${spec.aspect}`,
    });
  }

  // — Aspect consistency. The spec declares ONE aspect; surface it so the agent
  //   verifies every gen used it.
  //   ponytail: pixel-level aspect verification (ffprobe each image, compare to
  //   spec.aspect) is an ffprobe SEAM — `ralphy project assets <id>` already
  //   ffprobe-truths every file (w/h/aspect). Not duplicated here; the rubric
  //   asserts the DECLARED aspect only.
  if (!/^\d+\s*:\s*\d+$/.test(spec.aspect)) {
    add({
      category: "image-pack.aspect",
      severity: "warn",
      sceneIndex: null,
      timestampSec: null,
      message: `Pack aspect "${spec.aspect}" is not a W:H ratio. Generation expects an aspect alias (e.g. 9:16, 1:1, 4:5).`,
      fixHint: "Re-scaffold with a valid --aspect or fix pack.json's spec.aspect.",
      fixCommand: null,
    });
  }

  // — Selected-set cohesion: the curated handoff subset should cover the pack.
  const selectedCount = listImages(path.join(projectDir(projectId), "selected")).length;
  if (selectedCount === 0) {
    add({
      category: "image-pack.selected-empty",
      severity: "warn",
      sceneIndex: null,
      timestampSec: null,
      message: "selected/ is empty — no curated handoff subset has been chosen yet.",
      fixHint: "Pick the winning variant per slot (variant tournament, #421) and copy them into selected/.",
      fixCommand: null,
    });
  } else if (selectedCount < spec.slots.length) {
    add({
      category: "image-pack.selected-cohesion",
      severity: "warn",
      sceneIndex: null,
      timestampSec: null,
      message: `selected/ has ${selectedCount} image(s) for a ${spec.slots.length}-slot pack — the handoff set is short of full role coverage.`,
      fixHint: "Select one winner per spec slot so the handoff set covers every role.",
      fixCommand: null,
    });
  }

  // ponytail: model-dependent SEAMS — NOT implemented here (no OCR, no fidelity).
  //   • on-image text quality + safe-area placement → #439 (OCR/text gate).
  //   • product / brand fidelity → `ralphy eval fidelity <id>` (#422), which
  //     reuses the same Finding/score machinery against the locked product refs.
  // The agent runs those gates as separate steps in the documented chain
  // (docs/playbooks/modes/image-pack.md); the rubric stays deterministic.

  return {
    project: projectId,
    kind: spec.kind,
    expectedSlots: spec.slots.length,
    coveredSlots,
    selectedCount,
    findings,
    scoring: score(findings),
  };
}
