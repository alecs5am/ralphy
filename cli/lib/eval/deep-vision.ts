// Deep-vision pass — full-mp4 evaluation against project-specific context.
//
// Where the standard per-scene vision (`./vision.ts`) sends ONE keyframe per
// scene to gemini-2.5-flash with a generic UGC-issues prompt, this pass
// sends the WHOLE mp4 to google/gemini-3.1-pro-preview with the project's
// style-sheet, brief, and any reference notes loaded in-context. Output is
// rich style-conformance findings tied to specific rules from the style
// sheet — not generic UGC defaults.
//
// Triggered when --style-sheet or --brief is passed to `ralphy eval video`.
// The cost is real (gemini-3.1-pro-preview on 30-50 MB mp4) — but per the
// user directive, this is the "validator should give hard base, not generic
// answers" path. Budget is intentional.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { callLLM, type LLMContent } from "../providers/llm.js";
import type { Finding, Severity } from "./types.js";

export type DeepVisionContext = {
  /** Path to style-sheet.md (creator stylesheet output from scrape-profile).
   *  When set, the model evaluates the rendered video against every rule in
   *  the "What this creator NEVER does" + "Vibe & visual register" sections. */
  styleSheetPath?: string | null;
  /** Path to BRIEF.md or similar — the user's stated intent for THIS render. */
  briefPath?: string | null;
  /** Optional list of reference video URLs the creator's catalog used. The
   *  model is told to compare the rendered output to these as the target
   *  visual benchmark. */
  referenceUrls?: string[];
  /** Project id, for logging the model call against the right cost ledger. */
  projectId?: string | null;
  /** Override model. Default google/gemini-3.1-pro-preview (native video). */
  model?: string;
  /** Hard cap on mp4 bytes sent in-band. Larger videos get rejected (the
   *  user should re-encode smaller for eval). Default 40 MB. */
  maxMp4Bytes?: number;
};

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

const SYSTEM = `You are a senior creative director running a hard-base quality gate on a rendered short-form vertical video. You will be given:

1. The full rendered mp4 (native video input — you see every frame at native temporal resolution, not sampled keyframes).
2. The project's STYLE SHEET — the formal rules the render is supposed to honor. This is the source of truth.
3. The project's BRIEF — the user's specific intent for THIS render.
4. Optional reference video URLs the creator's catalog used as the target benchmark.

Your job: produce HARD, SPECIFIC, ACTIONABLE findings. Generic UGC platitudes ("hook could be stronger") are forbidden. Every finding must (a) cite a specific rule from the style sheet OR a specific brief intent, (b) cite a specific timestamp / window in the rendered video where the violation occurs, (c) explain WHY the render misses the rule in concrete terms, (d) give a concrete fix that names the slot / scene / parameter that needs to change.

CRITICAL: You are encouraged to be harsh. The user explicitly said "не дженерик ответы, навалить жесткой базы". If the render is mediocre, say so. If a rule is half-honored, mark it warn. If the register is wrong, mark it fail. Do not soften your assessment to be polite.

Output STRICT JSON only. No prose around the JSON, no markdown fences. Schema:

type DeepFindings = {
  overall_verdict: "pass" | "warn" | "fail";        // Holistic call across all dimensions.
  register_match: {
    declared: string;                                // What register the style sheet declared (e.g. "photoreal-handheld")
    observed: string;                                // What you actually saw in the rendered video
    match: "tight" | "loose" | "miss";               // tight = on-style; loose = drifts but readable; miss = wrong register.
    note: string;                                    // 1-2 sentences explaining the call with frame references.
  };
  rule_conformance: Array<{
    rule_id: string;                                 // Short slug for the rule (e.g. "zero-cuts", "bystander-indifference", "diegetic-only-audio")
    rule_text: string;                               // Verbatim quote from the style sheet describing the rule
    status: "pass" | "warn" | "fail";
    evidence: string;                                // What you saw in the video at specific timestamps (e.g. "at 3.5s the dog's head is half-formed but the dad's gaze flicks to the dog — bystander indifference broken")
    fix: string;                                     // Concrete next step (e.g. "regen end-frame v8 with dad's eyes locked on grill — currently he glances at second 4")
  }>;
  brief_conformance: Array<{
    brief_clause: string;                            // Quoted phrase from BRIEF.md the render is judged against
    status: "pass" | "warn" | "fail";
    evidence: string;
    fix: string;
  }>;
  uncanny_mechanism_check: {
    described_in_style_sheet: string;                // The style sheet's "uncanny mechanism" paragraph distilled to one line.
    present_in_render: "tight" | "loose" | "miss";
    evidence: string;                                // 2-3 sentences with timestamps. Does the rendered video DELIVER the mechanism, or just mimic the surface?
    fix: string;
  };
  pacing_and_timing: {
    hook_first_3s: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    body_arc: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    closer: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
  };
  ai_artifacts: Array<{
    timestamp_sec: number;
    description: string;                             // E.g. "at 4.2s the dog's right paw clips through the grass"
    severity: "info" | "warn" | "fail";
    fix: string;
  }>;
  what_works: string[];                              // Be honest — list 2-5 things the render genuinely got right.
  what_to_redo: Array<{                              // Prioritized list of fixes ranked by impact.
    priority: 1 | 2 | 3;                             // 1 = critical
    target: "start-frame" | "end-frame" | "i2v" | "audio" | "scene-prompt" | "model-swap" | "regen-entire";
    action: string;
    rationale: string;
  }>;
}

Rules of engagement:
- Use specific timestamps in seconds (e.g. "at 2.3s", "between 5.0 and 6.5s"). Vague "near the end" is forbidden.
- Quote style sheet rules and brief clauses VERBATIM. Don't paraphrase — copy exact phrasing.
- "what_to_redo" must be a ranked list. Priority 1 = the single thing that would most improve the render. Maximum 6 items.
- If the rendered video is a meaningful improvement over what most AI-generated UGC achieves, say so in what_works — but do not pad. Empty arrays are fine.
- Length: terse and dense. No filler.
`;

export type DeepVisionResult = {
  raw: string;
  parsed: DeepFindingsShape | null;
  findings: Finding[];
  modelUsed: string;
};

type DeepFindingsShape = {
  overall_verdict?: "pass" | "warn" | "fail";
  register_match?: {
    declared?: string;
    observed?: string;
    match?: "tight" | "loose" | "miss";
    note?: string;
  };
  rule_conformance?: Array<{
    rule_id?: string;
    rule_text?: string;
    status?: "pass" | "warn" | "fail";
    evidence?: string;
    fix?: string;
  }>;
  brief_conformance?: Array<{
    brief_clause?: string;
    status?: "pass" | "warn" | "fail";
    evidence?: string;
    fix?: string;
  }>;
  uncanny_mechanism_check?: {
    described_in_style_sheet?: string;
    present_in_render?: "tight" | "loose" | "miss";
    evidence?: string;
    fix?: string;
  };
  pacing_and_timing?: {
    hook_first_3s?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
    body_arc?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
    closer?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
  };
  ai_artifacts?: Array<{
    timestamp_sec?: number;
    description?: string;
    severity?: "info" | "warn" | "fail";
    fix?: string;
  }>;
  what_works?: string[];
  what_to_redo?: Array<{
    priority?: 1 | 2 | 3;
    target?: string;
    action?: string;
    rationale?: string;
  }>;
};

export async function deepVisionEvaluate(
  videoPath: string,
  ctx: DeepVisionContext,
): Promise<DeepVisionResult> {
  const model = ctx.model ?? "google/gemini-3.1-pro-preview";
  const maxBytes = ctx.maxMp4Bytes ?? 40 * 1024 * 1024;

  const stats = await stat(videoPath);
  if (stats.size > maxBytes) {
    throw new Error(
      `mp4 too large for deep-vision (${(stats.size / 1024 / 1024).toFixed(1)} MB > ${maxBytes / 1024 / 1024} MB cap). Re-encode at lower bitrate before running the deep pass.`,
    );
  }

  const styleSheet = ctx.styleSheetPath ? await readSafe(ctx.styleSheetPath) : "";
  const brief = ctx.briefPath ? await readSafe(ctx.briefPath) : "";
  const refLines = (ctx.referenceUrls ?? []).slice(0, 20).map((u) => `- ${u}`).join("\n");

  const buf = await readFile(videoPath);
  const ext = path.extname(videoPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "video/mp4";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  const userParts: string[] = [];
  if (styleSheet) {
    userParts.push("## STYLE SHEET (source of truth — every rule below must be honored)\n\n" + styleSheet.slice(0, 24_000));
  } else {
    userParts.push("## STYLE SHEET\n(none provided — fall back to generic short-form vertical viral-quality heuristics; flag this absence in `note` of register_match.)");
  }
  if (brief) {
    userParts.push("## BRIEF (user's specific intent for THIS render)\n\n" + brief.slice(0, 4_000));
  }
  if (refLines) {
    userParts.push("## REFERENCE VIDEOS (the creator's target benchmark)\n\n" + refLines);
  }
  userParts.push("## RENDERED VIDEO\n(attached as file content block — evaluate the full mp4 at native temporal resolution)");
  userParts.push("Return the strict JSON findings now. Be harsh and specific.");

  const content: LLMContent[] = [
    {
      type: "file",
      file: { filename: path.basename(videoPath), file_data: dataUrl },
    },
    { type: "text", text: userParts.join("\n\n") },
  ];

  // NOTE: jsonMode=false intentional. gemini-3.1-pro-preview with a video
  // file content block + jsonMode returns an empty text body — confirmed
  // bug pattern. Same workaround as cli/lib/research.ts → analyzeVideo:
  // ask for JSON-shaped output in the prompt, parse fenced/raw JSON
  // post-hoc.
  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    model,
    jsonMode: false,
    temperature: 0.2,
    maxTokens: 16000,
    projectId: ctx.projectId ?? undefined,
    endpoint: "eval/deep-vision",
  });

  const parsed = safeParseJson(text);
  const findings = parsed ? translateToFindings(parsed) : [];
  return { raw: text, parsed, findings, modelUsed: model };
}

async function readSafe(p: string): Promise<string> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}

function safeParseJson(text: string): DeepFindingsShape | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as DeepFindingsShape;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as DeepFindingsShape;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function severityFromStatus(s: string | undefined): Severity {
  if (s === "fail") return "fail";
  if (s === "warn") return "warn";
  return "info";
}

let _idCounter = 1000;
function nextId(): string {
  _idCounter += 1;
  return `D${_idCounter}`;
}

function translateToFindings(d: DeepFindingsShape): Finding[] {
  const out: Finding[] = [];

  if (d.register_match && d.register_match.match && d.register_match.match !== "tight") {
    const sev: Severity = d.register_match.match === "miss" ? "fail" : "warn";
    out.push({
      id: nextId(),
      category: "style.register-mismatch",
      severity: sev,
      sceneIndex: null,
      timestampSec: null,
      message: `Register: declared "${d.register_match.declared ?? "?"}", observed "${d.register_match.observed ?? "?"}" (${d.register_match.match}). ${d.register_match.note ?? ""}`.trim(),
      fixHint: "Re-anchor the i2v start+end frames in the correct cinematographic register before re-rendering. Mismatched register is the single highest-impact failure mode.",
      fixCommand: null,
    });
  }

  for (const r of d.rule_conformance ?? []) {
    if (!r || r.status === "pass") continue;
    out.push({
      id: nextId(),
      category: "style.rule-violation",
      severity: severityFromStatus(r.status),
      sceneIndex: null,
      timestampSec: null,
      message: `Rule "${r.rule_id ?? "?"}" violated. Style sheet says: "${(r.rule_text ?? "").slice(0, 240)}". Evidence: ${r.evidence ?? "(none)"}`,
      fixHint: r.fix ?? "Re-render with the rule honored.",
      fixCommand: null,
    });
  }

  for (const b of d.brief_conformance ?? []) {
    if (!b || b.status === "pass") continue;
    out.push({
      id: nextId(),
      category: "brief.intent-drift",
      severity: severityFromStatus(b.status),
      sceneIndex: null,
      timestampSec: null,
      message: `Brief clause "${(b.brief_clause ?? "").slice(0, 160)}" not delivered. Evidence: ${b.evidence ?? "(none)"}`,
      fixHint: b.fix ?? "Re-align with the brief.",
      fixCommand: null,
    });
  }

  if (d.uncanny_mechanism_check && d.uncanny_mechanism_check.present_in_render && d.uncanny_mechanism_check.present_in_render !== "tight") {
    const sev: Severity = d.uncanny_mechanism_check.present_in_render === "miss" ? "fail" : "warn";
    out.push({
      id: nextId(),
      category: "style.aesthetic-mechanism-missing",
      severity: sev,
      sceneIndex: null,
      timestampSec: null,
      message: `Aesthetic mechanism (${d.uncanny_mechanism_check.described_in_style_sheet ?? "?"}) is ${d.uncanny_mechanism_check.present_in_render} in the render. Evidence: ${d.uncanny_mechanism_check.evidence ?? "(none)"}`,
      fixHint: d.uncanny_mechanism_check.fix ?? "Surface the aesthetic mechanism more deliberately.",
      fixCommand: null,
    });
  }

  for (const [phase, val] of Object.entries(d.pacing_and_timing ?? {}) as Array<[
    string,
    { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string },
  ]>) {
    if (!val || val.status === "pass") continue;
    out.push({
      id: nextId(),
      category: `style.timing-${phase.replace(/_/g, "-")}`,
      severity: severityFromStatus(val.status),
      sceneIndex: null,
      timestampSec: null,
      message: `${phase} timing ${val.status}: ${val.evidence ?? "(no evidence given)"}`,
      fixHint: val.fix ?? "Adjust timing.",
      fixCommand: null,
    });
  }

  for (const a of d.ai_artifacts ?? []) {
    if (!a) continue;
    out.push({
      id: nextId(),
      category: "vision.ai-artifacts",
      severity: severityFromStatus(a.severity),
      sceneIndex: null,
      timestampSec: typeof a.timestamp_sec === "number" ? a.timestamp_sec : null,
      message: a.description ?? "(no description)",
      fixHint: a.fix ?? "Re-generate the affected segment.",
      fixCommand: null,
    });
  }

  return out;
}
