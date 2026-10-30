// `ralphy stock pull` (#596): download a stock candidate and register it as an
// Artifact revision with license provenance, plus a copy in the Project tree.
//
// Per candidate id:
//   1. Re-resolve the id at its source (`lookup`): the license, author and
//      media URL recorded are what the source says now, not what an agent
//      copied from an earlier search.
//   2. Refuse an item that does not allow commercial use and modification
//      unless the caller passed `--license any`.
//   3. Run kind `stock.pull`, Attempt provider = the source id, cost 0
//      (free sources, no generation), the download as the Run temp file.
//   4. completeArtifactRun: a NEW revision in the slot (earlier revisions are
//      immutable) whose metadata carries the provenance: source, page URL,
//      media URL, license + URL, author, attribution, the license flags, and
//      the Project tree path. Usage role `overlay` ties it to the Project.
//   5. The same bytes are written to `<project>/artifacts/<folder>/<slot><ext>`
//      for `index.html` (see stockFolder). Never overwritten: identical bytes
//      reuse the file, different bytes get the next free `<slot>.v<N><ext>`.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../errors/domain.js";
import { ralphDir } from "../paths.js";
import { addArtifactUsage } from "../store/artifacts.js";
import {
  completeArtifactRun,
  finishRun,
  finishRunAttempt,
  projectRunFailure,
  startRun,
  startRunAttempt,
} from "../store/runs.js";
import { allowsCommercialEdit, passesLicenseFilter } from "./license.js";
import { StockSourceError, stockDownload } from "./http.js";
import { artifactKindFor, sniffStockMedia, stockFolder, type StockArtifactKind } from "./media.js";
import { STOCK_CONNECTORS, stockSourceOf } from "./sources.js";
import type { FetchLike, StockCandidate, StockLicenseFilter, StockSourceId } from "./types.js";

export const STOCK_SLOT = /^[a-z0-9][a-z0-9-]{0,79}$/;

const MAX_BYTES: Record<StockArtifactKind, number> = {
  image: 40 * 1024 * 1024,
  audio: 80 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};
const TIMEOUT_MS: Record<StockArtifactKind, number> = { image: 120_000, audio: 180_000, video: 600_000 };

export type StockPullProject = {
  /** Store Project id. */
  id: string;
  /** The Project tree (`.ralphy/workspaces/<ws>/projects/<name>`). */
  dir: string;
};

export type StockPullResult = {
  id: string;
  source: StockSourceId;
  kind: StockArtifactKind;
  title: string;
  slot: string;
  /** Project-relative path of the tree copy (`artifacts/images/<slot>.jpg`). */
  path: string;
  /** `write`: a new file; `reuse`: that path already held these bytes. */
  fileAction: "write" | "reuse";
  artifactId: string;
  revisionId: string;
  revisionNo: number;
  runId: string;
  mime: string;
  bytes: number;
  sha256: string;
  license: string;
  licenseUrl: string | null;
  author: string | null;
  attribution: string;
  attributionRequired: boolean;
  commercialOk: boolean;
  notes: string[];
  costUsd: 0;
};

export type StockPullPlan = {
  dryRun: true;
  id: string;
  source: StockSourceId;
  kind: StockArtifactKind;
  title: string;
  slot: string;
  folder: string;
  mediaUrl: string;
  pageUrl: string;
  license: string;
  licenseUrl: string | null;
  attribution: string;
  attributionRequired: boolean;
  commercialOk: boolean;
  modificationOk: boolean;
};

/** Lowercase kebab-case, ASCII only. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The slot a candidate is stored in when `--slot` is not given: `logo-<slug>`
 * for Simple Icons, else `stock-<title>-<6 hex of the id>`, so pulling the same
 * id again appends a revision while two items with the same title never share
 * a slot.
 */
export function defaultStockSlot(candidate: Pick<StockCandidate, "id" | "source" | "title" | "kind">): string {
  if (candidate.source === "simple-icons") {
    return `logo-${slugify(candidate.id.replace(/^simple-icons:/, "")).slice(0, 60) || "brand"}`;
  }
  const title = slugify(candidate.title).slice(0, 48).replace(/-+$/, "") || candidate.kind;
  const hash = createHash("sha256").update(candidate.id).digest("hex").slice(0, 6);
  return `stock-${title}-${hash}`;
}

/** The connector for a candidate id, or a DomainError naming the valid prefixes. */
export function connectorForId(candidateId: string) {
  const source = stockSourceOf(candidateId);
  if (!source) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "id",
      detail: `'${candidateId.slice(0, 120)}' is not a stock candidate id; ids start with ${Object.keys(STOCK_CONNECTORS).map((s) => `${s}:`).join(", ")} (copy one from \`ralphy stock search\`)`,
      verb: "stock pull",
    });
  }
  return STOCK_CONNECTORS[source];
}

async function sha256File(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await fs.readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

/** The first `<base><ext>`, `<base>.v2<ext>`, ... that is free or already holds `sha`. */
export async function placeStockFile(dir: string, base: string, ext: string, sha: string): Promise<{ name: string; action: "write" | "reuse" }> {
  for (let n = 1; n < 10_000; n += 1) {
    const name = n === 1 ? `${base}${ext}` : `${base}.v${n}${ext}`;
    const have = await sha256File(path.join(dir, name));
    if (have === null) return { name, action: "write" };
    if (have === sha) return { name, action: "reuse" };
  }
  throw new Error(`too many versions of ${base}${ext} in ${dir}`);
}

async function resolveCandidate(candidateId: string, fetchImpl: FetchLike) {
  const connector = connectorForId(candidateId);
  if (connector.unavailableNote()) {
    throw new DomainError("E_ENV_KEY_MISSING", undefined, { key: connector.requiredKey ?? connector.id });
  }
  return { connector, candidate: await connector.lookup(candidateId, fetchImpl) };
}

function checkLicense(candidate: StockCandidate, license: StockLicenseFilter): void {
  if (passesLicenseFilter(candidate, license)) return;
  if (allowsCommercialEdit(candidate)) {
    // Only `open` refuses an item that allows commercial edits: it is ShareAlike.
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "license",
      detail: `${candidate.id} is ${candidate.license}, a ShareAlike license: a video built on it must be shared under the same terms; pass --license commercial to accept that`,
      verb: "stock pull",
    });
  }
  const missing = [!candidate.commercialOk ? "commercial use" : null, !candidate.modificationOk ? "modification" : null].filter(Boolean).join(" or ");
  throw new DomainError("E_INPUT_INVALID", undefined, {
    field: "license",
    detail: `${candidate.id} is ${candidate.license}, which does not allow ${missing}; pass --license any to pull it for non-commercial, unedited use`,
    verb: "stock pull",
  });
}

function checkSlot(slot: string): string {
  if (!STOCK_SLOT.test(slot)) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "slot",
      detail: `'${slot.slice(0, 80)}' must be lowercase kebab-case [a-z0-9-], at most 80 characters`,
      verb: "stock pull",
    });
  }
  return slot;
}

/** Resolve a candidate and report what a pull would do, without downloading or recording anything. */
export async function planStockPull(input: { candidateId: string; slot?: string; license: StockLicenseFilter; fetchImpl: FetchLike }): Promise<StockPullPlan> {
  const { candidate } = await resolveCandidate(input.candidateId, input.fetchImpl);
  checkLicense(candidate, input.license);
  const kind = artifactKindFor(candidate.kind);
  return {
    dryRun: true,
    id: candidate.id,
    source: candidate.source,
    kind,
    title: candidate.title,
    slot: checkSlot(input.slot ?? defaultStockSlot(candidate)),
    folder: `artifacts/${stockFolder(kind, { category: candidate.extra.category, durationSec: candidate.durationSec })}/`,
    mediaUrl: candidate.mediaUrl,
    pageUrl: candidate.pageUrl,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    attribution: candidate.attribution,
    attributionRequired: candidate.attributionRequired,
    commercialOk: candidate.commercialOk,
    modificationOk: candidate.modificationOk,
  };
}

/** Pull one candidate into the Project. Throws DomainError / StockSourceError; a failed Run is recorded as failed. */
export async function pullStockItem(input: {
  project: StockPullProject;
  candidateId: string;
  slot?: string;
  license: StockLicenseFilter;
  fetchImpl: FetchLike;
}): Promise<StockPullResult> {
  const { connector, candidate } = await resolveCandidate(input.candidateId, input.fetchImpl);
  checkLicense(candidate, input.license);
  const slot = checkSlot(input.slot ?? defaultStockSlot(candidate));
  const kind = artifactKindFor(candidate.kind);

  const run = startRun({
    projectId: input.project.id,
    kind: "stock.pull",
    label: slot,
    metadata: { operation: "stock", source: candidate.source, candidateId: candidate.id },
  });
  const attempt = startRunAttempt({
    runId: run.id,
    provider: candidate.source,
    model: null,
    request: { candidateId: candidate.id, mediaUrl: candidate.mediaUrl, pageUrl: candidate.pageUrl },
  });

  let staged: { tempPath: string; ext: string; mime: string; bytes: Uint8Array; sha: string; folder: string; placed: { name: string; action: "write" | "reuse" } };
  try {
    const limits = { maxBytes: MAX_BYTES[kind], timeoutMs: TIMEOUT_MS[kind] };
    const download = connector.download
      ? await connector.download(candidate, input.fetchImpl, limits)
      : await stockDownload(connector.label, candidate.mediaUrl, input.fetchImpl, limits);
    const media = sniffStockMedia(download.bytes, candidate.kind);
    if (!media || media.artifactKind !== kind) {
      throw new StockSourceError(connector.label, 0, `${connector.label}: ${candidate.id} did not download as ${kind} (${download.contentType ?? "unknown content type"}, ${download.bytes.byteLength} bytes)`);
    }
    const sha = createHash("sha256").update(download.bytes).digest("hex");
    const folder = stockFolder(kind, { category: candidate.extra.category, durationSec: candidate.durationSec });
    const placed = await placeStockFile(path.join(input.project.dir, "artifacts", folder), slot, media.extension, sha);
    const tempPath = path.join(ralphDir(), "tmp", run.id, `${slot}${media.extension}`);
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    await fs.writeFile(tempPath, download.bytes, { flag: "wx" });
    staged = { tempPath, ext: media.extension, mime: media.mime, bytes: download.bytes, sha, folder, placed };
  } catch (error) {
    const projected = projectRunFailure(error, { provider: candidate.source, ...(error instanceof StockSourceError && error.status > 0 ? { status: error.status } : {}) });
    finishRunAttempt(attempt.id, { state: "failed", error: projected });
    finishRun(run.id, { state: "failed", error: projected });
    throw error;
  }

  const projectPath = `artifacts/${staged.folder}/${staged.placed.name}`;
  const provenance = {
    operation: "stock",
    source: candidate.source,
    candidateId: candidate.id,
    title: candidate.title,
    pageUrl: candidate.pageUrl,
    mediaUrl: candidate.mediaUrl,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    author: candidate.author,
    authorUrl: candidate.authorUrl,
    attribution: candidate.attribution,
    commercialOk: candidate.commercialOk,
    modificationOk: candidate.modificationOk,
    attributionRequired: candidate.attributionRequired,
    shareAlike: candidate.shareAlike,
    notes: candidate.notes,
    projectPath,
    sha256: staged.sha,
  };
  const completed = await completeArtifactRun({
    runId: run.id,
    attemptId: attempt.id,
    finishedPath: staged.tempPath,
    originalName: `${slot}${staged.ext}`,
    mime: staged.mime,
    artifact: { slug: slot, kind, state: "candidate", metadata: provenance },
    objectMetadata: { provider: candidate.source, operation: "stock", candidateId: candidate.id, license: candidate.license },
    response: { candidateId: candidate.id, mime: staged.mime, bytes: staged.bytes.byteLength, sha256: staged.sha },
    costUsd: 0,
  });
  addArtifactUsage({ artifactRevisionId: completed.revision.id, projectId: input.project.id, role: "overlay" });

  if (staged.placed.action === "write") {
    const dest = path.join(input.project.dir, projectPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // "wx": the tree copy never replaces an existing file.
    await fs.writeFile(dest, staged.bytes, { flag: "wx" });
  }

  return {
    id: candidate.id,
    source: candidate.source,
    kind,
    title: candidate.title,
    slot,
    path: projectPath,
    fileAction: staged.placed.action,
    artifactId: completed.artifact.id,
    revisionId: completed.revision.id,
    revisionNo: completed.revision.revisionNo,
    runId: completed.run.id,
    mime: staged.mime,
    bytes: staged.bytes.byteLength,
    sha256: staged.sha,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    author: candidate.author,
    attribution: candidate.attribution,
    attributionRequired: candidate.attributionRequired,
    commercialOk: candidate.commercialOk,
    notes: candidate.notes,
    costUsd: 0,
  };
}
