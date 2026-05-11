// Topic-level research orchestration.
//
// Where `cli/lib/research.ts` operates on a single URL (pull → frames →
// transcribe → analyze → audio-describe → blueprint), this module composes
// those primitives across N sources and produces a deep-research artifact:
//
//   workspace/research/<topic>/
//     report.md       — narrative synthesis with footnote citations
//     sources.json    — machine-readable source list + key findings
//     state.json      — bookkeeping (sources added, last synthesis, etc.)
//
// The skill `/ralph-researcher` is the human entry-point; this module is the
// machine contract. Schema for sources.json is in
// `.agents/skills/ralph-researcher/references/report-schema.md`.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { researchDir } from "./paths.js";
import { slugify } from "./ids.js";
import {
  pullReference,
  sampleFrames,
  transcribeRef,
  analyzeFrames,
  audioDescribeRef,
  synthesizeBlueprint,
  refPaths,
  slugFromUrl,
} from "./research.js";
import { callLLM } from "./providers/llm.js";

// ─────────────────────────────────────────────────────────────────────────────
// Paths + types
// ─────────────────────────────────────────────────────────────────────────────

export function topicDir(topic: string): string {
  return path.join(researchDir(), slugify(topic));
}

export function topicPaths(topic: string) {
  const dir = topicDir(topic);
  return {
    dir,
    report: path.join(dir, "report.md"),
    sources: path.join(dir, "sources.json"),
    state: path.join(dir, "state.json"),
  };
}

export type SourceStatus = "pending" | "pulled" | "analyzed" | "failed";

export interface TopicSource {
  /** Footnote id used in report.md (`[^1]`, `[^2]`, …) */
  id: string;
  url: string;
  /** Slug under workspace/references/<slug>/ — points at the raw artifacts. */
  refSlug: string;
  /** Title pulled from yt-dlp meta (or hostname for plain pages). */
  title: string;
  addedAt: string;
  status: SourceStatus;
  blueprintPath?: string;
  /** Short bullets distilled by the synthesis step. */
  keyFindings?: string[];
  error?: string;
}

export interface TopicState {
  topic: string;
  question?: string;
  createdAt: string;
  lastSynthesizedAt?: string;
  sources: TopicSource[];
}

// ─────────────────────────────────────────────────────────────────────────────
// State helpers
// ─────────────────────────────────────────────────────────────────────────────

async function readState(topic: string): Promise<TopicState | null> {
  const p = topicPaths(topic).state;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as TopicState;
  } catch {
    return null;
  }
}

async function writeState(state: TopicState): Promise<void> {
  const paths = topicPaths(state.topic);
  await fs.mkdir(paths.dir, { recursive: true });
  await fs.writeFile(paths.state, JSON.stringify(state, null, 2) + "\n");
}

function nextSourceId(state: TopicState): string {
  return String(state.sources.length + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// start — create a new topic dir
// ─────────────────────────────────────────────────────────────────────────────

export interface StartTopicOptions {
  topic: string;
  question?: string;
}

export async function startTopic(opts: StartTopicOptions): Promise<TopicState> {
  const slug = slugify(opts.topic);
  const existing = await readState(slug);
  if (existing) return existing;

  const state: TopicState = {
    topic: slug,
    question: opts.question,
    createdAt: new Date().toISOString(),
    sources: [],
  };
  await writeState(state);
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// add-source — pull + blueprint a URL into the topic
// ─────────────────────────────────────────────────────────────────────────────

export interface AddSourceOptions {
  topic: string;
  url: string;
  /** Skip the heavy per-source ref chain (already done elsewhere). */
  metaOnly?: boolean;
  /** Pass-through to ralphy ref frames (default 12). */
  maxFrames?: number;
}

export interface AddSourceResult {
  source: TopicSource;
  state: TopicState;
}

export async function addSource(opts: AddSourceOptions): Promise<AddSourceResult> {
  const slug = slugify(opts.topic);
  const state = (await readState(slug)) ?? (await startTopic({ topic: slug }));

  // Reuse a previously-added source if the URL matches.
  const refSlug = slugFromUrl(opts.url);
  const already = state.sources.find((s) => s.refSlug === refSlug || s.url === opts.url);
  if (already && already.status === "analyzed") {
    return { source: already, state };
  }

  const sourceId = already?.id ?? nextSourceId(state);
  const sourceEntry: TopicSource = already ?? {
    id: sourceId,
    url: opts.url,
    refSlug,
    title: refSlug,
    addedAt: new Date().toISOString(),
    status: "pending",
  };

  // Persist a pending entry first so a crash mid-pipeline doesn't lose the link.
  if (!already) {
    state.sources.push(sourceEntry);
    await writeState(state);
  }

  try {
    // 1. pull (mp4 + meta + mp3)
    const pulled = await pullReference({ url: opts.url, slug: refSlug });
    sourceEntry.title =
      ((pulled.meta?.title as string) || (pulled.meta?.uploader as string) || refSlug) as string;
    sourceEntry.status = "pulled";
    await writeState(state);

    if (opts.metaOnly) {
      sourceEntry.status = "analyzed";
      await writeState(state);
      return { source: sourceEntry, state };
    }

    // 2. frames
    if (pulled.videoPath) {
      await sampleFrames({ slug: refSlug, max: opts.maxFrames ?? 12 });
    }
    // 3. transcribe (audio if available)
    if (pulled.audioPath) {
      await transcribeRef({ slug: refSlug }).catch(() => null);
    }
    // 4. vision analysis
    if (pulled.videoPath) {
      await analyzeFrames({ slug: refSlug }).catch(() => null);
    }
    // 5. audio description
    if (pulled.audioPath) {
      await audioDescribeRef({ slug: refSlug }).catch(() => null);
    }
    // 6. blueprint
    const bp = await synthesizeBlueprint(refSlug);
    sourceEntry.blueprintPath = bp.path;
    sourceEntry.status = "analyzed";
    await writeState(state);

    return { source: sourceEntry, state };
  } catch (e) {
    sourceEntry.status = "failed";
    sourceEntry.error = (e as Error).message;
    await writeState(state);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// synthesize — cross-source LLM pass → report.md + sources.json
// ─────────────────────────────────────────────────────────────────────────────

export interface SynthesizeOptions {
  topic: string;
  /** Override the default model (google/gemini-2.5-flash). */
  model?: string;
}

export interface SynthesizeResult {
  reportPath: string;
  sourcesPath: string;
  state: TopicState;
}

const SYNTH_SYSTEM = `You are a senior creative researcher writing a deep-research report for a UGC video team.

You receive a research question and N analyzed sources. Each source includes:
- meta (title, author, url, duration when available)
- transcript (verbatim words)
- vision analysis (frame-by-frame description, visual style notes)
- audio description (VO tone, music, sound design)
- per-source blueprint (synthesized human-readable summary)

Your job is to write a single Markdown report that a scenarist / art-director can act on. The report must:

1. Open with a 2–3 paragraph Executive Summary that answers the research question directly.
2. List 5–10 Key Findings as bullets. Every claim must cite its source(s) using footnote markers like [^1] [^3]. Group multi-source findings — if 3 sources do the same thing, that is more useful than 3 separate bullets.
3. Identify Patterns Across Sources — recurring hook structures, VO cadences, visual motifs, pacing tricks. Cite with footnotes.
4. Give Actionable Recommendations split into "For scenarist" and "For art-director".
5. List Open Questions worth a follow-up pass.
6. End with a Sources section listing each footnote as: \`[^N]: <url> — <title>\`.

You also output a JSON sidecar with key findings per source (3–6 short bullets each). The JSON shape is:
{ "perSource": { "1": ["finding A", "finding B", ...], "2": [...] } }

Output strictly in this format, no preamble:

<report>
…markdown report…
</report>

<json>
{ "perSource": { ... } }
</json>

Write in the language of the source material when quoting, but the analytical prose should match the language of the research question.`;

export async function synthesizeReport(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const slug = slugify(opts.topic);
  const state = await readState(slug);
  if (!state) throw new Error(`research topic not found: ${slug}`);

  const analyzed = state.sources.filter((s) => s.status === "analyzed");
  if (analyzed.length === 0) {
    throw new Error(`no analyzed sources for topic ${slug} — run \`ralphy research add-source <url> --topic ${slug}\` first`);
  }

  const sourceBlocks = await Promise.all(analyzed.map(buildSourceBlock));
  const userPrompt = [
    `# Research question`,
    state.question?.trim() || `(no explicit question — synthesize the common patterns across sources)`,
    ``,
    `# Topic`,
    slug,
    ``,
    `# Sources (${analyzed.length})`,
    ...sourceBlocks,
  ].join("\n\n");

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYNTH_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    model: opts.model ?? "google/gemini-2.5-flash",
    temperature: 0.4,
    maxTokens: 6000,
    endpoint: "research.synthesize",
  });

  const { report, perSource } = parseSynthOutput(text);

  // Merge perSource into sources.json
  for (const src of analyzed) {
    const findings = perSource?.[src.id];
    if (Array.isArray(findings)) src.keyFindings = findings.slice(0, 8);
  }
  state.lastSynthesizedAt = new Date().toISOString();
  await writeState(state);

  const paths = topicPaths(slug);
  await fs.writeFile(paths.report, report + (report.endsWith("\n") ? "" : "\n"));
  await fs.writeFile(
    paths.sources,
    JSON.stringify(
      {
        topic: state.topic,
        question: state.question ?? null,
        createdAt: state.createdAt,
        lastSynthesizedAt: state.lastSynthesizedAt,
        sources: state.sources,
      },
      null,
      2,
    ) + "\n",
  );

  return { reportPath: paths.report, sourcesPath: paths.sources, state };
}

async function buildSourceBlock(src: TopicSource): Promise<string> {
  const rp = refPaths(src.refSlug);
  const meta = await readJsonSafe(rp.meta);
  const transcript = await readJsonSafe(rp.transcript);
  const analysis = await readJsonSafe(rp.analysis);
  const audio = await readJsonSafe(rp.audioAnalysis);
  const blueprint = (await readTextSafe(rp.blueprint)) ?? "";

  const transcriptText = Array.isArray(transcript)
    ? transcript
        .map((c) => (c && typeof c === "object" ? (c as { text?: string }).text ?? "" : ""))
        .filter(Boolean)
        .join(" ")
        .slice(0, 4000)
    : "";

  return [
    `## [^${src.id}] ${src.title}`,
    `- url: ${src.url}`,
    meta && typeof meta === "object" ? `- meta: ${formatMeta(meta as Record<string, unknown>)}` : "",
    transcriptText ? `- transcript: ${transcriptText}` : "",
    analysis ? `- vision: ${JSON.stringify(analysis).slice(0, 2500)}` : "",
    audio ? `- audio: ${JSON.stringify(audio).slice(0, 1200)}` : "",
    blueprint ? `- blueprint:\n\n${blueprint.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMeta(m: Record<string, unknown>): string {
  const pick = (k: string) => (typeof m[k] === "string" || typeof m[k] === "number" ? m[k] : undefined);
  const fields = ["title", "uploader", "channel", "duration", "view_count", "like_count", "upload_date"];
  return fields
    .map((k) => [k, pick(k)] as const)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
}

async function readJsonSafe(p: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

async function readTextSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

function parseSynthOutput(text: string): { report: string; perSource: Record<string, string[]> | null } {
  const reportMatch = text.match(/<report>([\s\S]*?)<\/report>/i);
  const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  const report = (reportMatch?.[1] ?? text).trim();
  let perSource: Record<string, string[]> | null = null;
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim()) as { perSource?: Record<string, string[]> };
      perSource = parsed.perSource ?? null;
    } catch {
      perSource = null;
    }
  }
  return { report, perSource };
}

// ─────────────────────────────────────────────────────────────────────────────
// show + list
// ─────────────────────────────────────────────────────────────────────────────

export async function showTopic(topic: string): Promise<TopicState | null> {
  return readState(slugify(topic));
}

export async function listTopics(): Promise<TopicState[]> {
  const dir = researchDir();
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: TopicState[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const s = await readState(e.name);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
