// Decision ledger (#558) — per Unit, the production choices that made it:
// format, template, style, content mode, hook type, angle, structure, scene
// count, transitions, motion elements, caption preset, layout, aspect, models,
// duration / length band, variant axis. Joined to measured outcomes by
// `ralphy analytics report`, so the agent can see which choices over- or
// under-perform instead of repeating work that does not land.
//
// DERIVATION (deterministic, no model calls): `deriveDecisions()` reads the
// artifacts the pipeline already writes — the store Unit, the bound
// production-plan / scenario Documents, Run Attempt models, and (for projects
// with an on-disk working tree) production-plan.json, scenario.json,
// prompts.json, asset-manifest.json, the gen-log, the legacy unit manifest,
// and the HyperFrames composition. Every derived value records its source.
// Nothing is guessed: a choice with no evidence is simply absent, and the
// agent fills it with `ralphy unit decisions <unit> --set key=value`.
//
// STORAGE: one JSON Document per Unit (kind `custom`, slug
// `decision-ledger-<unit-slug>`) in the Unit's own scope. Revisions are
// append-only, so every --set / --derive leaves the prior ledger intact, and
// portable workspace export carries it with no extra wiring.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createDocument, reviseDocument } from "../store/documents.js";
import { getDocumentContent, listProjectDocumentBindings } from "../store/document-content.js";
import {
  DECISION_LEDGER_BODY_KIND,
  DECISION_LEDGER_DOCUMENT_KIND,
  decisionLedgerSlug,
  findUnitLedgerDocument,
  listProjectAttemptModels,
  type UnitLocationDto,
} from "../store/outcomes.js";
import type { QueryContext } from "../store/scope-context.js";
import type { JsonValue } from "../store/types.js";
import { normalizeGenerationEntry, type RawGenerationEntry } from "../gen-log.js";
import { lengthBand } from "../selection.js";
import { projectDir } from "../paths.js";
import { MetricParseError, parseSeconds } from "./metric-parse.js";

// ─── fields ──────────────────────────────────────────────────────────────────

export type LedgerValue = string | number | string[];

/** The derived ledger fields, in display order. `multi` fields hold sets. */
export const LEDGER_FIELDS = [
  { key: "format", type: "label" },
  { key: "template", type: "label" },
  { key: "style", type: "label" },
  { key: "content_mode", type: "label" },
  { key: "hook_type", type: "label" },
  { key: "angle", type: "label" },
  { key: "structure", type: "label" },
  { key: "scene_count", type: "number" },
  { key: "transitions", type: "multi" },
  { key: "motion_elements", type: "multi" },
  { key: "caption_preset", type: "label" },
  { key: "layout", type: "label" },
  { key: "aspect", type: "label" },
  { key: "models", type: "multi" },
  { key: "duration_sec", type: "number" },
  { key: "length_band", type: "label" },
  { key: "variant_axis", type: "label" },
] as const;

export type LedgerFieldKey = (typeof LEDGER_FIELDS)[number]["key"];
const FIELD_TYPE = new Map<string, "label" | "number" | "multi">(
  LEDGER_FIELDS.map((field) => [field.key, field.type]),
);

export interface DerivedDecision {
  value: LedgerValue;
  /** Where the value came from, e.g. `project:scenario.json#hook text (heuristic)`. */
  source: string;
}

export type DerivedDecisions = Record<string, DerivedDecision>;
/** Manual entries; `null` suppresses a derived value. */
export type ManualDecisions = Record<string, LedgerValue | null>;

export const DecisionLedgerBodySchema = z.object({
  kind: z.literal(DECISION_LEDGER_BODY_KIND),
  version: z.literal(1),
  unitId: z.string(),
  unitSlug: z.string(),
  projectId: z.string().nullable(),
  derived: z.record(
    z.string(),
    z.object({
      value: z.union([z.string(), z.number(), z.array(z.string())]),
      source: z.string(),
    }),
  ),
  manual: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
  derivedFrom: z.array(z.string()),
  derivedAt: z.string(),
  updatedAt: z.string(),
});
export type DecisionLedgerBody = z.infer<typeof DecisionLedgerBodySchema>;

// ─── sources ─────────────────────────────────────────────────────────────────

type SourceKey =
  | "unit"
  | "unitManifest"
  | "plan"
  | "scenario"
  | "prompts"
  | "assetManifest"
  | "generations"
  | "composition"
  | "compositionBlocks"
  | "attemptModels";

/** Parsed inputs for `deriveDecisions`; every field optional (tolerant reads). */
export interface LedgerSources {
  unit?: { format?: string | null; slug?: string | null };
  unitManifest?: unknown;
  plan?: unknown;
  scenario?: unknown;
  prompts?: unknown;
  assetManifest?: unknown;
  generations?: unknown[];
  composition?: string | null;
  compositionBlocks?: string[];
  attemptModels?: string[];
  /** Source labels; defaults name the conventional project file. */
  origins?: Partial<Record<SourceKey, string>>;
}

const DEFAULT_ORIGINS: Record<SourceKey, string> = {
  unit: "store:unit",
  unitManifest: "project:unit-manifest",
  plan: "project:production-plan.json",
  scenario: "project:scenario.json",
  prompts: "project:prompts.json",
  assetManifest: "project:asset-manifest.json",
  generations: "project:gen-log",
  composition: "project:index.html",
  compositionBlocks: "project:compositions/",
  attemptModels: "store:run-attempts",
};

const MEDIA_KINDS = new Set(["image", "video", "audio", "music", "voiceover", "sfx"]);
const MAX_LABEL = 120;

// ─── pure derivation ─────────────────────────────────────────────────────────

/**
 * Derive the ledger from parsed artifacts. Pure + deterministic: the first
 * source that carries a field wins (store Unit → unit manifest → plan →
 * scenario → composition), set-valued fields take the union, and a value
 * inferred by a heuristic says so in its `source`.
 */
export function deriveDecisions(sources: LedgerSources): DerivedDecisions {
  const origin = (key: SourceKey) => sources.origins?.[key] ?? DEFAULT_ORIGINS[key];
  const out: DerivedDecisions = {};
  const setLabel = (key: string, candidates: Array<[unknown, string]>) => {
    for (const [value, source] of candidates) {
      const label = normalizeLabel(value);
      if (label) {
        out[key] = { value: label, source };
        return;
      }
    }
  };
  const manifest = asRecord(sources.unitManifest);
  const provenance = asRecord(manifest?.provenance);
  const selection = asRecord(provenance?.selection);
  const plan = asRecord(sources.plan);
  const scenario = asRecord(sources.scenario);
  const composition = typeof sources.composition === "string" ? sources.composition : "";
  const scenes = scenarioScenes(scenario);

  setLabel("format", [
    [sources.unit?.format, `${origin("unit")}#format`],
    [manifest?.format, `${origin("unitManifest")}#format`],
    [asRecord(plan?.formatTemplate)?.format, `${origin("plan")}#formatTemplate.format`],
  ]);
  setLabel("template", [
    [provenance?.template, `${origin("unitManifest")}#provenance.template`],
    [asRecord(plan?.formatTemplate)?.templateSlug, `${origin("plan")}#formatTemplate.templateSlug`],
    [scenario?.template, `${origin("scenario")}#template`],
  ]);
  setLabel("style", [[provenance?.style, `${origin("unitManifest")}#provenance.style`]]);
  setLabel("content_mode", [
    [asRecord(plan?.contentMode)?.mode, `${origin("plan")}#contentMode.mode`],
    [scenario?.content_mode, `${origin("scenario")}#content_mode`],
    [scenario?.contentMode, `${origin("scenario")}#contentMode`],
  ]);

  const hook = scenario?.hook;
  const hookRecord = asRecord(hook);
  setLabel("hook_type", [
    [selection?.hookType, `${origin("unitManifest")}#provenance.selection.hookType`],
    [scenario?.hook_type, `${origin("scenario")}#hook_type`],
    [scenario?.hookType, `${origin("scenario")}#hookType`],
    [hookRecord?.type, `${origin("scenario")}#hook.type`],
  ]);
  if (!out.hook_type) {
    const hookText = firstText(
      hookRecord?.vo,
      hookRecord?.primary,
      hookRecord?.text,
      typeof hook === "string" ? hook : undefined,
      scenes.find((scene) => scene.role === "hook")?.vo_text,
    );
    const classified = hookText ? classifyHookText(hookText) : null;
    if (classified) out.hook_type = { value: classified, source: `${origin("scenario")}#hook text (heuristic)` };
  }
  setLabel("angle", [
    [scenario?.angle, `${origin("scenario")}#angle`],
    [selection?.angle, `${origin("unitManifest")}#provenance.selection.angle`],
  ]);

  const structure = scenarioStructure(scenario, scenes);
  setLabel("structure", [
    [scenario?.structure, `${origin("scenario")}#structure`],
    [structure, `${origin("scenario")}#hook/body/cta shape`],
  ]);
  const sceneCount = scenes.length > 0 ? scenes.length : structureSceneCount(scenario);
  if (sceneCount > 0) out.scene_count = { value: sceneCount, source: `${origin("scenario")}#scenes` };

  const transitions = new Set<string>();
  const transitionSources = new Set<string>();
  for (const value of labelList(scenario?.transitions)) {
    transitions.add(value);
    transitionSources.add(`${origin("scenario")}#transitions`);
  }
  for (const scene of scenes) {
    for (const value of labelList(scene.transition ?? asRecord(scene.transition)?.type)) {
      transitions.add(value);
      transitionSources.add(`${origin("scenario")}#scenes[].transition`);
    }
  }
  for (const value of attributeValues(composition, ["data-transition", "data-hf-transition"])) {
    transitions.add(value);
    transitionSources.add(`${origin("composition")}#data-transition`);
  }
  if (transitions.size > 0) {
    out.transitions = { value: [...transitions].sort(), source: [...transitionSources].join(" + ") };
  }

  const motion = new Set<string>();
  const motionSources = new Set<string>();
  for (const value of [...labelList(scenario?.motion_elements), ...labelList(scenario?.motionElements)]) {
    motion.add(value);
    motionSources.add(`${origin("scenario")}#motion_elements`);
  }
  for (const scene of scenes) {
    for (const value of [...labelList(scene.motion_elements), ...labelList(scene.motion_element)]) {
      motion.add(value);
      motionSources.add(`${origin("scenario")}#scenes[].motion_elements`);
    }
  }
  for (const value of attributeValues(composition, ["data-motion", "data-motion-element"])) {
    motion.add(value);
    motionSources.add(`${origin("composition")}#data-motion`);
  }
  for (const value of (sources.compositionBlocks ?? []).map(normalizeLabel).filter(isString)) {
    motion.add(value);
    motionSources.add(origin("compositionBlocks"));
  }
  if (motion.size > 0) out.motion_elements = { value: [...motion].sort(), source: [...motionSources].join(" + ") };

  const captions = asRecord(scenario?.captions);
  setLabel("caption_preset", [
    [scenario?.captionPreset, `${origin("scenario")}#captionPreset`],
    [scenario?.caption_preset, `${origin("scenario")}#caption_preset`],
    [scenario?.captionStyle, `${origin("scenario")}#captionStyle`],
    [scenario?.caption_style, `${origin("scenario")}#caption_style`],
    [captions?.preset, `${origin("scenario")}#captions.preset`],
    [captions?.style, `${origin("scenario")}#captions.style`],
    [attributeValues(composition, ["data-caption-preset", "data-caption-style"])[0], `${origin("composition")}#data-caption-preset`],
  ]);
  setLabel("layout", [
    [scenario?.layout, `${origin("scenario")}#layout`],
    [scenario?.editLayout, `${origin("scenario")}#editLayout`],
    [scenario?.edit_layout, `${origin("scenario")}#edit_layout`],
    [attributeValues(composition, ["data-layout"])[0], `${origin("composition")}#data-layout`],
  ]);
  const mediaAspect = Object.values(asRecord(manifest?.media_meta) ?? {})
    .map((entry) => asRecord(entry)?.aspect)
    .find((value) => typeof value === "string");
  setLabel("aspect", [
    [normalizeAspect(plan?.aspect), `${origin("plan")}#aspect`],
    [normalizeAspect(scenario?.aspectRatio), `${origin("scenario")}#aspectRatio`],
    [normalizeAspect(scenario?.aspect), `${origin("scenario")}#aspect`],
    [normalizeAspect(mediaAspect), `${origin("unitManifest")}#media_meta.aspect`],
  ]);

  const models = collectModels(sources, origin);
  if (models) out.models = models;

  const duration = firstDuration([
    [scenario?.duration, `${origin("scenario")}#duration`],
    [scenario?.durationSec, `${origin("scenario")}#durationSec`],
    [scenario?.totalDurationSec, `${origin("scenario")}#totalDurationSec`],
    [scenario?.totalDuration, `${origin("scenario")}#totalDuration`],
    [asRecord(scenario?.format)?.durationSec, `${origin("scenario")}#format.durationSec`],
    [scenario?.target_duration_s, `${origin("scenario")}#target_duration_s`],
    [plan?.durationSec, `${origin("plan")}#durationSec`],
    [manifest?.durationSec ?? manifest?.duration, `${origin("unitManifest")}#durationSec`],
  ]);
  if (duration) {
    out.duration_sec = duration;
    out.length_band = { value: lengthBand(duration.value as number, "seconds"), source: `${duration.source} (bucketed)` };
  }
  setLabel("variant_axis", [
    [scenario?.variant_axis, `${origin("scenario")}#variant_axis`],
    [scenario?.variantAxis, `${origin("scenario")}#variantAxis`],
    [manifest?.variant_axis, `${origin("unitManifest")}#variant_axis`],
  ]);
  return out;
}

/**
 * Deterministic hook-text classifier: the opener shape, from the hook line
 * alone. Coarse on purpose — the label must be stable across units so the
 * outcome table can group on it. Returns null for an empty hook.
 */
export function classifyHookText(text: string): string | null {
  const line = text.trim().toLowerCase().replace(/\s+/gu, " ");
  if (!line) return null;
  if (/^pov\b/u.test(line)) return "pov";
  if (/^(stop|don't|do not|never|quit|avoid|warning)\b/u.test(line) || /\bmistakes?\b/u.test(line)) return "warning";
  if (/\b(how to|here's how|here is how|step by step|tutorial)\b/u.test(line)) return "how-to";
  if (
    /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\b[^.?!]*\b(ways?|things|reasons|tips|signs|steps|possibilities|types|hacks|rules|secrets|lessons|facts)\b/u.test(line)
  ) return "listicle";
  if (/\?\s*$/u.test(line) || /^(why|how|what|who|when|where|which|did|do|does|is|are|can|would|should|have you|ever)\b/u.test(line)) {
    return "question";
  }
  if (/^(i|we) (tried|tested|spent|bought|asked|went|made)\b/u.test(line)) return "story";
  if (/\b(nobody|no one|you won't believe|the truth|secret|actually|turns out)\b/u.test(line)) return "curiosity";
  return "statement";
}

function collectModels(
  sources: LedgerSources,
  origin: (key: SourceKey) => string,
): DerivedDecision | null {
  const models = new Set<string>();
  const used = new Set<string>();
  for (const row of sources.generations ?? []) {
    if (!row || typeof row !== "object") continue;
    let entry;
    try {
      entry = normalizeGenerationEntry(row as RawGenerationEntry);
    } catch {
      continue;
    }
    if (entry.status !== "ok" || !MEDIA_KINDS.has(entry.kind) || entry.provider === "other") continue;
    const model = normalizeModel(entry.model);
    if (model) {
      models.add(model);
      used.add(origin("generations"));
    }
  }
  for (const value of sources.attemptModels ?? []) {
    const model = normalizeModel(value);
    if (model) {
      models.add(model);
      used.add(origin("attemptModels"));
    }
  }
  const slots = asRecord(asRecord(sources.assetManifest)?.slots);
  for (const slot of Object.values(slots ?? {})) {
    const model = normalizeModel(asRecord(slot)?.model);
    if (model) {
      models.add(model);
      used.add(origin("assetManifest"));
    }
  }
  const prompts = sources.prompts;
  const promptEntries = Array.isArray(prompts)
    ? prompts
    : Object.values(asRecord(asRecord(prompts)?.slots) ?? asRecord(prompts) ?? {});
  for (const entry of promptEntries) {
    const model = normalizeModel(asRecord(entry)?.model);
    if (model) {
      models.add(model);
      used.add(origin("prompts"));
    }
  }
  if (models.size > 0) return { value: [...models].sort(), source: [...used].join(" + ") };
  const planned = (Array.isArray(asRecord(sources.plan)?.modelStack) ? (asRecord(sources.plan)!.modelStack as unknown[]) : [])
    .map((entry) => normalizeModel(asRecord(entry)?.model))
    .filter(isString);
  if (planned.length > 0) {
    return { value: [...new Set(planned)].sort(), source: `${origin("plan")}#modelStack (planned, not observed)` };
  }
  return null;
}

/** Only provider/model ids count; local tools (ffmpeg, snapshots) are not models. */
function normalizeModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const model = value.trim().toLowerCase();
  if (!model || model.length > MAX_LABEL) return null;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/u.test(model) || model.startsWith("elevenlabs")
    ? model
    : null;
}

type SceneLike = Record<string, unknown> & { role?: unknown; vo_text?: unknown };

function scenarioScenes(scenario: Record<string, unknown> | null): SceneLike[] {
  const scenes = scenario?.scenes;
  if (Array.isArray(scenes)) return scenes.map(asRecord).filter(isRecord) as SceneLike[];
  const record = asRecord(scenes);
  if (!record) return [];
  // Some writers store a single scene object instead of a map.
  if (typeof record.id === "string" && ("role" in record || "vo_text" in record)) return [record as SceneLike];
  return Object.values(record).map(asRecord).filter(isRecord) as SceneLike[];
}

function scenarioStructure(scenario: Record<string, unknown> | null, scenes: SceneLike[]): string | null {
  if (!scenario) return null;
  const hasHook = scenario.hook != null || scenes.some((scene) => scene.role === "hook");
  const bodyCount = bodyLength(scenario) || scenes.filter((scene) => scene.role === "body").length;
  const hasCta = scenario.cta != null || scenes.some((scene) => scene.role === "cta");
  const parts = [hasHook && "hook", bodyCount > 0 && "body", hasCta && "cta"].filter(isString);
  return parts.length > 0 ? parts.join("-") : null;
}

function structureSceneCount(scenario: Record<string, unknown> | null): number {
  if (!scenario) return 0;
  return (scenario.hook != null ? 1 : 0) + bodyLength(scenario) + (scenario.cta != null ? 1 : 0);
}

function bodyLength(scenario: Record<string, unknown>): number {
  if (Array.isArray(scenario.body)) return scenario.body.length;
  return scenario.body != null && typeof scenario.body === "object" ? 1 : 0;
}

function firstDuration(candidates: Array<[unknown, string]>): DerivedDecision | null {
  for (const [value, source] of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return { value: Math.round(value * 100) / 100, source };
    }
  }
  return null;
}

/** "9:16", "1080 / 1920", "1080x1920" → "9:16". */
export function normalizeAspect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$/u.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return `${width}:${height}`;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

function attributeValues(html: string, attributes: string[]): string[] {
  if (!html) return [];
  const values = new Set<string>();
  for (const attribute of attributes) {
    const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']{1,${MAX_LABEL}})["']`, "giu");
    for (const match of html.matchAll(pattern)) {
      for (const part of match[1]!.split(/[\s,]+/u)) {
        const label = normalizeLabel(part);
        if (label) values.add(label);
      }
    }
  }
  return [...values].sort();
}

function labelList(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map(normalizeLabel).filter(isString);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeLabel(typeof entry === "string" ? entry : asRecord(entry)?.type ?? asRecord(entry)?.name))
    .filter(isString);
}

/** Trimmed, whitespace-collapsed, lowercase label (≤120 chars), or null. */
export function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim().replace(/\s+/gu, " ").toLowerCase();
  return label && label.length <= MAX_LABEL ? label : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> {
  return value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ─── manual entries ──────────────────────────────────────────────────────────

const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/u;

/** `hook-type` / `Hook_Type` → `hook_type`; throws on an invalid key. */
export function normalizeLedgerKey(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/-/gu, "_");
  if (!KEY_RE.test(key)) {
    throw new MetricParseError(`ledger key "${raw}" must be a short snake_case name (letters, digits, underscores)`);
  }
  return key;
}

/**
 * Parse one `--set key=value`. Known set fields and comma lists become sorted
 * label sets; `duration_sec` accepts "0:30" / "30s"; `scene_count` must be a
 * whole number; an empty value records an explicit "none" (suppresses the
 * derived value).
 */
export function parseLedgerAssignment(raw: string): { key: string; value: LedgerValue | null } {
  const index = raw.indexOf("=");
  if (index <= 0) throw new MetricParseError(`expected key=value (got "${raw}")`);
  const key = normalizeLedgerKey(raw.slice(0, index));
  const text = raw.slice(index + 1).trim();
  if (!text || text.toLowerCase() === "none") return { key, value: null };
  const type = FIELD_TYPE.get(key);
  if (type === "number") {
    const value = key === "duration_sec" ? parseSeconds(text) : Number(text);
    if (!Number.isFinite(value) || value < 0 || (key === "scene_count" && !Number.isInteger(value))) {
      throw new MetricParseError(`${key} must be a non-negative ${key === "scene_count" ? "whole number" : "number"}`);
    }
    return { key, value };
  }
  if (key === "models") {
    const models = text.split(",").map(normalizeModel).filter(isString);
    if (models.length === 0) throw new MetricParseError("models must be provider/model ids, comma-separated");
    return { key, value: [...new Set(models)].sort() };
  }
  if (type === "multi" || text.includes(",")) {
    const labels = [...new Set(text.split(",").map(normalizeLabel).filter(isString))].sort();
    if (labels.length === 0) throw new MetricParseError(`${key} needs at least one value`);
    return { key, value: labels };
  }
  const label = normalizeLabel(key === "aspect" ? normalizeAspect(text) ?? text : text);
  if (!label) throw new MetricParseError(`${key} value must be 1..${MAX_LABEL} characters`);
  return { key, value: label };
}

/** Derived values overlaid by manual ones; length_band follows the effective duration. */
export function effectiveDecisions(
  derived: DerivedDecisions,
  manual: ManualDecisions,
): Record<string, LedgerValue> {
  const out: Record<string, LedgerValue> = {};
  for (const [key, entry] of Object.entries(derived)) out[key] = entry.value;
  for (const [key, value] of Object.entries(manual)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  if (!Object.hasOwn(manual, "length_band")) {
    const duration = out.duration_sec;
    if (typeof duration === "number" && duration > 0) out.length_band = lengthBand(duration, "seconds");
    else if (Object.hasOwn(manual, "duration_sec")) delete out.length_band;
  }
  return out;
}

/** Ledger fields in display order (LEDGER_FIELDS first, custom keys after, alphabetically). */
export function orderLedgerKeys(keys: Iterable<string>): string[] {
  const order = new Map<string, number>(LEDGER_FIELDS.map((field, index) => [field.key, index]));
  return [...new Set(keys)].sort((a, b) =>
    (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
}

export function orderRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(orderLedgerKeys(Object.keys(record)).map((key) => [key, record[key]!]));
}

// ─── gathering (I/O) ─────────────────────────────────────────────────────────

export interface GatheredSources {
  sources: LedgerSources;
  /** Human-readable list of what was actually read. */
  derivedFrom: string[];
  /** The on-disk project directory used, when any. */
  projectDirectory: string | null;
}

/** Read the conventional project files from a working directory (tolerant). */
export function gatherFileSources(dir: string, unitSlug?: string): GatheredSources {
  const derivedFrom: string[] = [];
  const readJson = (relative: string): unknown => {
    const file = path.join(dir, relative);
    if (!fs.existsSync(file)) return undefined;
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      derivedFrom.push(`project:${relative}`);
      return value;
    } catch {
      return undefined;
    }
  };
  const sources: LedgerSources = { origins: {} };
  sources.plan = readJson("production-plan.json");
  sources.scenario = readJson("scenario.json");
  sources.prompts = readJson("prompts.json");
  sources.assetManifest = readJson("asset-manifest.json");
  if (unitSlug) {
    const relative = path.join("units", unitSlug, "unit.json");
    sources.unitManifest = readJson(relative);
    sources.origins!.unitManifest = `project:${relative}`;
  }
  const generations: unknown[] = [];
  for (const relative of [path.join("logs", "generations.jsonl"), "generations.jsonl"]) {
    const file = path.join(dir, relative);
    if (!fs.existsSync(file)) continue;
    let rows = 0;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        generations.push(JSON.parse(line));
        rows += 1;
      } catch {
        /* tolerate a malformed line */
      }
    }
    if (rows > 0) {
      derivedFrom.push(`project:${relative}`);
      sources.origins!.generations = `project:${relative}`;
    }
  }
  sources.generations = generations;
  const compositionFile = path.join(dir, "index.html");
  if (fs.existsSync(compositionFile)) {
    sources.composition = fs.readFileSync(compositionFile, "utf8");
    derivedFrom.push("project:index.html");
  }
  const compositionsDir = path.join(dir, "compositions");
  if (fs.existsSync(compositionsDir)) {
    sources.compositionBlocks = fs
      .readdirSync(compositionsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => entry.name.replace(/\.html$/u, ""))
      .filter((name) => !/^v\d+$/u.test(name) && !/storyboard|snapshot|draft|preview/u.test(name));
    if (sources.compositionBlocks.length > 0) derivedFrom.push("project:compositions/");
  }
  return { sources, derivedFrom, projectDirectory: dir };
}

/** Store-side sources: Unit format, bound plan/scenario Documents, Run Attempt models. */
export function gatherStoreSources(context: QueryContext, location: UnitLocationDto): GatheredSources {
  const derivedFrom = ["store:unit"];
  const sources: LedgerSources = {
    unit: { format: location.format, slug: location.slug },
    origins: {},
  };
  if (location.projectId) {
    const projectContext: QueryContext = context.sessionId !== undefined
      ? context
      : { workspaceId: location.workspaceId, projectId: location.projectId };
    try {
      let after: string | null = null;
      do {
        const page = listProjectDocumentBindings(projectContext, {
          projectId: location.projectId,
          after,
          limit: 100,
        });
        for (const binding of page.items) {
          if (binding.role !== "production-plan" && binding.role !== "scenario") continue;
          const body = readDocumentJson(projectContext, binding.currentHeadRevisionId ?? binding.boundRevisionId);
          if (body === undefined) continue;
          if (binding.role === "production-plan") {
            sources.plan = body;
            sources.origins!.plan = "store:document(production-plan)";
          } else {
            sources.scenario = body;
            sources.origins!.scenario = "store:document(scenario)";
          }
          derivedFrom.push(`store:document(${binding.role})`);
        }
        after = page.nextCursor;
      } while (after !== null);
    } catch {
      /* bindings are optional evidence */
    }
    try {
      const models = listProjectAttemptModels({ context: projectContext, projectId: location.projectId });
      if (models.length > 0) {
        sources.attemptModels = models;
        derivedFrom.push("store:run-attempts");
      }
    } catch {
      /* run history is optional evidence */
    }
  }
  return { sources, derivedFrom, projectDirectory: null };
}

/** JSON body of a Document revision via the bounded content seam (≤1 MiB), else undefined. */
function readDocumentJson(context: QueryContext, revisionId: string): unknown {
  let text = "";
  let after = 0;
  for (let page = 0; page < 16; page += 1) {
    const chunk = getDocumentContent({ context, revisionId, afterByte: after, limitBytes: 65_536 });
    if (chunk.format !== "json") return undefined;
    text += chunk.text;
    if (chunk.nextByte === null) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return undefined;
      }
    }
    after = chunk.nextByte;
  }
  return undefined;
}

/**
 * The on-disk working tree of a Unit's Project, when one exists: an explicit
 * `--from` directory wins, else the conventional project directory under the
 * Project slug, then its ID.
 */
export function resolveProjectDirectory(location: UnitLocationDto, explicit?: string): string | null {
  if (explicit) {
    const dir = path.resolve(explicit);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new MetricParseError(`--from directory not found: ${explicit}`);
    }
    return dir;
  }
  for (const candidate of [location.projectSlug, location.projectId]) {
    if (!candidate) continue;
    try {
      const dir = projectDir(candidate);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* not resolvable in this layout */
    }
  }
  return null;
}

/** Store sources first; on-disk files fill what the store does not carry. */
export function gatherLedgerSources(
  context: QueryContext,
  location: UnitLocationDto,
  fromDir?: string,
): GatheredSources {
  const store = gatherStoreSources(context, location);
  const dir = resolveProjectDirectory(location, fromDir);
  if (!dir) return store;
  const files = gatherFileSources(dir, location.slug);
  const pick = <K extends SourceKey>(key: K) => {
    const storeValue = store.sources[key as keyof LedgerSources];
    return storeValue !== undefined
      ? { value: storeValue, origin: store.sources.origins?.[key] }
      : { value: files.sources[key as keyof LedgerSources], origin: files.sources.origins?.[key] };
  };
  const merged: LedgerSources = { unit: store.sources.unit, origins: {} };
  for (const key of ["unitManifest", "plan", "scenario", "prompts", "assetManifest", "generations", "composition", "compositionBlocks", "attemptModels"] as const) {
    const { value, origin } = pick(key);
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    if (origin) merged.origins![key] = origin;
  }
  return {
    sources: merged,
    derivedFrom: [...new Set([...store.derivedFrom, ...files.derivedFrom])],
    projectDirectory: dir,
  };
}

// ─── persistence ─────────────────────────────────────────────────────────────

export interface StoredLedger {
  documentId: string;
  revisionId: string | null;
  body: DecisionLedgerBody | null;
}

export function parseLedgerBody(body: JsonValue | null | undefined): DecisionLedgerBody | null {
  const parsed = DecisionLedgerBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function readStoredLedger(context: QueryContext, unitId: string): StoredLedger | null {
  const document = findUnitLedgerDocument({ context, unitId });
  if (!document) return null;
  return {
    documentId: document.documentId,
    revisionId: document.currentRevisionId,
    body: parseLedgerBody(document.body),
  };
}

/**
 * Append a ledger revision when its content changed (timestamps excluded);
 * creates the Document on first write. Returns whether a revision was written.
 */
export function writeLedger(input: {
  context: QueryContext;
  location: UnitLocationDto;
  derived: DerivedDecisions;
  manual: ManualDecisions;
  derivedFrom: string[];
  authoredBySessionId?: string;
  now?: Date;
}): { documentId: string; revisionId: string; written: boolean; body: DecisionLedgerBody } {
  const now = (input.now ?? new Date()).toISOString();
  const existing = readStoredLedger(input.context, input.location.unitId);
  const body: DecisionLedgerBody = {
    kind: DECISION_LEDGER_BODY_KIND,
    version: 1,
    unitId: input.location.unitId,
    unitSlug: input.location.slug,
    projectId: input.location.projectId,
    derived: input.derived,
    manual: input.manual,
    derivedFrom: [...input.derivedFrom].sort(),
    derivedAt: now,
    updatedAt: now,
  };
  if (existing?.body && existing.revisionId && sameContent(existing.body, body)) {
    return { documentId: existing.documentId, revisionId: existing.revisionId, written: false, body: existing.body };
  }
  const title = `Decision ledger: ${input.location.slug}`;
  const documentId = existing?.documentId ?? createDocument(
    input.location.projectId
      ? {
          projectId: input.location.projectId,
          kind: DECISION_LEDGER_DOCUMENT_KIND,
          slug: decisionLedgerSlug(input.location.slug),
          title,
        }
      : {
          workspaceId: input.location.workspaceId,
          kind: DECISION_LEDGER_DOCUMENT_KIND,
          slug: decisionLedgerSlug(input.location.slug),
          title,
        },
  ).id;
  const revision = reviseDocument({
    documentId,
    expectedHeadId: existing?.revisionId ?? null,
    format: "json",
    title,
    body: JSON.stringify(body),
    ...(input.authoredBySessionId ? { authoredBySessionId: input.authoredBySessionId } : {}),
  });
  return { documentId, revisionId: revision.id, written: true, body };
}

/**
 * Record manual decisions on a Unit's ledger: the library form of
 * `ralphy unit decisions <unit> --set key=value`. Keeps the stored derivation
 * (what produced the Unit) when one exists; a first write derives it from the
 * Unit's artifacts. Each assignment is parsed like `--set` (throws
 * MetricParseError on a bad key or value). Append-only: a revision is written
 * only when the content changes.
 */
export function recordManualDecisions(input: {
  context: QueryContext;
  location: UnitLocationDto;
  assignments: string[];
  authoredBySessionId?: string;
  now?: Date;
}): { documentId: string; revisionId: string; written: boolean; manual: ManualDecisions } {
  const sets = input.assignments.map(parseLedgerAssignment);
  const stored = readStoredLedger(input.context, input.location.unitId);
  let derived: DerivedDecisions;
  let derivedFrom: string[];
  if (stored?.body) {
    derived = stored.body.derived;
    derivedFrom = stored.body.derivedFrom;
  } else {
    const gathered = gatherLedgerSources(input.context, input.location);
    derived = deriveDecisions(gathered.sources);
    derivedFrom = gathered.derivedFrom;
  }
  const manual: ManualDecisions = { ...(stored?.body?.manual ?? {}) };
  for (const { key, value } of sets) manual[key] = value;
  const result = writeLedger({
    context: input.context,
    location: input.location,
    derived,
    manual,
    derivedFrom,
    ...(input.authoredBySessionId ? { authoredBySessionId: input.authoredBySessionId } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return { documentId: result.documentId, revisionId: result.revisionId, written: result.written, manual: result.body.manual };
}

function sameContent(left: DecisionLedgerBody, right: DecisionLedgerBody): boolean {
  const strip = (body: DecisionLedgerBody) =>
    JSON.stringify({ derived: sortKeys(body.derived), manual: sortKeys(body.manual), derivedFrom: body.derivedFrom });
  return strip(left) === strip(right);
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Derive (from store + files) and merge with the stored manual entries.
 * Pure read: nothing is written.
 */
export function previewLedger(context: QueryContext, location: UnitLocationDto, fromDir?: string) {
  const gathered = gatherLedgerSources(context, location, fromDir);
  const derived = deriveDecisions(gathered.sources);
  const stored = readStoredLedger(context, location.unitId);
  const manual = stored?.body?.manual ?? {};
  return {
    derived,
    manual,
    stored,
    derivedFrom: gathered.derivedFrom,
    projectDirectory: gathered.projectDirectory,
    effective: effectiveDecisions(derived, manual),
  };
}
