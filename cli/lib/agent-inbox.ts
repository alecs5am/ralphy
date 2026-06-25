// Agent context-inbox reader (#489) — the CLI read side of the Studio → agent
// handoff. Studio writes packs under `<run|project>/agent-inbox/<id>.{json,md}`
// (see studio/server/inbox.ts); this module lets Claude Code list + load them
// from chat via `ralphy studio inbox`. READ-ONLY: it never writes a pack.
//
// The pack is CONTEXT, not an instruction to spend money — the agent still
// decides and runs the actual ralphy verbs behind the paid-generation gate.

import fs from "node:fs";
import path from "node:path";
import { runsDir, runDir, workspaceDir, currentWorkspace } from "./paths.js";
import { parseInboxPack, AGENT_INBOX_DIR, type InboxPack } from "./schemas/agent-inbox.js";

export interface InboxPackRow {
  id: string;
  scope: "run" | "project";
  scopeId: string;
  workspace: string;
  action: string;
  createdAt: string;
  selectedCount: number;
  requestedOutcome: string;
  jsonPath: string;
  mdPath: string;
}

export interface InboxQuery {
  workspace?: string;
  run?: string;
  project?: string;
}

function inboxDirOf(scopeDir: string): string {
  return path.join(scopeDir, AGENT_INBOX_DIR);
}

/** The (scope, scopeId, dir) tuples to scan for packs given the query. */
function scopeDirs(q: InboxQuery): Array<{ scope: "run" | "project"; scopeId: string; dir: string }> {
  const ws = q.workspace || currentWorkspace();
  const out: Array<{ scope: "run" | "project"; scopeId: string; dir: string }> = [];

  const wantRuns = !q.project; // a --project query skips runs
  const wantProjects = !q.run; // a --run query skips projects

  if (wantRuns) {
    if (q.run) {
      out.push({ scope: "run", scopeId: q.run, dir: runDir(ws, q.run) });
    } else {
      try {
        for (const e of fs.readdirSync(runsDir(ws), { withFileTypes: true })) {
          if (e.isDirectory()) out.push({ scope: "run", scopeId: e.name, dir: runDir(ws, e.name) });
        }
      } catch { /* no runs dir */ }
    }
  }
  if (wantProjects) {
    const projectsRoot = path.join(workspaceDir(ws), "projects");
    if (q.project) {
      out.push({ scope: "project", scopeId: q.project, dir: path.join(projectsRoot, q.project) });
    } else {
      try {
        for (const e of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
          if (e.isDirectory()) out.push({ scope: "project", scopeId: e.name, dir: path.join(projectsRoot, e.name) });
        }
      } catch { /* no projects dir */ }
    }
  }
  return out;
}

function readPacksIn(dir: string): InboxPack[] {
  let files: string[];
  try {
    files = fs.readdirSync(inboxDirOf(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const packs: InboxPack[] = [];
  for (const f of files) {
    try {
      packs.push(parseInboxPack(JSON.parse(fs.readFileSync(path.join(inboxDirOf(dir), f), "utf-8"))));
    } catch { /* skip malformed */ }
  }
  return packs;
}

/** List inbox packs across the queried scopes, newest first. */
export function listInbox(q: InboxQuery = {}): InboxPackRow[] {
  const ws = q.workspace || currentWorkspace();
  const rows: InboxPackRow[] = [];
  for (const { scope, scopeId, dir } of scopeDirs(q)) {
    for (const p of readPacksIn(dir)) {
      rows.push({
        id: p.id,
        scope,
        scopeId,
        workspace: ws,
        action: p.action,
        createdAt: p.createdAt,
        selectedCount: p.selected.length,
        requestedOutcome: p.requestedOutcome,
        jsonPath: path.join(inboxDirOf(dir), `${p.id}.json`),
        mdPath: path.join(inboxDirOf(dir), `${p.id}.md`),
      });
    }
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export interface LoadedInboxPack {
  pack: InboxPack;
  scope: "run" | "project";
  scopeId: string;
  jsonPath: string;
  mdPath: string;
}

/** Find + load a single pack by id across the queried scopes (first match). */
export function loadInbox(id: string, q: InboxQuery = {}): LoadedInboxPack | null {
  for (const { scope, scopeId, dir } of scopeDirs(q)) {
    const jsonPath = path.join(inboxDirOf(dir), `${id}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const pack = parseInboxPack(JSON.parse(fs.readFileSync(jsonPath, "utf-8")));
      return { pack, scope, scopeId, jsonPath, mdPath: path.join(inboxDirOf(dir), `${id}.md`) };
    } catch {
      return null;
    }
  }
  return null;
}
