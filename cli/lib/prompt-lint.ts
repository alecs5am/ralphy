// Prompt-pack lint (#515) — deterministic, model-aware rules over a
// workspace's prompt files + the workflow nodes that consume them.
//
// The training path bakes craft into prompts once; drift happens when a model
// swap or a param tweak silently violates a constraint the agent would have
// caught in chat. This pass encodes those constraints as DATA — the same
// pattern as the #514 reroute rules: every rule carries a MANDATORY `source`
// citing its production origin (memory slug / MODELS.md / the #445
// constraints table). An unsourced rule is a defect; speculative style
// policing is out of scope by design (issue #515 "keep rules honest").
//
// Where it runs (all three consume lintGraphPrompts / lintWorkspacePrompts):
//   • `ralphy workflow lint`   — via lintWorkflowFile (workflow-graph.ts),
//   • `ralphy workspace export` — via exportReadiness (bundle.ts): an
//     error-level violation is a `prompt-lint-error` readiness gap,
//   • `ralphy prompt lint <ws>` — the standalone training-path verb.
//
// Per-model LENGTH CAPS are read from the #445 MODEL_CONSTRAINTS table
// (cli/lib/models/constraints.ts) — the caps are NOT duplicated here; the
// kling char cap fires through that table (a tripwire test asserts no
// literal cap value ever lands in this file).
//
// ZERO model calls. File I/O only (prompt files + guideline metadata).

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { workspaceDir, workflowsDir } from "./paths.js";
import { MODEL_CONSTRAINTS } from "./models/constraints.js";
import { resolveModelAlias } from "./model-aliases.js";
import { matchesModelPattern } from "./providers/reroute-rules.js";
import { lintMusicPrompt } from "./music-prompt-lint.js";
import {
  guidelinesDir,
  guidelinesDirExists,
  isPhotorealGuideline,
  loadGuideline,
  type Guideline,
} from "./guidelines.js";
import {
  isWorkflowGraphDocument,
  parseWorkflowGraph,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schemas/workflow.js";

// ─── Rule shape (rules as data, #514 pattern) ────────────────────────────────

/** The media kinds prompt rules key on (the `ralphy generate` kinds). */
export type PromptKind = "image" | "video" | "voiceover" | "music" | "sfx";

export type PromptLintLevel = "error" | "warning";

export interface PromptRuleContext {
  kind: PromptKind;
  /** Alias-resolved model id; undefined = the connector's own default. */
  model?: string;
  /** The prompt is photoreal-register-tagged (node param or guideline tag). */
  photoreal: boolean;
}

export interface PromptRuleFinding {
  message: string;
  fix: string;
  /** Override the rule's base level (ambiguous match → downgrade to warning). */
  level?: PromptLintLevel;
}

export interface PromptLintRule {
  /** Stable rule id (lands in issues + readiness gaps). */
  id: string;
  /** Media kinds the rule applies to (`"*"` = every kind). */
  kinds: "*" | PromptKind[];
  /** Model-id pattern (`*` wildcards, reroute-rules grammar). `*` = any / default. */
  modelPattern: string;
  /** Base severity. A finding may downgrade (never upgrade) via `finding.level`. */
  level: PromptLintLevel;
  /** MANDATORY provenance: memory slug / MODELS.md / #445 table pointer. */
  source: string;
  /** Deterministic check — null = clean. Pure over (text, ctx). */
  check: (text: string, ctx: PromptRuleContext) => PromptRuleFinding | null;
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/** Quoted on-camera line, or explicit speech/VO vocabulary (kling VO scenes). */
const SPEECH_RE =
  /"[^"\n]{3,}"|\b(?:says?|saying|speak(?:s|ing)?|talk(?:s|ing)?|dialogue|voice-?over|lip-?sync(?:ed)?)\b/i;

/** An explicit no-music clause (memory feedback_kling_no_music_eleven_music_postmix). */
const NO_MUSIC_RE =
  /\b(?:no|without|ban(?:ned)?|zero)\b[^.\n]{0,40}?\b(?:music|soundtrack|score)\b|\bmusic\s*:\s*(?:none|off|banned)\b/i;

/**
 * "in the style of <Proper Noun>" and friends — the unambiguous artist /
 * producer reference shapes. Case-sensitive on the name by design: a
 * lowercase genre ("in the style of lo-fi hip hop") does not match.
 */
const ARTIST_STRONG_RE =
  /\b(?:in the style of|style of|sound(?:s|ing) like|inspired by|produced by|prod\.?\s*by)\s+((?:[A-Z][\w'.$-]*[\s,]*){1,4})/;

/** "<Proper Noun> type beat" — the canonical named-rapper prompt shape. */
const TYPE_BEAT_RE = /\b((?:[A-Z][\w'.$-]*\s+){1,3})type\s+beat\b/;

/** "like <Proper Noun>" / "similar to <Proper Noun>" — ambiguous → warning. */
const ARTIST_WEAK_RE = /\b(?:like|similar to)\s+((?:[A-Z][\w'.$-]*[\s,]*){1,3})/;

/** Any negative / ban clause at all (the anti-AI-slop negative cluster). */
const NEGATIVE_CLUSTER_RE = /\b(?:no|not|avoid|never|without|ban(?:ned)?|negative)\b/i;

// ─── The seed rule set ───────────────────────────────────────────────────────

export const PROMPT_LINT_RULES: PromptLintRule[] = [
  {
    // Per-model prompt-char caps — READ from the #445 table, never duplicated
    // here. kling's cap fires through its MODEL_CONSTRAINTS entries.
    id: "model-prompt-char-cap",
    kinds: "*",
    modelPattern: "*",
    level: "error",
    source:
      "#445 model-constraints table (MODEL_CONSTRAINTS.maxPromptChars, cli/lib/models/constraints.ts); memory project_kling_practical_limits (#008)",
    check(text, ctx) {
      const cap = ctx.model ? MODEL_CONSTRAINTS[ctx.model]?.maxPromptChars : undefined;
      if (cap === undefined || text.length <= cap) return null;
      return {
        message: `prompt is ${text.length} chars; ${ctx.model} caps at ${cap} (guaranteed provider 400)`,
        fix: `compress the prompt below ${cap} chars — trim atmosphere / setting prose first; keep the load-bearing voice-tag / no-music / on-camera clauses`,
      };
    },
  },
  {
    // A kling video prompt that requests speech/VO must ban music explicitly —
    // kling renders a music bed otherwise; music is a separate ElevenLabs pass.
    id: "kling-vo-music-ban",
    kinds: ["video"],
    modelPattern: "kwaivgi/kling-*",
    level: "warning",
    source: "memory feedback_kling_no_music_eleven_music_postmix; MODELS.md kling --audio policy",
    check(text) {
      if (!SPEECH_RE.test(text) || NO_MUSIC_RE.test(text)) return null;
      return {
        message:
          "kling prompt requests speech/VO but carries no explicit no-music clause — kling will render a music bed over the dialogue",
        fix: 'add an explicit ban, e.g. "no background music, no soundtrack — only diegetic SFX and the spoken line"; music is a separate ElevenLabs Music pass mixed in the editor stage',
      };
    },
  },
  {
    // ElevenLabs Music ToS rejects artist / producer / track names (400
    // bad_prompt). Pattern detector, NOT a name list (#515): the unambiguous
    // shapes error; a bare "like <Proper Noun>" downgrades to a warning. The
    // known-name #006 soft linter (music-prompt-lint.ts) is reused as-is.
    id: "elevenlabs-music-artist-name",
    kinds: ["music"],
    modelPattern: "*",
    level: "error",
    source:
      "memory feedback_elevenlabs_music_no_artist_names; MODELS.md 'Prompt content policy (#006)'",
    check(text) {
      const known = lintMusicPrompt(text);
      if (!known.ok) {
        const m = known.matches[0]!;
        return {
          message: `music prompt names "${m.matched}" (${m.kind}) — ElevenLabs Music ToS rejects it with 400 bad_prompt`,
          fix: m.suggestion,
        };
      }
      const strong = ARTIST_STRONG_RE.exec(text) ?? TYPE_BEAT_RE.exec(text);
      if (strong) {
        return {
          message: `music prompt references an artist/producer by name ("${strong[0].trim()}") — ElevenLabs Music ToS rejects named references with 400 bad_prompt`,
          fix: "describe the register instead: genre + tempo + instrumentation + mood only (a rejected prompt's API error carries a ready prompt_suggestion rewrite)",
        };
      }
      const weak = ARTIST_WEAK_RE.exec(text);
      if (weak) {
        return {
          level: "warning",
          message: `music prompt says "${weak[0].trim()}" — if that capitalized name is an artist/track, ElevenLabs Music will reject it (400 bad_prompt)`,
          fix: "if it names an artist/track, replace it with genre + tempo + instrumentation; if it is a genre/place, ignore this warning",
        };
      }
      return null;
    },
  },
  {
    // Photoreal-register prompts need the anti-AI-slop negative cluster — the
    // beauty-filter default wins otherwise. Fires only on tagged prompts
    // (node params.register/photoreal, or a photoreal-tagged guideline).
    id: "photoreal-negative-cluster",
    kinds: ["image", "video"],
    modelPattern: "*",
    level: "warning",
    source: "memory feedback_anti_ai_slop_image; guideline photoreal-studio-portraits",
    check(text, ctx) {
      if (!ctx.photoreal || NEGATIVE_CLUSTER_RE.test(text)) return null;
      return {
        message:
          "photoreal-tagged prompt has no negative/ban cluster — the beauty-filter default (smoothed skin, enlarged eyes, reshaped jawline) will win",
        fix: 'add the anti-AI-slop negatives, e.g. "no beauty filter, no skin smoothing, no enlarged eyes, no jawline reshape, natural skin texture with visible pores"',
      };
    },
  },
];

// ─── Pure rule runner ────────────────────────────────────────────────────────

export interface PromptLintFinding extends PromptRuleFinding {
  rule: string;
  level: PromptLintLevel;
  source: string;
}

/** Run every applicable seed rule over one prompt text. Pure. */
export function lintPromptText(text: string, ctx: PromptRuleContext): PromptLintFinding[] {
  const findings: PromptLintFinding[] = [];
  for (const rule of PROMPT_LINT_RULES) {
    if (rule.kinds !== "*" && !rule.kinds.includes(ctx.kind)) continue;
    if (rule.modelPattern !== "*" && !matchesModelPattern(rule.modelPattern, ctx.model)) continue;
    const finding = rule.check(text, ctx);
    if (finding) {
      findings.push({
        ...finding,
        rule: rule.id,
        level: finding.level ?? rule.level,
        source: rule.source,
      });
    }
  }
  return findings;
}

// ─── Node scan (workflow graphs) ─────────────────────────────────────────────

/** Node type → the prompt kind its prompt text is written for. */
const NODE_TYPE_KIND: Record<string, PromptKind> = {
  t2i: "image",
  i2i: "image",
  t2v: "video",
  i2v: "video",
  r2v: "video",
  v2v: "video",
  lipsync: "video",
  tts: "voiceover",
  music: "music",
  sfx: "sfx",
};

const PROMPT_KINDS: readonly string[] = ["image", "video", "voiceover", "music", "sfx"];

function nodePromptKind(node: WorkflowNode): PromptKind | undefined {
  if (node.type === "ralphy-generate") {
    const k = String(node.params.kind ?? "");
    return PROMPT_KINDS.includes(k) ? (k as PromptKind) : undefined;
  }
  return NODE_TYPE_KIND[node.type];
}

function nodeGuidelineSlugs(node: WorkflowNode): string[] {
  const v = node.params.guidelines;
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim().length > 0) {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Photoreal tagging: explicit node param, or any photoreal-tagged guideline. */
function nodeIsPhotoreal(node: WorkflowNode, guidelines: Guideline[]): boolean {
  if (node.params.photoreal === true) return true;
  if (typeof node.params.register === "string" && node.params.register === "photoreal") return true;
  return guidelines.some(isPhotorealGuideline);
}

/** The issue shape — same envelope as workflow-graph's GraphIssue extras. */
export interface PromptLintIssue {
  level: PromptLintLevel;
  code: "prompt-rule" | "unknown-guideline";
  /** Node id the issue is about. */
  node: string;
  /** Prompt source: workspace-relative file, or the inline params key. */
  file: string;
  /** Rule id (prompt-rule issues). */
  rule?: string;
  /** Provenance citation (prompt-rule issues). */
  source?: string;
  message: string;
  fix: string;
}

export interface LintGraphPromptsOptions {
  /** Workspace slug — resolves relative `prompt_file` refs. Absent → inline-only. */
  workspace?: string;
}

/**
 * Lint one parsed workflow graph's prompt-consuming nodes: guideline-slug
 * validation (unknown slug = error) + the seed rules over every STATICALLY
 * resolvable prompt text (inline params, or a prompt_file under the
 * workspace). A wired prompt in-port has no static text — skipped by design.
 */
export function lintGraphPrompts(
  graph: WorkflowGraph,
  opts: LintGraphPromptsOptions = {},
): PromptLintIssue[] {
  const issues: PromptLintIssue[] = [];
  const wsDir = opts.workspace ? workspaceDir(opts.workspace) : undefined;
  const haveGuidelines = guidelinesDirExists();

  for (const node of graph.nodes) {
    // 1. Guideline slugs (any node type may carry params.guidelines).
    const slugs = nodeGuidelineSlugs(node);
    const loaded: Guideline[] = [];
    for (const slug of slugs) {
      const g = loadGuideline(slug);
      if (g) {
        loaded.push(g);
        continue;
      }
      if (haveGuidelines) {
        issues.push({
          level: "error",
          code: "unknown-guideline",
          node: node.id,
          file: "params.guidelines",
          message: `node "${node.id}" names unknown guideline "${slug}" — nothing to fold at execution`,
          fix: `use a slug from \`ralphy guideline list\` (${guidelinesDir()}) or drop it from params.guidelines`,
        });
      } else {
        // No guidelines tree at this data root (running outside the repo) —
        // the slug cannot be validated; folding will still fail at execution.
        issues.push({
          level: "warning",
          code: "unknown-guideline",
          node: node.id,
          file: "params.guidelines",
          message: `node "${node.id}" names guideline "${slug}" but no guidelines/ tree exists at ${guidelinesDir()} — the slug cannot be validated (and folding will fail at execution)`,
          fix: "run the lint from a root that carries the guidelines/ tree, or drop params.guidelines",
        });
      }
    }

    // 2. Seed rules over the node's static prompt text.
    const kind = nodePromptKind(node);
    if (!kind) continue; // LLM / control-flow / data nodes: slug check only
    const isVoice = kind === "voiceover";
    const inlineKey = isVoice ? "text" : "prompt";
    const fileKey = isVoice ? "text_file" : "prompt_file";

    let text: string | undefined;
    let file: string;
    const inline = node.params[inlineKey];
    const fileRef = node.params[fileKey];
    if (typeof inline === "string" && inline.trim().length > 0) {
      text = inline;
      file = `params.${inlineKey}`;
    } else if (typeof fileRef === "string" && fileRef.trim().length > 0) {
      const abs = path.isAbsolute(fileRef) ? fileRef : wsDir ? path.join(wsDir, fileRef) : undefined;
      if (!abs || !fs.existsSync(abs)) continue; // unresolvable here — runtime's problem
      text = fs.readFileSync(abs, "utf-8");
      file = fileRef;
    } else {
      continue; // wired in-port / missing — no static text to lint
    }

    const rawModel = typeof node.params.model === "string" ? node.params.model : undefined;
    const model = rawModel ? (resolveModelAlias(rawModel) ?? rawModel) : undefined;
    const findings = lintPromptText(text!, {
      kind,
      model,
      photoreal: nodeIsPhotoreal(node, loaded),
    });
    for (const f of findings) {
      issues.push({
        level: f.level,
        code: "prompt-rule",
        node: node.id,
        file,
        rule: f.rule,
        source: f.source,
        message: `node "${node.id}" (${file}): ${f.message}`,
        fix: f.fix,
      });
    }
  }
  return issues;
}

// ─── Workspace scan (behind `ralphy prompt lint <ws>`) ──────────────────────

export interface WorkflowPromptLint {
  workflow: string;
  path: string;
  issues: PromptLintIssue[];
}

export interface WorkspacePromptLint {
  workspace: string;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  workflows: WorkflowPromptLint[];
}

/**
 * Lint every node-graph workflow's prompts in a workspace (or one workflow
 * via `opts.workflow`). Unparseable / linear / non-graph files are skipped —
 * shape problems are `ralphy workflow lint` territory, not prompt lint's.
 */
export function lintWorkspacePrompts(
  ws: string,
  opts: { workflow?: string } = {},
): WorkspacePromptLint {
  const dir = workflowsDir(ws);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.(json|ya?ml)$/.test(f)).sort()
    : [];
  const workflows: WorkflowPromptLint[] = [];
  for (const f of files) {
    const name = f.replace(/\.(json|ya?ml)$/, "");
    if (opts.workflow && name !== opts.workflow) continue;
    const filePath = path.join(dir, f);
    let graph: WorkflowGraph;
    try {
      const src = fs.readFileSync(filePath, "utf-8");
      const raw = /\.ya?ml$/.test(f) ? parseYaml(src) : JSON.parse(src);
      if (!isWorkflowGraphDocument(raw)) continue;
      graph = parseWorkflowGraph(raw);
    } catch {
      continue;
    }
    workflows.push({
      workflow: name,
      path: filePath,
      issues: lintGraphPrompts(graph, { workspace: ws }),
    });
  }
  const all = workflows.flatMap((w) => w.issues);
  const errorCount = all.filter((i) => i.level === "error").length;
  return {
    workspace: ws,
    ok: errorCount === 0,
    errorCount,
    warningCount: all.length - errorCount,
    workflows,
  };
}
