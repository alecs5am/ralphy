// One-pass layout migration (#106): legacy `workspace/` root → `.ralphy/`
// (#108 end state) + per-project `assets/`+`refs/` → `artifacts/` (#105 end
// state), in a single idempotent, dry-runnable pass.
//
// IMPORTANT: this module does its own path math against the raw root instead
// of using the helpers in `paths.ts`. The helpers are single-path (new scheme
// only) since #106 and fail fast on a legacy root; the migration must see BOTH
// trees at once, independent of `layoutMode()` caching mid-move.
//
// Append-only note (AGENTS.md invariant #14): the path-string rewrites in
// `asset-manifest.json`, `logs/*.jsonl`, `units/*/unit.json` and the HTML
// compositions are a STRUCTURAL RELOCATION — the path strings follow the files
// they point at — not a content edit. JSONL logs are rewritten strictly
// line-by-line: never dropped, filtered, or reordered; line counts are
// preserved bit-for-bit except for the rewritten path substrings.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const DEFAULT_WS = "default";

// OS-cruft basenames that are pruned (never moved, never reported as
// unclassified) so an otherwise-empty legacy tree still collapses on migrate.
// Mirrors `cli/lib/unpack-zip.ts → NOISE_BASENAMES`.
const NOISE_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

// ─── Report shapes ───────────────────────────────────────────────────────────

export interface RootMove {
  from: string;
  to: string;
  status: "planned" | "moved" | "merged" | "skipped";
  reason?: string;
}

export interface ProjectReport {
  id: string;
  files_moved: number;
  manifest_rewrites: number;
  log_line_rewrites: number;
  html_rewrites: number;
  unit_rewrites: number;
  collisions: string[];
  skipped?: string;
}

export interface MigrateReport {
  mode: "dry-run" | "run";
  already_migrated?: boolean;
  root_moves: RootMove[];
  projects: ProjectReport[];
  unclassified: string[];
  skipped: Array<{ path: string; reason: string }>;
  registry?: {
    workspace_field_set: number;
    active_workspace_set: boolean;
    workspace_manifest_written: boolean;
  };
}

/** Typed refusal the command layer maps onto `raiseError(code, ctx)`. */
export class MigrateRefusal extends Error {
  constructor(
    public readonly errorCode:
      | "E_INPUT_INVALID"
      | "E_VALIDATION_FAILED"
      | "E_NOT_FOUND"
      | "E_JOBS_IN_FLIGHT",
    public readonly ctx: Record<string, string | number>,
  ) {
    super(`${errorCode}: ${JSON.stringify(ctx)}`);
    this.name = "MigrateRefusal";
  }
}

// ─── In-flight job detection ─────────────────────────────────────────────────

/**
 * Detect a running daemon with running/pending jobs at either the legacy
 * (`workspace/.ralph/`) or the new (`.ralphy/`) engine-state location.
 * Read-only: never creates the jobs DB or its parent dirs (unlike
 * `cli/lib/jobs/db.ts → openDb()`, which mkdirs).
 */
export async function detectInFlightJobs(
  rootDir: string,
): Promise<{ pid: number; running: number; pending: number } | null> {
  const stateDirs = [path.join(rootDir, "workspace", ".ralph"), path.join(rootDir, ".ralphy")];
  let livePid: number | null = null;
  for (const dir of stateDirs) {
    const pidFile = path.join(dir, "daemon.pid");
    if (!existsSync(pidFile)) continue;
    let pid: number;
    try {
      pid = Number((await fs.readFile(pidFile, "utf-8")).trim());
    } catch {
      continue;
    }
    if (!Number.isFinite(pid) || pid <= 0) continue;
    try {
      process.kill(pid, 0); // alive check, no signal delivered
    } catch {
      continue; // stale pidfile → not running
    }
    livePid = pid;
    break;
  }
  if (livePid === null) return null;

  let running = 0;
  let pending = 0;
  const seen = new Set<string>();
  for (const dir of stateDirs) {
    for (const fileName of ["ralphy.db", "jobs.db"]) {
      const dbFile = path.join(dir, fileName);
      if (!existsSync(dbFile)) continue;
      try {
        const canonicalFile = await fs.realpath(dbFile);
        if (seen.has(canonicalFile)) continue;
        seen.add(canonicalFile);
        const { Database } = await import("bun:sqlite");
        const db = new Database(canonicalFile, { readonly: true });
        try {
          const row = db
            .query(
              "SELECT SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending FROM jobs",
            )
            .get() as { running: number | null; pending: number | null } | null;
          running += row?.running ?? 0;
          pending += row?.pending ?? 0;
        } finally {
          db.close();
        }
      } catch {
        /* unreadable db → count only the queue state we can prove */
      }
    }
  }
  return running + pending > 0 ? { pid: livePid, running, pending } : null;
}

// ─── fs primitives ───────────────────────────────────────────────────────────

/** `fs.rename` with EXDEV (cross-device) copy+rm fallback. */
async function renameSafe(src: string, dst: string): Promise<void> {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fs.rename(src, dst);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.cp(src, dst, { recursive: true });
      await fs.rm(src, { recursive: true, force: true });
      return;
    }
    throw e;
  }
}

async function countFilesRecursive(dir: string): Promise<number> {
  let n = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) n += await countFilesRecursive(p);
      else n++;
    }
  } catch {
    /* missing dir */
  }
  return n;
}

/**
 * Merge `src` into an existing `dst` file-by-file. NEVER overwrites an
 * existing destination file — a collision keeps the destination copy in place
 * and leaves the source copy untouched (reported). Returns moved-file count +
 * the collision list (src-relative paths).
 */
async function mergeDirInto(
  src: string,
  dst: string,
  dry: boolean,
): Promise<{ moved: number; collisions: string[] }> {
  let moved = 0;
  const collisions: string[] = [];
  async function walk(rel: string): Promise<void> {
    const srcDir = path.join(src, rel);
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      const s = path.join(src, childRel);
      const d = path.join(dst, childRel);
      if (e.isDirectory()) {
        if (!existsSync(d)) {
          moved += await countFilesRecursive(s);
          if (!dry) await renameSafe(s, d);
        } else {
          await walk(childRel);
        }
      } else {
        if (existsSync(d)) {
          collisions.push(childRel);
        } else {
          moved++;
          if (!dry) await renameSafe(s, d);
        }
      }
    }
  }
  await walk("");
  return { moved, collisions };
}

/** Remove a dir tree only if it contains no files (prunes empty subdirs). */
async function removeIfEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let empty = true;
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!(await removeIfEmpty(path.join(dir, e.name)))) empty = false;
    } else {
      empty = false;
    }
  }
  if (empty) await fs.rmdir(dir);
  return empty;
}

// ─── Path-string rewriting ───────────────────────────────────────────────────

/**
 * Rewrite a single path-valued string for project `projectId`:
 *   - leading `assets/...` → `artifacts/...`
 *   - leading `refs/...` → `artifacts/refs/...`
 *   - `<...>/projects/<id>/assets/` → `<...>/projects/<id>/artifacts/`
 *   - `<...>/projects/<id>/refs/` → `<...>/projects/<id>/artifacts/refs/`
 *   - `workspace/projects/<id>/` → `.ralphy/workspaces/default/projects/<id>/`
 *     (rooted strings follow the project dir to its new home)
 * Non-path strings come back unchanged; already-migrated strings are stable
 * (idempotent).
 */
export function rewritePathString(s: string, projectId: string): string {
  let r = s;
  if (r.startsWith("assets/")) r = "artifacts/" + r.slice("assets/".length);
  else if (r.startsWith("refs/")) r = "artifacts/refs/" + r.slice("refs/".length);
  const projAssets = `/projects/${projectId}/assets/`;
  const projRefs = `/projects/${projectId}/refs/`;
  if (r.includes(projAssets)) r = r.split(projAssets).join(`/projects/${projectId}/artifacts/`);
  if (r.includes(projRefs)) r = r.split(projRefs).join(`/projects/${projectId}/artifacts/refs/`);
  const oldRooted = `workspace/projects/${projectId}/`;
  if (r.includes(oldRooted)) {
    r = r.split(oldRooted).join(`.ralphy/workspaces/${DEFAULT_WS}/projects/${projectId}/`);
  }
  return r;
}

/** Recursively rewrite every string field of a JSON value. Returns the count of changed strings. */
function rewriteJsonValue(node: unknown, projectId: string, counter: { n: number }): unknown {
  if (typeof node === "string") {
    const r = rewritePathString(node, projectId);
    if (r !== node) counter.n++;
    return r;
  }
  if (Array.isArray(node)) return node.map((v) => rewriteJsonValue(v, projectId, counter));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = rewriteJsonValue(v, projectId, counter);
    }
    return out;
  }
  return node;
}

async function rewriteJsonFile(file: string, projectId: string, dry: boolean): Promise<number> {
  if (!existsSync(file)) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return 0; // malformed → leave untouched
  }
  const counter = { n: 0 };
  const rewritten = rewriteJsonValue(parsed, projectId, counter);
  if (counter.n > 0 && !dry) {
    await fs.writeFile(file, JSON.stringify(rewritten, null, 2) + "\n");
  }
  return counter.n;
}

/**
 * Rewrite path strings inside a JSONL log, strictly line-by-line. Lines are
 * never dropped, filtered, or reordered (append-only invariant #14 — this is
 * a structural relocation, the path strings follow their files). Unparseable
 * lines pass through verbatim. Returns the count of CHANGED lines.
 */
async function rewriteJsonlFile(file: string, projectId: string, dry: boolean): Promise<number> {
  if (!existsSync(file)) return 0;
  const raw = await fs.readFile(file, "utf-8");
  const hadTrailingNewline = raw.endsWith("\n");
  const lines = hadTrailingNewline ? raw.slice(0, -1).split("\n") : raw.split("\n");
  let changed = 0;
  const out = lines.map((line) => {
    if (!line.trim().startsWith("{")) return line;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return line;
    }
    const counter = { n: 0 };
    const rewritten = rewriteJsonValue(parsed, projectId, counter);
    if (counter.n === 0) return line;
    changed++;
    return JSON.stringify(rewritten);
  });
  if (changed > 0 && !dry) {
    await fs.writeFile(file, out.join("\n") + (hadTrailingNewline ? "\n" : ""));
  }
  return changed;
}

/**
 * Rewrite `assets/` → `artifacts/` and `refs/` → `artifacts/refs/` occurrences
 * in an HTML composition so media srcs keep resolving. Guarded so existing
 * `artifacts/refs/` strings are not double-rewritten. Returns replacement count.
 */
export function rewriteHtmlContent(content: string): { content: string; count: number } {
  let count = 0;
  let out = content.replace(/(?<![\w-])assets\//g, () => {
    count++;
    return "artifacts/";
  });
  out = out.replace(/(?<![\w-])(?<!artifacts\/)refs\//g, () => {
    count++;
    return "artifacts/refs/";
  });
  return { content: out, count };
}

async function rewriteHtmlFile(file: string, dry: boolean): Promise<number> {
  if (!existsSync(file)) return 0;
  const raw = await fs.readFile(file, "utf-8");
  const { content, count } = rewriteHtmlContent(raw);
  if (count > 0 && !dry) await fs.writeFile(file, content);
  return count;
}

// ─── Per-project inner move (#105 end state) ────────────────────────────────

/**
 * Move one project's media tree to `artifacts/` and rewrite every path string
 * that pointed into `assets/` / `refs/`. Preserves `.vN` version siblings and
 * `old/` archive subfolders byte-identically (whole-dir rename when possible;
 * file-by-file merge that never overwrites otherwise).
 */
export async function migrateProjectInner(
  projAbs: string,
  projectId: string,
  dry: boolean,
): Promise<ProjectReport> {
  const report: ProjectReport = {
    id: projectId,
    files_moved: 0,
    manifest_rewrites: 0,
    log_line_rewrites: 0,
    html_rewrites: 0,
    unit_rewrites: 0,
    collisions: [],
  };

  const assetsDir = path.join(projAbs, "assets");
  const refsDir = path.join(projAbs, "refs");
  const artifactsDir = path.join(projAbs, "artifacts");

  const hasAssets = existsSync(assetsDir);
  const hasRefs = existsSync(refsDir);
  if (!hasAssets && !hasRefs) {
    report.skipped = existsSync(artifactsDir)
      ? "already migrated (artifacts/ present, assets/ + refs/ absent)"
      : "no media tree (no assets/, refs/, or artifacts/)";
    return report;
  }

  // assets/<kind>/* → artifacts/<kind>/* (every kind, unknown subdirs incl.).
  if (hasAssets) {
    if (!existsSync(artifactsDir)) {
      report.files_moved += await countFilesRecursive(assetsDir);
      if (!dry) await renameSafe(assetsDir, artifactsDir);
    } else {
      const m = await mergeDirInto(assetsDir, artifactsDir, dry);
      report.files_moved += m.moved;
      report.collisions.push(...m.collisions.map((c) => path.join("assets", c)));
    }
  }

  // refs/* → artifacts/refs/*
  if (hasRefs) {
    const targetRefs = path.join(projAbs, "artifacts", "refs");
    if (!existsSync(targetRefs)) {
      report.files_moved += await countFilesRecursive(refsDir);
      if (!dry) await renameSafe(refsDir, targetRefs);
    } else {
      const m = await mergeDirInto(refsDir, targetRefs, dry);
      report.files_moved += m.moved;
      report.collisions.push(...m.collisions.map((c) => path.join("refs", c)));
    }
  }

  // Path-string rewrites — structural relocation, not a content edit (#14).
  report.manifest_rewrites = await rewriteJsonFile(
    path.join(projAbs, "asset-manifest.json"),
    projectId,
    dry,
  );
  for (const log of ["generations.jsonl", "user-assets.jsonl"]) {
    report.log_line_rewrites += await rewriteJsonlFile(
      path.join(projAbs, "logs", log),
      projectId,
      dry,
    );
  }
  // units/*/unit.json provenance strings
  try {
    const unitDirs = await fs.readdir(path.join(projAbs, "units"), { withFileTypes: true });
    for (const u of unitDirs) {
      if (!u.isDirectory()) continue;
      report.unit_rewrites += await rewriteJsonFile(
        path.join(projAbs, "units", u.name, "unit.json"),
        projectId,
        dry,
      );
    }
  } catch {
    /* no units/ */
  }
  // index.html + compositions/*.html (POSTMORTEM.md / postmortem/ stay untouched)
  report.html_rewrites += await rewriteHtmlFile(path.join(projAbs, "index.html"), dry);
  try {
    const comps = await fs.readdir(path.join(projAbs, "compositions"), { withFileTypes: true });
    for (const cEntry of comps) {
      if (!cEntry.isFile() || !cEntry.name.endsWith(".html")) continue;
      report.html_rewrites += await rewriteHtmlFile(
        path.join(projAbs, "compositions", cEntry.name),
        dry,
      );
    }
  } catch {
    /* no compositions/ */
  }

  // Drop now-empty assets/ + refs/ (collided leftovers keep the dir alive).
  if (!dry) {
    if (hasAssets) await removeIfEmpty(assetsDir).catch(() => false);
    if (hasRefs) await removeIfEmpty(refsDir).catch(() => false);
  }
  return report;
}

// ─── Root + workspace move (#108 end state) ─────────────────────────────────

// Known engine-state entries under workspace/.ralph/ and their new home,
// relative to .ralphy/. Anything not listed routes to `.ralphy/<basename>`
// and is reported as "unclassified" (never dropped).
const RALPH_ENTRY_MAP: Record<string, string[]> = {
  "registry.json": ["registry.json"],
  "config.json": ["config.json"],
  "asset-cache": ["cache", "assets"],
  "library-cache": ["cache", "library"],
  "svg-cache": ["cache", "svg"],
  brands: ["workspaces", DEFAULT_WS, "shared", "brands"],
  personas: ["workspaces", DEFAULT_WS, "shared", "personas"],
  refs: ["workspaces", DEFAULT_WS, "shared", "refs"],
  research: ["research", "jobs"], // deep-research job state → researchJobsDir()
  // Engine scratch that lives at the .ralphy/ top level (ralphDir()):
  "jobs.db": ["jobs.db"],
  "jobs.db-wal": ["jobs.db-wal"],
  "jobs.db-shm": ["jobs.db-shm"],
  "job-logs": ["job-logs"],
  "daemon.pid": ["daemon.pid"],
  "daemon.log": ["daemon.log"],
  "or-catalog.json": ["or-catalog.json"],
};

// Known top-level workspace/ entries and their new home relative to .ralphy/.
const TOP_ENTRY_MAP: Record<string, string[]> = {
  templates: ["workspaces", DEFAULT_WS, "templates"],
  batches: ["workspaces", DEFAULT_WS, "batches"],
  research: ["research"], // topic-level research output stays global
  references: ["references"], // global per-URL reference artifacts
};

async function executeMove(
  src: string,
  dst: string,
  rootDir: string,
  dry: boolean,
  skippedSink: Array<{ path: string; reason: string }>,
): Promise<RootMove> {
  const rel = (p: string) => path.relative(rootDir, p);
  const move: RootMove = { from: rel(src), to: rel(dst), status: dry ? "planned" : "moved" };
  if (!existsSync(src)) {
    move.status = "skipped";
    move.reason = "source missing";
    return move;
  }
  if (existsSync(dst)) {
    const srcIsDir = (await fs.stat(src)).isDirectory();
    const dstIsDir = (await fs.stat(dst)).isDirectory();
    if (srcIsDir && dstIsDir) {
      const m = await mergeDirInto(src, dst, dry);
      for (const c of m.collisions) {
        skippedSink.push({
          path: path.join(rel(src), c),
          reason: "destination file exists (kept destination copy)",
        });
      }
      if (!dry) await removeIfEmpty(src).catch(() => false);
      move.status = dry ? "planned" : "merged";
      move.reason = `merged into existing dir (${m.moved} file(s)${m.collisions.length ? `, ${m.collisions.length} collision(s)` : ""})`;
      return move;
    }
    move.status = "skipped";
    move.reason = "destination exists (kept destination copy)";
    skippedSink.push({ path: rel(src), reason: "destination exists (kept destination copy)" });
    return move;
  }
  if (!dry) await renameSafe(src, dst);
  return move;
}

export interface MigrateOptions {
  rootDir: string;
  dryRun: boolean;
  /** Scope to ONE project's inner artifacts/ move; requires the root move done. */
  projectId?: string;
}

export async function runMigration(opts: MigrateOptions): Promise<MigrateReport> {
  const { rootDir, dryRun } = opts;
  const legacyRoot = path.join(rootDir, "workspace");
  const newRoot = path.join(rootDir, ".ralphy");
  const report: MigrateReport = {
    mode: dryRun ? "dry-run" : "run",
    root_moves: [],
    projects: [],
    unclassified: [],
    skipped: [],
  };

  if (!existsSync(legacyRoot) && !existsSync(newRoot)) {
    throw new MigrateRefusal("E_INPUT_INVALID", {
      field: "root",
      detail: `nothing to migrate: neither workspace/ nor .ralphy/ exists under ${rootDir}`,
      verb: "migrate",
    });
  }

  // Refuse while generation jobs are in flight (#17 background-job hygiene):
  // the migration would move the very files those jobs read lazily.
  const inFlight = await detectInFlightJobs(rootDir);
  if (inFlight) {
    throw new MigrateRefusal("E_JOBS_IN_FLIGHT", {
      verb: "migrate",
      count: inFlight.running + inFlight.pending,
      pid: inFlight.pid,
    });
  }

  // ── --project scoping: inner artifacts/ move only ──────────────────────
  if (opts.projectId) {
    const rootMoved =
      existsSync(path.join(newRoot, "workspaces")) &&
      !existsSync(path.join(legacyRoot, "projects"));
    if (!rootMoved) {
      throw new MigrateRefusal("E_VALIDATION_FAILED", {
        target: "--project",
        detail:
          "the root move has not run yet — `--project` scopes the inner artifacts/ move only; run a full `ralphy migrate` first",
      });
    }
    let projAbs: string | null = null;
    try {
      for (const slug of await fs.readdir(path.join(newRoot, "workspaces"))) {
        const candidate = path.join(newRoot, "workspaces", slug, "projects", opts.projectId);
        if (existsSync(candidate)) {
          projAbs = candidate;
          break;
        }
      }
    } catch {
      /* no workspaces dir */
    }
    if (!projAbs) {
      throw new MigrateRefusal("E_NOT_FOUND", { kind: "Project", id: opts.projectId });
    }
    report.projects.push(await migrateProjectInner(projAbs, opts.projectId, dryRun));
    return report;
  }

  // ── Idempotency: already-migrated root → no-op ─────────────────────────
  const alreadyMigrated =
    !existsSync(legacyRoot) ||
    (existsSync(path.join(newRoot, "workspaces")) && !existsSync(path.join(legacyRoot, "projects")) &&
      !existsSync(path.join(legacyRoot, ".ralph")));
  if (alreadyMigrated) {
    report.already_migrated = true;
    return report;
  }

  // ── Root move: workspace/.ralph/* ──────────────────────────────────────
  const ralphDir = path.join(legacyRoot, ".ralph");
  if (existsSync(ralphDir)) {
    for (const entry of (await fs.readdir(ralphDir)).sort()) {
      const target = RALPH_ENTRY_MAP[entry];
      const dst = path.join(newRoot, ...(target ?? [entry]));
      if (!target) report.unclassified.push(path.join("workspace", ".ralph", entry));
      report.root_moves.push(
        await executeMove(path.join(ralphDir, entry), dst, rootDir, dryRun, report.skipped),
      );
    }
    if (!dryRun) await removeIfEmpty(ralphDir).catch(() => false);
  }

  // ── Root move: workspace/* top-level entries ───────────────────────────
  const projectIds: string[] = [];
  // Loose (non-directory) entries living DIRECTLY under workspace/projects/
  // (e.g. a stray `*.md` or `*.zip`). They are not projects, so they follow
  // their paths to .ralphy/workspaces/default/projects/<basename> and are
  // reported as unclassified — never silently skipped (#110).
  const looseProjectFiles: string[] = [];
  // OS cruft under workspace/projects/ that gets pruned (not moved).
  const looseProjectNoise: string[] = [];
  for (const entry of (await fs.readdir(legacyRoot)).sort()) {
    if (entry === ".ralph") continue; // handled above
    if (entry === "projects") {
      try {
        const ids = await fs.readdir(path.join(legacyRoot, "projects"), { withFileTypes: true });
        for (const p of ids) {
          if (p.isDirectory()) projectIds.push(p.name);
          else if (NOISE_BASENAMES.has(p.name)) looseProjectNoise.push(p.name);
          else looseProjectFiles.push(p.name);
        }
      } catch {
        /* unreadable projects dir */
      }
      continue; // moved per-project below
    }
    const target = TOP_ENTRY_MAP[entry];
    const dst = path.join(newRoot, ...(target ?? [entry]));
    if (!target) report.unclassified.push(path.join("workspace", entry));
    report.root_moves.push(
      await executeMove(path.join(legacyRoot, entry), dst, rootDir, dryRun, report.skipped),
    );
  }

  // ── Projects: workspace/projects/<id> → .ralphy/workspaces/default/projects/<id> ──
  for (const id of projectIds.sort()) {
    const src = path.join(legacyRoot, "projects", id);
    const dst = path.join(newRoot, "workspaces", DEFAULT_WS, "projects", id);
    const mv = await executeMove(src, dst, rootDir, dryRun, report.skipped);
    report.root_moves.push(mv);
    // Inner #105 move runs against wherever the project lives in this mode:
    // dry-run inspects the still-legacy location, run mode the moved one.
    const projAbs = dryRun || mv.status === "skipped" ? src : dst;
    if (mv.status === "skipped" && !existsSync(src)) continue;
    report.projects.push(await migrateProjectInner(projAbs, id, dryRun));
  }

  // ── Loose files under workspace/projects/ → default workspace projects/ ──
  // (#110) They are not project dirs, so they keep their basename and follow
  // their path; collision behavior is shared with every other root move.
  for (const name of looseProjectFiles.sort()) {
    const src = path.join(legacyRoot, "projects", name);
    const dst = path.join(newRoot, "workspaces", DEFAULT_WS, "projects", name);
    report.unclassified.push(path.join("workspace", "projects", name));
    report.root_moves.push(await executeMove(src, dst, rootDir, dryRun, report.skipped));
  }
  // Prune OS cruft so an otherwise-empty projects/ tree still collapses.
  if (!dryRun) {
    for (const name of looseProjectNoise) {
      await fs.rm(path.join(legacyRoot, "projects", name), { force: true }).catch(() => {});
    }
  }

  if (!dryRun) {
    await removeIfEmpty(path.join(legacyRoot, "projects")).catch(() => false);
    await removeIfEmpty(legacyRoot).catch(() => false);
  }

  // ── Registry / config / workspace manifest updates ─────────────────────
  const registryFile = path.join(newRoot, "registry.json");
  const manifestFile = path.join(newRoot, "workspaces", DEFAULT_WS, "workspace.json");
  const reg = { workspace_field_set: 0, active_workspace_set: false, workspace_manifest_written: false };

  // registry.json: every project entry gains workspace: "default".
  const registrySource = dryRun
    ? existsSync(registryFile)
      ? registryFile
      : path.join(ralphDir, "registry.json")
    : registryFile;
  try {
    const data = JSON.parse(await fs.readFile(registrySource, "utf-8"));
    if (data && typeof data.projects === "object" && data.projects) {
      for (const entry of Object.values(data.projects as Record<string, any>)) {
        if (entry && typeof entry === "object" && !entry.workspace) {
          entry.workspace = DEFAULT_WS;
          reg.workspace_field_set++;
        }
      }
    }
    if (!dryRun && reg.workspace_field_set > 0) {
      await fs.writeFile(registryFile, JSON.stringify(data, null, 2) + "\n");
    }
  } catch {
    /* no registry → nothing to annotate */
  }

  // workspaces/default/workspace.json (append-only: never overwrite).
  if (!existsSync(manifestFile)) {
    reg.workspace_manifest_written = true;
    if (!dryRun) {
      await fs.mkdir(path.dirname(manifestFile), { recursive: true });
      await fs.writeFile(
        manifestFile,
        JSON.stringify(
          {
            name: "Default",
            slug: DEFAULT_WS,
            created: new Date().toISOString(),
            description: "Migrated from the flat workspace/ tree (#106)",
          },
          null,
          2,
        ) + "\n",
      );
    }
  }
  report.registry = reg;
  return report;
}
