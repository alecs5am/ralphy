// Studio → agent context inbox (#489) — write side.
//
// When the user selects objects in Studio and picks an action (repair, approve,
// compare, use-as-reference, publish), Studio writes a paired context pack:
//   <scope>/agent-inbox/<id>.json   — the machine-readable pack (#489 schema)
//   <scope>/agent-inbox/<id>.md     — a human/agent-readable mirror
// where <scope> is the active run (runs/<id>/) or the project (<project>/).
//
// METADATA ONLY (AGENTS.md invariant #14) — never touches media. The pack is
// CONTEXT the chat agent reads (here or via `ralphy studio inbox`); execution
// stays with Claude Code behind the paid-generation gate. Studio never runs a
// ralphy verb. Self-contained like the rest of studio/server (no cli import) —
// the canonical schema is cli/lib/schemas/agent-inbox.ts; this writer produces
// exactly that shape.

import path from "node:path";
import fs from "node:fs";
import { projectDir } from "./lib.js";

export const INBOX_ACTIONS = ["repair", "approve", "compare", "use-as-reference", "publish"] as const;
export type InboxAction = (typeof INBOX_ACTIONS)[number];
const ACTION_SET = new Set<string>(INBOX_ACTIONS);

const SELECTION_TYPES = ["run", "project", "workflow_node", "artifact", "eval_finding", "unit", "destination"] as const;
const SELECTION_TYPE_SET = new Set<string>(SELECTION_TYPES);

const AGENT_INBOX_DIR = "agent-inbox";

export type InboxScope =
  | { kind: "project"; dataRoot: string; workspace: string; id: string }
  | { kind: "run"; dataRoot: string; workspace: string; id: string };

type SelectionIn = { type: string; ref: string; tags?: string[]; note?: string };
export type InboxInput = {
  action: string;
  selected: SelectionIn[];
  tags?: string[];
  note?: string;
  requestedOutcome?: string;
};

type Selection = { type: string; ref: string; path?: string; tags: string[]; note?: string };
export type InboxPack = {
  version: 1;
  kind: "agent-inbox";
  id: string;
  action: InboxAction;
  createdAt: string;
  workspace: string;
  run: string | null;
  project: string | null;
  selected: Selection[];
  tags: string[];
  note: string;
  requestedOutcome: string;
};

function runDirOf(dataRoot: string, workspace: string, runId: string): string {
  return path.join(dataRoot, "workspaces", workspace, "runs", runId);
}

function scopeRoot(scope: InboxScope): string | null {
  const dir =
    scope.kind === "project"
      ? projectDir(scope.dataRoot, scope.workspace, scope.id)
      : runDirOf(scope.dataRoot, scope.workspace, scope.id);
  return fs.existsSync(dir) ? dir : null;
}

function refInside(root: string, ref: string): boolean {
  if (!ref || path.isAbsolute(ref)) return false;
  const abs = path.resolve(root, ref);
  return abs === root || abs.startsWith(root + path.sep);
}

/** Repo-root-relative path for `@` paste, e.g. `.ralphy/workspaces/…/hero.png`. */
function repoRelative(dataRoot: string, abs: string): string {
  return path.relative(path.dirname(dataRoot), abs);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mdEscape(s: string): string {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Render the human/agent-readable Markdown mirror of a pack. */
export function renderInboxMarkdown(pack: InboxPack): string {
  const lines: string[] = [];
  lines.push(`# Studio context pack — ${pack.action}`);
  lines.push("");
  lines.push("> This is CONTEXT prepared in Ralphy Studio, not an instruction to spend money.");
  lines.push("> Claude Code decides and runs the actual ralphy verbs, behind the usual approval gate.");
  lines.push("");
  lines.push(`- **action**: ${pack.action}`);
  lines.push(`- **workspace**: ${pack.workspace}`);
  if (pack.run) lines.push(`- **run**: ${pack.run}`);
  if (pack.project) lines.push(`- **project**: ${pack.project}`);
  lines.push(`- **created**: ${pack.createdAt}`);
  if (pack.tags.length) lines.push(`- **tags**: ${pack.tags.join(", ")}`);
  if (pack.requestedOutcome) lines.push(`- **requested outcome**: ${pack.requestedOutcome}`);
  lines.push("");
  if (pack.note) {
    lines.push("## Note");
    lines.push("");
    lines.push(pack.note);
    lines.push("");
  }
  lines.push(`## Selected (${pack.selected.length})`);
  lines.push("");
  lines.push("| type | ref | tags | note | paste |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const s of pack.selected) {
    const paste = s.path ? `\`@${s.path}\`` : "—";
    lines.push(`| ${s.type} | ${mdEscape(s.ref)} | ${s.tags.join(", ") || "—"} | ${mdEscape(s.note || "")} | ${paste} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Write an inbox pack (JSON + Markdown) under the scope's agent-inbox/ dir.
 * Returns the ids/paths + pack, or `{ error }` (mapped to a 400/404 by the HTTP
 * layer). Guards: scope root exists, valid action, ≥1 selection, valid
 * selection types, and artifact refs stay inside the project (no traversal).
 */
export function writeInboxPack(
  scope: InboxScope,
  input: InboxInput,
): { id: string; jsonPath: string; mdPath: string; pack: InboxPack } | { error: string } {
  const root = scopeRoot(scope);
  if (!root) return { error: "unknown scope" };
  if (typeof input.action !== "string" || !ACTION_SET.has(input.action)) return { error: "bad action" };
  if (!Array.isArray(input.selected) || input.selected.length === 0) return { error: "selection is empty" };

  const projRoot = scope.kind === "project" ? root : null;
  const selected: Selection[] = [];
  const tagUnion = new Set<string>(Array.isArray(input.tags) ? input.tags : []);
  for (const s of input.selected) {
    if (!s || typeof s.type !== "string" || !SELECTION_TYPE_SET.has(s.type)) return { error: `bad selection type: ${s?.type}` };
    if (typeof s.ref !== "string" || !s.ref) return { error: "selection ref required" };
    const sel: Selection = { type: s.type, ref: s.ref, tags: Array.isArray(s.tags) ? s.tags : [] };
    if (typeof s.note === "string" && s.note) sel.note = s.note;
    for (const t of sel.tags) tagUnion.add(t);
    if (s.type === "artifact") {
      if (!projRoot) return { error: "artifact selection requires a project scope" };
      if (!refInside(projRoot, s.ref)) return { error: "artifact ref escapes the project" };
      sel.path = repoRelative(scope.dataRoot, path.resolve(projRoot, s.ref));
    } else if (s.type === "unit" && projRoot) {
      sel.path = repoRelative(scope.dataRoot, path.join(projRoot, "units", s.ref));
    }
    selected.push(sel);
  }

  const id = `${stamp()}-${Math.random().toString(36).slice(2, 5)}-${input.action}`;
  const pack: InboxPack = {
    version: 1,
    kind: "agent-inbox",
    id,
    action: input.action as InboxAction,
    createdAt: new Date().toISOString(),
    workspace: scope.workspace,
    run: scope.kind === "run" ? scope.id : null,
    project: scope.kind === "project" ? scope.id : null,
    selected,
    tags: [...tagUnion],
    note: typeof input.note === "string" ? input.note.slice(0, 4000) : "",
    requestedOutcome: typeof input.requestedOutcome === "string" ? input.requestedOutcome.slice(0, 1000) : "",
  };

  const dir = path.join(root, AGENT_INBOX_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, `${id}.json`);
  const mdPath = path.join(dir, `${id}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(pack, null, 2) + "\n");
  fs.writeFileSync(mdPath, renderInboxMarkdown(pack));
  return { id, jsonPath, mdPath, pack };
}

export type InboxRow = { id: string; action: string; createdAt: string; selectedCount: number; requestedOutcome: string };

/** List the packs under a scope's agent-inbox/ dir (newest first). */
export function listInboxPacks(scope: InboxScope): InboxRow[] {
  const root = scopeRoot(scope);
  if (!root) return [];
  const dir = path.join(root, AGENT_INBOX_DIR);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const rows: InboxRow[] = [];
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      rows.push({
        id: String(p.id ?? f.replace(/\.json$/, "")),
        action: String(p.action ?? ""),
        createdAt: String(p.createdAt ?? ""),
        selectedCount: Array.isArray(p.selected) ? p.selected.length : 0,
        requestedOutcome: String(p.requestedOutcome ?? ""),
      });
    } catch {
      /* skip a malformed pack */
    }
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** One pack by id (the full #489 JSON). Null when the scope or the pack is unknown. */
export function showInboxPack(scope: InboxScope, id: string): InboxPack | null {
  const root = scopeRoot(scope);
  if (!root) return null;
  // Ids are basenames only — reject anything with a path separator / traversal.
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  try {
    const pack = JSON.parse(fs.readFileSync(path.join(root, AGENT_INBOX_DIR, `${id}.json`), "utf-8"));
    return pack && typeof pack === "object" ? (pack as InboxPack) : null;
  } catch {
    return null;
  }
}
