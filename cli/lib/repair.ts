// Deterministic eval-to-repair plan builder (#409).
//
// The evaluator stops at the report (correct separation). The FIXER is the
// consumer: it reads the eval output, classifies each finding by the role that
// owns the fix, ranks the findings by impact, and emits an ordered RepairPlan
// the agent presents to the user BEFORE any paid regeneration.
//
// Everything here is PURE + DETERMINISTIC — no LLM, no network, no disk writes.
// `ralphy project repair-plan <id>` is the only caller that touches disk (it
// reads eval.json / eval-deep-vision.json and writes repair-plan.json), and it
// makes ZERO model calls. The deterministic guarantee is the load-bearing one:
// the repair plan must be reproducible and free so the fixer can gate cost on
// the user's approval, not on a paid classification pass.
//
// Two inputs, one preferred:
//   • eval-deep-vision.json.parsed.what_to_redo — when present, this is the
//     model's own prioritized, project-specific redo list. Prefer it.
//   • eval.json.findings[] — the deterministic structural/audio/caption/vision
//     findings. The fallback, and the source of the global checks the deep
//     pass doesn't cover (loudness, dead-air, resolution).

import type { EvalReport, Finding, Severity, Verdict } from "./eval/types.js";
import type {
  RepairItem,
  RepairOwner,
  RepairPlan,
  RepairRisk,
  RepairSeverity,
  RepairSource,
} from "./schemas/repair-plan.js";

// ─── Owner classification ─────────────────────────────────────────────────────
//
// Deterministic category → owner map. Covers EVERY category that
// `cli/lib/eval/findings.ts` and `cli/lib/eval/deep-vision.ts` can emit. The
// split:
//
//   art-director — anything the LOOK/PROMPT/MODEL produced wrong: style /
//     register / aesthetic mechanism, AI artifacts, brand violations, visual
//     quality, composition, on-frame text, brief-intent drift (the render
//     didn't say what the brief asked → re-anchor the visuals/prompts).
//
//   scenarist — STRUCTURE that is a SCRIPT problem: the hook is thin / empty /
//     static (re-script the opening beat), duration drift (re-time the
//     scenario to actual VO), thin-VO hook (rewrite the opening line). These
//     are "the plan was wrong", not "the cut was wrong".
//
//   editor — everything the CUT / ENCODE / MIX owns: audio loudness, true-peak,
//     dead-air, caption density / availability, container format (resolution /
//     fps / aspect), and the deep-vision timing findings (pacing of an existing
//     cut). These are post-generation, no re-roll needed.
//
// Structure split rationale (documented per the issue): structure findings that
// are SCRIPT/PLAN problems (duration vs declared, hook-zone VO/script) go to the
// scenarist; structure findings that are purely a CUT decision (a missing cut in
// the hook zone — "add a sub-cut") could be editor, but the canonical fix for an
// empty/static hook in this pipeline is re-scripting the opening beat (the
// scenarist owns the scene boundaries that drive the cut). So ALL `structure.*`
// → scenarist for a single clear owner; the editor still owns `style.timing-*`
// (the deep-vision pacing call on an already-cut render). Unknown → editor with
// a note (the editor is the safest catch-all: a recut is the least destructive
// and never spends on a re-roll).

const ART_DIRECTOR_PREFIXES = ["style.", "brief.", "vision."] as const;
const SCENARIST_PREFIXES = ["structure."] as const;
const EDITOR_PREFIXES = ["audio.", "captions.", "format."] as const;

/**
 * Classify a finding category to the role that owns the fix. Deterministic and
 * total: every known category resolves to exactly one owner, and any unknown
 * category defaults to `editor` (the least-destructive, never-pays catch-all).
 *
 * Exact-category overrides take precedence over prefix matches, so a future
 * category that needs a different owner than its family can be pinned here.
 */
export function classifyFindingOwner(category: string): RepairOwner {
  // Exact-category overrides (none today, but the hook is here for future
  // categories that break from their prefix family).
  const EXACT: Record<string, RepairOwner> = {};
  if (category in EXACT) return EXACT[category];

  // `vision.*` and `style.*` and `brief.*` → art-director.
  for (const p of ART_DIRECTOR_PREFIXES) {
    if (category.startsWith(p)) return "art-director";
  }
  // `structure.*` → scenarist.
  for (const p of SCENARIST_PREFIXES) {
    if (category.startsWith(p)) return "scenarist";
  }
  // `audio.*` / `captions.*` / `format.*` → editor.
  for (const p of EDITOR_PREFIXES) {
    if (category.startsWith(p)) return "editor";
  }
  // Unknown category → editor (catch-all, documented above).
  return "editor";
}

/** True when the owner classification of `category` is the documented default
 *  (unknown category → editor), so callers can annotate the item. */
export function isUnknownCategory(category: string): boolean {
  const known = [
    ...ART_DIRECTOR_PREFIXES,
    ...SCENARIST_PREFIXES,
    ...EDITOR_PREFIXES,
  ];
  return !known.some((p) => category.startsWith(p));
}

// ─── Severity / risk / priority heuristics ─────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { fail: 0, warn: 1, info: 2 };

/**
 * Coarse re-roll risk per owner. Re-generating visuals can drift identity
 * (art-director = medium); script rewrites are cheap to review (scenarist =
 * low); a deterministic recut / loudnorm is the safest of all (editor = low).
 * A `fail`-severity item bumps one notch (a fail is worth a closer look).
 */
function riskFor(owner: RepairOwner, severity: Severity): RepairRisk {
  const base: RepairRisk = owner === "art-director" ? "medium" : "low";
  if (severity === "fail" && base === "medium") return "high";
  if (severity === "fail" && base === "low") return "medium";
  return base;
}

/**
 * Best-effort USD cost of applying the fix. Edit-only / encode-only fixes are
 * free (the editor recut, the scenarist rewrite both cost $0 of model calls; a
 * `fixCommand` that is an `ffmpeg` recipe is free too). Art-director re-rolls
 * cost a model call — a coarse $0.10 ballpark per affected slot keeps the plan
 * honest without pretending precision the deterministic builder can't have.
 */
function costFor(owner: RepairOwner, fixCommand: string | null): number {
  if (owner !== "art-director") return 0;
  // An art-director item with a `ralphy generate` command implies a paid
  // re-roll. Without an explicit command, the agent still likely re-generates a
  // keyframe — keep the ballpark.
  return 0.1;
}

// ─── Target derivation ──────────────────────────────────────────────────────

/**
 * Derive a target slot / file from a finding. Scene-indexed findings name their
 * scene (`scene-NN`); deep-vision redos name their `target` (start-frame /
 * end-frame / audio / …). Global findings (loudness, resolution) have no slot.
 */
function targetFromFinding(f: Finding): string | null {
  if (typeof f.sceneIndex === "number") {
    return `scene-${String(f.sceneIndex).padStart(2, "0")}`;
  }
  return null;
}

// ─── Deep-vision what_to_redo shape (read directly off the on-disk JSON) ────────
//
// `eval-deep-vision.json` is `{ model, parsed: DeepFindingsShape, raw }`. We
// only need the prioritized `what_to_redo[]` here — each item is
// `{ priority: 1|2|3, target, action, rationale }`. We map `target` → owner and
// `priority` → severity so deep-vision redos slot into the same RepairItem
// shape as the deterministic findings.

export interface DeepVisionWhatToRedoItem {
  priority?: 1 | 2 | 3 | number;
  target?: string;
  action?: string;
  rationale?: string;
}

export interface DeepVisionFile {
  model?: string;
  parsed?: {
    overall_verdict?: "pass" | "warn" | "fail";
    what_to_redo?: DeepVisionWhatToRedoItem[];
  } | null;
  raw?: string;
}

/**
 * The deep-vision `target` enum (start-frame / end-frame / i2v / audio /
 * scene-prompt / model-swap / regen-entire) → owner. start/end-frame, i2v,
 * scene-prompt, model-swap, regen-entire are all visual re-generation
 * (art-director); audio is the editor; anything else defaults to art-director
 * (the deep pass is a visual critique — its redos are overwhelmingly visual).
 */
function ownerFromDeepTarget(target: string | undefined): RepairOwner {
  const t = (target ?? "").toLowerCase();
  if (t === "audio") return "editor";
  return "art-director";
}

/** deep-vision priority (1=critical) → eval Severity. */
function severityFromDeepPriority(priority: number | undefined): Severity {
  if (priority === 1) return "fail";
  if (priority === 2) return "warn";
  return "info";
}

// ─── Plan builder ─────────────────────────────────────────────────────────────

/**
 * Build a deterministic RepairPlan from an eval report and, when present, the
 * deep-vision file. Prefers `deepVision.parsed.what_to_redo` as the item source
 * (the model's project-specific prioritized list); otherwise uses
 * `evalReport.findings[]`.
 *
 * The result is fully ordered by `priority` (1 = act first): fail before warn
 * before info, and deep-vision priority-1 redos float to the very top. Every
 * item is born `approvalState: "pending"` — there is no auto-approve path.
 *
 * PURE: no LLM, no disk, no clock except the `generatedAt` default the schema
 * supplies. Callers that need a stable timestamp pass `now`.
 */
export function buildRepairPlan(
  evalReport: EvalReport,
  deepVision?: DeepVisionFile | null,
  opts: { now?: string } = {},
): RepairPlan {
  const now = opts.now ?? new Date().toISOString();
  const verdict: Verdict | null = evalReport?.scoring?.verdict ?? null;

  const hasDeepRedos =
    !!deepVision?.parsed?.what_to_redo &&
    Array.isArray(deepVision.parsed.what_to_redo) &&
    deepVision.parsed.what_to_redo.length > 0;

  const sourcePreferred: RepairSource = hasDeepRedos ? "deep-vision" : "findings";

  const items: RepairItem[] = hasDeepRedos
    ? itemsFromDeepVision(deepVision!.parsed!.what_to_redo!)
    : itemsFromFindings(evalReport?.findings ?? []);

  // Deterministic ordering: severity rank (fail<warn<info) is the primary key;
  // a deep-vision priority (1<2<3) refines within source; the finding id is the
  // stable tiebreaker so the order never depends on input array order.
  items.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity];
    const sb = SEVERITY_RANK[b.severity];
    if (sa !== sb) return sa - sb;
    return a.findingId.localeCompare(b.findingId, "en");
  });
  // Assign the final 1-based priority AFTER sorting so it reflects the
  // presented order exactly.
  items.forEach((it, i) => {
    it.priority = i + 1;
  });

  const byOwner: Record<RepairOwner, string[]> = {
    "art-director": [],
    scenarist: [],
    editor: [],
  };
  for (const it of items) byOwner[it.owner].push(it.findingId);

  const totalCostEstimate = Number(
    items.reduce((sum, it) => sum + it.costEstimate, 0).toFixed(2),
  );

  // Strip empty owner buckets so the artifact stays terse.
  const byOwnerOut: Partial<Record<RepairOwner, string[]>> = {};
  for (const [owner, ids] of Object.entries(byOwner) as Array<[RepairOwner, string[]]>) {
    if (ids.length) byOwnerOut[owner] = ids;
  }

  return {
    version: 1,
    projectId: evalReport?.meta?.projectId ?? "",
    generatedAt: now,
    sourceVerdict: verdict,
    sourcePreferred,
    items,
    byOwner: byOwnerOut as Record<RepairOwner, string[]>,
    totalCostEstimate,
    approvalGate:
      "No paid model regeneration runs until the user approves this plan (or previously opted into batch repair). Every item starts approvalState=pending.",
  };
}

/** Map raw eval findings → RepairItems (priority is assigned later by the sort). */
function itemsFromFindings(findings: Finding[]): RepairItem[] {
  return findings.map((f) => {
    const owner = classifyFindingOwner(f.category);
    const unknown = isUnknownCategory(f.category);
    const proposed =
      f.fixCommand ??
      (unknown
        ? `${f.fixHint} (no specific owner matched category "${f.category}" — routed to editor as the safe catch-all; confirm before acting)`
        : f.fixHint);
    return {
      findingId: f.id,
      category: f.category,
      severity: f.severity as RepairSeverity,
      owner,
      source: "findings" as RepairSource,
      targetSlotOrFile: targetFromFinding(f),
      proposedCommandOrEdit: proposed && proposed.trim().length > 0 ? proposed : "Review the flagged item and address it.",
      costEstimate: costFor(owner, f.fixCommand),
      risk: riskFor(owner, f.severity),
      approvalState: "pending" as const,
      // Placeholder — overwritten by the post-sort priority assignment.
      priority: 1,
      message: f.message,
    };
  });
}

/** Map deep-vision what_to_redo[] → RepairItems. */
function itemsFromDeepVision(redos: DeepVisionWhatToRedoItem[]): RepairItem[] {
  return redos.map((r, i) => {
    const owner = ownerFromDeepTarget(r.target);
    const severity = severityFromDeepPriority(
      typeof r.priority === "number" ? r.priority : undefined,
    );
    const action = (r.action ?? "").trim();
    const rationale = (r.rationale ?? "").trim();
    const proposed =
      action.length > 0
        ? `${action}${rationale ? ` — ${rationale}` : ""}`
        : "Re-do the flagged element per the deep-vision critique.";
    // Deep-vision categories namespace under `style.*` (the visual-critique
    // family) except the audio target → `audio.mix`.
    const category =
      owner === "editor" ? "audio.mix" : `style.redo-${(r.target ?? "visual").toLowerCase()}`;
    return {
      // Stable synthetic id — deep-vision redos have no upstream finding id.
      findingId: `R${i + 1}`,
      category,
      severity: severity as RepairSeverity,
      owner,
      source: "deep-vision" as RepairSource,
      targetSlotOrFile: r.target ?? null,
      proposedCommandOrEdit: proposed,
      costEstimate: costFor(owner, null),
      risk: riskFor(owner, severity),
      approvalState: "pending" as const,
      priority: 1,
      message: action,
    };
  });
}

// ─── Markdown rendering ─────────────────────────────────────────────────────

/** Render a human-readable REPAIR_PLAN.md from a RepairPlan. */
export function renderRepairPlanMarkdown(plan: RepairPlan): string {
  const lines: string[] = [];
  lines.push(`# Repair plan — ${plan.projectId || "(standalone)"}`);
  lines.push("");
  lines.push(`> Generated: ${plan.generatedAt}`);
  lines.push(`> Source eval verdict: **${plan.sourceVerdict ?? "unknown"}**`);
  lines.push(`> Built from: **${plan.sourcePreferred}** (${plan.items.length} item${plan.items.length === 1 ? "" : "s"})`);
  lines.push(`> Worst-case repair spend: **$${plan.totalCostEstimate.toFixed(2)}**`);
  lines.push("");
  lines.push(`**Approval gate:** ${plan.approvalGate}`);
  lines.push("");

  if (plan.items.length === 0) {
    lines.push("No findings to repair — the eval surfaced nothing actionable.");
    lines.push("");
    return lines.join("\n");
  }

  const owners: RepairOwner[] = ["art-director", "scenarist", "editor"];
  const ownerLabel: Record<RepairOwner, string> = {
    "art-director": "Art director (regen visuals / prompts)",
    scenarist: "Scenarist (re-script / re-time)",
    editor: "Editor (recut / re-encode / mix / captions)",
  };

  for (const owner of owners) {
    const owned = plan.items.filter((it) => it.owner === owner);
    if (owned.length === 0) continue;
    lines.push(`## ${ownerLabel[owner]}`);
    lines.push("");
    for (const it of owned) {
      lines.push(
        `- **[P${it.priority}] ${it.findingId}** \`${it.category}\` (${it.severity}, risk: ${it.risk}, ~$${it.costEstimate.toFixed(2)})`,
      );
      if (it.targetSlotOrFile) lines.push(`  - Target: \`${it.targetSlotOrFile}\``);
      if (it.message) lines.push(`  - Issue: ${it.message}`);
      lines.push(`  - Fix: ${it.proposedCommandOrEdit}`);
      lines.push(`  - Approval: ${it.approvalState}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "Apply fixes through the existing `ralphy` verbs only (art-director regen / scenarist rewrite / editor recut), then re-render and re-eval to compare verdicts. Do not run any paid generation until the user approves the items above.",
  );
  lines.push("");
  return lines.join("\n");
}
