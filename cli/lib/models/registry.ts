// Curated model registry (#574): MODELS.md index + docs/models/<kind>.md detail.
//
// One source of truth, two layers:
//   • MODELS.md — the short index. One table row per model under a `## <Kind>`
//     heading: `| \`<id>\` | <role> | <price> |`. Role and price live ONLY here.
//   • docs/models/<kind>.md — per-model detail. Each model has a
//     `## \`<id>\`` section; every other `## ` section is a SHARED note for the
//     kind (routing rules, policies, cross-model lessons). Detail lives ONLY here.
//
// `ralphy models show <id>` merges the index row, the model's section, and every
// shared-note item (list item, table row, paragraph) in ANY detail file that
// names the id — so a cross-model rule is written once and still reaches each
// model it mentions. Agents call the verb instead of reading the 40k-char file
// (the #562 baseline measured 35 whole-file reads of the pre-split MODELS.md).
//
// The Markdown is embedded with text imports so a compiled standalone binary
// carries the registry without a checkout. A new detail file must be added to
// DETAIL_DOCS below; tests/unit/models-registry.test.ts fails when a file under
// docs/models/ is not embedded, or when the index and the sections disagree.

import indexMd from "../../../MODELS.md" with { type: "text" };
import imageMd from "../../../docs/models/image.md" with { type: "text" };
import videoMd from "../../../docs/models/video.md" with { type: "text" };
import voiceoverMd from "../../../docs/models/voiceover.md" with { type: "text" };
import musicMd from "../../../docs/models/music.md" with { type: "text" };
import transcriptionMd from "../../../docs/models/transcription.md" with { type: "text" };
import llmMd from "../../../docs/models/llm.md" with { type: "text" };
import droppedMd from "../../../docs/models/dropped.md" with { type: "text" };
import { lookupAlias, aliasesFor, retiredIdsFor } from "../model-aliases.js";

export const MODEL_KINDS = ["image", "video", "voiceover", "music", "transcription", "llm"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export const INDEX_PATH = "MODELS.md";
export const DROPPED_PATH = "docs/models/dropped.md";

/** Every embedded detail document, keyed by repo-relative path. */
export const DETAIL_DOCS: Readonly<Record<string, string>> = {
  "docs/models/image.md": imageMd,
  "docs/models/video.md": videoMd,
  "docs/models/voiceover.md": voiceoverMd,
  "docs/models/music.md": musicMd,
  "docs/models/transcription.md": transcriptionMd,
  "docs/models/llm.md": llmMd,
  [DROPPED_PATH]: droppedMd,
};

export function detailPathForKind(kind: ModelKind): string {
  return `docs/models/${kind}.md`;
}

export interface RegistryRow {
  id: string;
  kind: ModelKind;
  role: string;
  price: string;
  /** Repo-relative path of the detail document holding this model's section. */
  source: string;
}

export interface RelatedNote {
  /** `<file> › <section>` the item came from. */
  from: string;
  text: string;
}

export interface RegistryEntry extends RegistryRow {
  aliases: string[];
  /** The model's own `## \`<id>\`` section body (Markdown), or null when the index row has none. */
  detail: string | null;
  /** Shared-note items in any detail document that name this model. */
  related: RelatedNote[];
}

export interface DroppedEntry {
  id: string;
  status: "dropped";
  source: string;
  mentions: RelatedNote[];
}

interface Section {
  heading: string;
  /** Model id when the heading is `\`<id>\``, else null (a shared note). */
  modelId: string | null;
  body: string;
}

const KIND_HEADINGS: Array<[RegExp, ModelKind]> = [
  [/^image\b/i, "image"],
  [/^video\b/i, "video"],
  [/^voice\s*over\b|^voiceover\b|^tts\b/i, "voiceover"],
  [/^music\b/i, "music"],
  [/^(audio\s+)?transcription\b|^captions?\b/i, "transcription"],
  [/^llm\b/i, "llm"],
];

function kindForHeading(heading: string): ModelKind | null {
  for (const [re, kind] of KIND_HEADINGS) if (re.test(heading.trim())) return kind;
  return null;
}

function stripMarkdown(cell: string): string {
  return cell.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function firstBacktickToken(cell: string): string | null {
  const m = cell.match(/`([^`]+)`/);
  return m ? m[1]!.trim() : null;
}

/** Parse the MODELS.md index: one row per model under a `## <Kind>` heading. */
export function parseIndex(md: string = indexMd): RegistryRow[] {
  const rows: RegistryRow[] = [];
  let kind: ModelKind | null = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      kind = kindForHeading(h[1]!);
      continue;
    }
    if (!kind || !line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    if (/^-+$/.test(cells[0]!.replace(/:/g, ""))) continue; // separator row
    const id = firstBacktickToken(cells[0]!);
    if (!id) continue; // header row
    rows.push({
      id,
      kind,
      role: stripMarkdown(cells[1]!),
      price: stripMarkdown(cells[2]!),
      source: detailPathForKind(kind),
    });
  }
  return rows;
}

/** Split a detail document into its `## ` sections (the H1 preamble is dropped). */
export function parseSections(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (h) {
      if (current) sections.push(current);
      const heading = h[1]!;
      const modelId = /^`[^`]+`$/.test(heading) ? heading.slice(1, -1).trim() : null;
      current = { heading, modelId, body: "" };
      continue;
    }
    if (current) current.body += line + "\n";
  }
  if (current) sections.push(current);
  for (const s of sections) s.body = s.body.trim();
  return sections;
}

/**
 * Split a shared-note body into self-contained items: each top-level list item
 * (with its indented continuation), each table row (prefixed by its header
 * row), and each other paragraph. `###` sub-headings are context, not items.
 */
export function splitItems(body: string): Array<{ subheading: string | null; text: string }> {
  const items: Array<{ subheading: string | null; text: string }> = [];
  let sub: string | null = null;
  let buf: string[] = [];
  let tableHeader: string | null = null;
  let inFence = false;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) items.push({ subheading: sub, text });
    buf = [];
  };
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      buf.push(line);
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    const h3 = line.match(/^#{3,6}\s+(.+?)\s*$/);
    if (h3) {
      flush();
      tableHeader = null;
      sub = h3[1]!;
      continue;
    }
    if (line.trim() === "") {
      flush();
      tableHeader = null;
      continue;
    }
    if (line.trim().startsWith("|")) {
      if (buf.length > 0 && !buf[buf.length - 1]!.trim().startsWith("|")) flush();
      const cells = splitRow(line);
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator
      if (tableHeader === null) {
        tableHeader = line.trim();
        continue;
      }
      items.push({ subheading: sub, text: `${tableHeader}\n${line.trim()}` });
      continue;
    }
    tableHeader = null;
    const isTopLevelItem = /^([-*+]|\d+[a-z]?\.)\s/.test(line);
    if (isTopLevelItem) flush();
    buf.push(line);
  }
  flush();
  return items;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The id strings a mention may use: the full id, the bare ElevenLabs model id,
 * and any retired id that redirects to it (#592: notes written about
 * `google/gemini-3-pro-image-preview` still reach `google/gemini-3-pro-image`).
 */
function mentionIds(id: string): string[] {
  const ids = [id, ...retiredIdsFor(id)];
  if (id.startsWith("elevenlabs/")) ids.push(id.slice("elevenlabs/".length));
  return ids;
}

/** Does `text` name `id` in code font (`id`, `id --flag`, `provider:id`)? */
export function mentionsModel(text: string, id: string): boolean {
  return mentionIds(id).some((m) => new RegExp("[`:]" + escapeRe(m) + "[`\\s]").test(text));
}

function fileLabel(source: string): string {
  return source.replace(/^docs\/models\//, "");
}

let _sections: Map<string, Section[]> | null = null;
function allSections(): Map<string, Section[]> {
  if (!_sections) {
    _sections = new Map();
    for (const [p, md] of Object.entries(DETAIL_DOCS)) _sections.set(p, parseSections(md));
  }
  return _sections;
}

/** Every model id that has its own `## \`<id>\`` section, with the file it lives in. */
export function detailModelIds(): Array<{ id: string; source: string }> {
  const out: Array<{ id: string; source: string }> = [];
  for (const [source, sections] of allSections()) {
    for (const s of sections) if (s.modelId) out.push({ id: s.modelId, source });
  }
  return out;
}

/** Shared-note items (all detail documents) that name `id`. */
export function relatedNotes(id: string): RelatedNote[] {
  const notes: RelatedNote[] = [];
  for (const [source, sections] of allSections()) {
    for (const s of sections) {
      if (s.modelId) continue;
      for (const item of splitItems(s.body)) {
        if (!mentionsModel(item.text, id)) continue;
        const where = [fileLabel(source), s.heading, item.subheading].filter(Boolean).join(" › ");
        notes.push({ from: where, text: item.text });
      }
    }
  }
  return notes;
}

/** The kind-wide shared notes of one detail document, as Markdown. */
export function kindNotes(kind: ModelKind): string {
  const sections = allSections().get(detailPathForKind(kind)) ?? [];
  return sections
    .filter((s) => !s.modelId)
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join("\n\n");
}

export function listRegistry(opts: { kind?: ModelKind } = {}): RegistryRow[] {
  const rows = parseIndex();
  return opts.kind ? rows.filter((r) => r.kind === opts.kind) : rows;
}

/**
 * Resolve a query to an index row: exact id (case-insensitive), then the alias
 * map (`kling`, `nano banana pro`), then a unique bare-name match
 * (`eleven_v3` → `elevenlabs/eleven_v3`, `kling-v3.0-pro` → `kwaivgi/kling-v3.0-pro`).
 */
export function resolveRegistryId(query: string): string | null {
  const rows = parseIndex();
  const q = query.trim().toLowerCase();
  const exact = rows.find((r) => r.id.toLowerCase() === q);
  if (exact) return exact.id;
  const { canonical } = lookupAlias(query);
  if (canonical) {
    const viaAlias = rows.find((r) => r.id === canonical);
    if (viaAlias) return viaAlias.id;
  }
  const bare = rows.filter((r) => r.id.toLowerCase().endsWith("/" + q));
  if (bare.length === 1) return bare[0]!.id;
  return null;
}

export function findRegistryEntry(query: string): RegistryEntry | null {
  const id = resolveRegistryId(query);
  if (!id) return null;
  const row = parseIndex().find((r) => r.id === id)!;
  const section = (allSections().get(row.source) ?? []).find((s) => s.modelId === id);
  return {
    ...row,
    aliases: aliasesFor(id),
    detail: section ? section.body : null,
    related: relatedNotes(id),
  };
}

/** Answer a lookup for a dropped / out-of-scope id from docs/models/dropped.md. */
export function findDroppedEntry(query: string): DroppedEntry | null {
  const q = query.trim();
  if (!q) return null;
  const sections = allSections().get(DROPPED_PATH) ?? [];
  const mentions: RelatedNote[] = [];
  for (const s of sections) {
    for (const item of splitItems(s.body)) {
      if (!mentionsModel(item.text, q)) continue;
      mentions.push({ from: [fileLabel(DROPPED_PATH), s.heading, item.subheading].filter(Boolean).join(" › "), text: item.text });
    }
  }
  return mentions.length > 0 ? { id: q, status: "dropped", source: DROPPED_PATH, mentions } : null;
}
