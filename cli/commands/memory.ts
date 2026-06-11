import { Command } from "commander";
import { out, ok, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { currentWorkspace, DEFAULT_WORKSPACE } from "../lib/paths.js";
import {
  MEMORY_TYPES,
  type TierRef,
  type MemoryEntry,
  writeEntry,
  listEntries,
  getEntry,
  findEntry,
  searchEntries,
  approveEntry,
  approveAll,
  rejectEntry,
  recall,
  isMemoryType,
  workspaceExists,
  memoryDir,
  SLUG_RE,
} from "../lib/memory/store.js";
import { distillPostmortem, DISTILL_SOURCES } from "../lib/memory/distill.js";

// `ralphy memory` (#112) — tiered markdown memory: global `.ralphy/memory/`
// + workspace `.ralphy/workspaces/<ws>/memory/`. Plain `<slug>.md` entries
// with YAML frontmatter, a generated MEMORY.md index per tier, a `proposed/`
// staging dir (approve/reject promotion) and append-only versioning (an
// existing slug never gets overwritten — new content lands at `<slug>.v2.md`).

/**
 * Resolve the tier from the `--workspace [ws]` flag. Commander yields
 * `true` for a bare `--workspace` (→ active workspace) and a string for
 * `--workspace <ws>`. Absent → global tier (the default for mutations).
 */
function tierFromOpts(opts: { workspace?: string | boolean }): TierRef {
  if (opts.workspace === undefined || opts.workspace === false) return { tier: "global" };
  const ws = typeof opts.workspace === "string" ? opts.workspace : currentWorkspace();
  if (ws !== DEFAULT_WORKSPACE && !workspaceExists(ws)) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: ws });
  }
  return { tier: "workspace", ws };
}

function validateType(type: string | undefined, verb: string): void {
  if (type !== undefined && !isMemoryType(type)) {
    raiseError("E_FLAG_UNKNOWN", {
      flag: "type",
      value: type,
      allowed: MEMORY_TYPES.join("|"),
      verb,
    });
  }
}

function validateSlug(slug: string | undefined): void {
  if (slug !== undefined && !SLUG_RE.test(slug)) {
    raiseError("E_VALIDATION_FAILED", {
      target: "slug",
      detail: `'${slug}' is not a valid memory slug (lowercase kebab-case)`,
    });
  }
}

/** Map the store's coded cap error onto the catalog at the command boundary. */
function raiseIfCapError(e: unknown): never {
  const err = e as { code?: string; count?: number; cap?: number } | null;
  if (err?.code === "E_MEMORY_CAP_EXCEEDED") {
    raiseError("E_MEMORY_CAP_EXCEEDED", { count: String(err.count ?? "?"), cap: String(err.cap ?? "?") });
  }
  throw e;
}

function entryRow(e: MemoryEntry) {
  return {
    slug: e.slug,
    tier: e.tier,
    ...(e.workspace ? { workspace: e.workspace } : {}),
    type: e.type,
    name: e.name,
    description: e.description,
    file: e.file,
    version: e.version,
    status: e.status,
  };
}

export function memoryCmd() {
  const cmd = new Command("memory").description(
    "Tiered memory store — global .ralphy/memory/ + per-workspace memory/ (markdown entries, append-only)",
  );

  // ── note ─────────────────────────────────────────────────────────────────
  cmd
    .command("note <text>")
    .description("Write an ACTIVE memory entry directly (an explicit user remark is its own consent)")
    .option("--workspace [ws]", "Write into the workspace tier (bare flag = active workspace; default tier = global)")
    .option("--type <t>", `Entry type: ${MEMORY_TYPES.join("|")} (default: user)`)
    .option("--slug <s>", "Entry slug (default: auto-derived from the text)")
    .option("--description <d>", "Index-line description (default: first sentence of the text)")
    .option("--source <s>", "Provenance note recorded in frontmatter (default: 'ralphy memory')")
    .option("--force-overwrite", "Destructively replace the newest version in place instead of appending a new version")
    .action(async (text: string, opts) => {
      const ref = tierFromOpts(opts);
      validateType(opts.type, "memory note");
      validateSlug(opts.slug);
      const r = await writeEntry({
        text,
        ref,
        status: "active",
        type: opts.type,
        slug: opts.slug,
        description: opts.description,
        source: opts.source ?? "ralphy memory note",
        forceOverwrite: Boolean(opts.forceOverwrite),
      }).catch(raiseIfCapError);
      ok(
        r.versioned
          ? `Memory noted (existing slug — new version): ${r.entry.file}`
          : `Memory noted: ${r.entry.file}`,
      );
      out({ ...entryRow(r.entry), path: r.entry.path, versioned: r.versioned, overwritten: r.overwritten });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory note "Kling prompts must ban music; mix music as a separate pass" --type craft
  $ ralphy memory note "Client rejects neon grades" --workspace acme --type client
  $ ralphy memory note "Use bun, never npm" --slug bun-only --description "Toolchain rule"
`,
    );

  // ── propose ──────────────────────────────────────────────────────────────
  cmd
    .command("propose <text>")
    .description("Stage a candidate entry into proposed/ (promoted via `ralphy memory approve`)")
    .option("--workspace [ws]", "Stage into the workspace tier (bare flag = active workspace; default tier = global)")
    .option("--type <t>", `Entry type: ${MEMORY_TYPES.join("|")} (default: user)`)
    .option("--slug <s>", "Entry slug (default: auto-derived from the text)")
    .option("--description <d>", "Index-line description (default: first sentence of the text)")
    .option("--source <s>", "Provenance note recorded in frontmatter (default: 'ralphy memory')")
    .action(async (text: string, opts) => {
      const ref = tierFromOpts(opts);
      validateType(opts.type, "memory propose");
      validateSlug(opts.slug);
      const r = await writeEntry({
        text,
        ref,
        status: "proposed",
        type: opts.type,
        slug: opts.slug,
        description: opts.description,
        source: opts.source ?? "ralphy memory propose",
      });
      ok(`Memory proposed: ${r.entry.file} (approve with \`ralphy memory approve ${r.entry.slug}\`)`);
      out({ ...entryRow(r.entry), path: r.entry.path, versioned: r.versioned });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory propose "Seedance rejects photoreal human anchors" --type model
  $ ralphy memory propose "Cast master shots live in shared/cast/" --workspace acme --type client
`,
    );

  // ── list ─────────────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List memory entries (default: active entries of BOTH tiers)")
    .option("--global", "Only the global tier")
    .option("--workspace [ws]", "Only the workspace tier (bare flag = active workspace)")
    .option("--all", "Both tiers (the default)")
    .option("--proposed", "List proposed/ staging entries instead of active ones")
    .action(async (opts) => {
      const status = opts.proposed ? "proposed" : "active";
      const refs: TierRef[] = [];
      if (opts.global && !opts.all) {
        refs.push({ tier: "global" });
      } else if (opts.workspace !== undefined && opts.workspace !== false && !opts.all) {
        refs.push(tierFromOpts(opts));
      } else {
        refs.push({ tier: "global" }, { tier: "workspace", ws: currentWorkspace() });
      }
      const rows: ReturnType<typeof entryRow>[] = [];
      for (const ref of refs) {
        for (const e of await listEntries(ref, status)) rows.push(entryRow(e));
      }
      out(rows);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory list
  $ ralphy memory list --global
  $ ralphy memory list --workspace acme --proposed
`,
    );

  // ── show ─────────────────────────────────────────────────────────────────
  cmd
    .command("show <slug>")
    .description("Print one entry (no tier flag: workspace tier first, then global)")
    .option("--workspace [ws]", "Look only in the workspace tier (bare flag = active workspace)")
    .option("--global", "Look only in the global tier")
    .action(async (slug: string, opts) => {
      let entry: MemoryEntry | null;
      if (opts.global) {
        entry = await getEntry(slug, { tier: "global" });
      } else if (opts.workspace !== undefined && opts.workspace !== false) {
        entry = await getEntry(slug, tierFromOpts(opts));
      } else {
        entry = await findEntry(slug);
      }
      if (!entry) raiseError("E_MEMORY_NOT_FOUND", { slug });
      if (isPretty()) {
        const ui = await import("../lib/ui.js");
        const { c, section } = ui;
        section(`${entry!.name}  ${c.muted(`(${entry!.tier}${entry!.workspace ? ":" + entry!.workspace : ""} · ${entry!.type} · v${entry!.version})`)}`);
        console.log(`  ${c.muted(entry!.path)}`);
        console.log();
        console.log(entry!.body);
        console.log();
        return;
      }
      out({ ...entryRow(entry!), path: entry!.path, filed: entry!.filed, source: entry!.source, body: entry!.body });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory show kling-no-music
  $ ralphy memory show cast-master-shots --workspace acme
`,
    );

  // ── search ───────────────────────────────────────────────────────────────
  cmd
    .command("search <query>")
    .description("Case-insensitive substring scan over frontmatter + body across both tiers")
    .option("--workspace <ws>", "Workspace tier to include (default: the active workspace)")
    .action(async (query: string, opts) => {
      const matches = await searchEntries(query, typeof opts.workspace === "string" ? opts.workspace : undefined);
      out(matches);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory search kling
  $ ralphy memory search "neon" --workspace acme
`,
    );

  // ── approve ──────────────────────────────────────────────────────────────
  cmd
    .command("approve [slug]")
    .description("Promote a proposed/ entry to active (+ index line). MOVE, never copy-and-delete")
    .option("--all", "Approve every proposed entry in the tier")
    .option("--workspace [ws]", "Target the workspace tier (bare flag = active workspace; default tier = global)")
    .action(async (slug: string | undefined, opts) => {
      const ref = tierFromOpts(opts);
      if (opts.all) {
        const moved = await approveAll(ref).catch(raiseIfCapError);
        ok(`Approved ${moved.length} proposed entr${moved.length === 1 ? "y" : "ies"}`);
        out(moved);
        return;
      }
      if (!slug) raiseError("E_FLAG_MISSING", { flag: "all", verb: "memory approve" });
      const r = await approveEntry(slug!, ref).catch(raiseIfCapError);
      if (!r) raiseError("E_MEMORY_NOT_FOUND", { slug: slug! });
      ok(r!.versioned ? `Approved (existing active slug — new version): ${r!.to}` : `Approved: ${r!.to}`);
      out(r);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory approve seedance-rejects-photoreal
  $ ralphy memory approve --all --workspace acme
`,
    );

  // ── reject ───────────────────────────────────────────────────────────────
  cmd
    .command("reject <slug>")
    .description("Move a proposed/ entry to rejected/ (MOVE — the file is never unlinked)")
    .option("--workspace [ws]", "Target the workspace tier (bare flag = active workspace; default tier = global)")
    .action(async (slug: string, opts) => {
      const ref = tierFromOpts(opts);
      const r = await rejectEntry(slug, ref);
      if (!r) raiseError("E_MEMORY_NOT_FOUND", { slug });
      ok(`Rejected: ${r!.to}`);
      out(r);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory reject stale-candidate
  $ ralphy memory reject off-brand-rule --workspace acme
`,
    );

  // ── distill (#113) ───────────────────────────────────────────────────────
  cmd
    .command("distill <project-id>")
    .description(
      `Distill a project's postmortem (${DISTILL_SOURCES.join(", ")}) into memory PROPOSALS — review with \`ralphy memory approve\``,
    )
    .option("--dry-run", "Print the candidates without staging anything")
    .action(async (projectId: string, opts) => {
      let r;
      try {
        r = await distillPostmortem({ projectId, dryRun: Boolean(opts.dryRun) });
      } catch (e) {
        const err = e as { code?: string; project?: string; lookedIn?: string } | null;
        if (err?.code === "E_NOT_FOUND") {
          raiseError("E_NOT_FOUND", { kind: "Postmortem", id: `${projectId} (${err.lookedIn ?? "postmortem/"})` });
        }
        throw e;
      }
      if (!r.dryRun && r.staged.length > 0) {
        ok(
          `Staged ${r.staged.length} memory proposal${r.staged.length === 1 ? "" : "s"} — review with \`ralphy memory list --proposed\` then \`ralphy memory approve <slug>\``,
        );
      }
      out({
        project: r.project,
        workspace: r.workspace,
        model: r.model,
        sources: r.sources,
        dry_run: r.dryRun,
        candidates: r.candidates,
        routed_to_guideline: r.routedToGuideline,
        staged: r.staged,
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory distill choose-path-001 --dry-run
  $ ralphy memory distill choose-path-001
`,
    );

  // ── recall ───────────────────────────────────────────────────────────────
  cmd
    .command("recall")
    .description("Merged digest for intake context: global + workspace active entries (workspace wins on slug collision)")
    .option("--workspace <ws>", "Workspace to merge (default: the active workspace)")
    .option("--full", "Print full entry bodies (uncapped) instead of index lines")
    .action(async (opts) => {
      const ws = typeof opts.workspace === "string" ? opts.workspace : undefined;
      if (ws !== undefined && ws !== DEFAULT_WORKSPACE && !workspaceExists(ws)) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: ws });
      }
      const r = await recall({ ws, full: Boolean(opts.full) });
      if (isPretty()) {
        const ui = await import("../lib/ui.js");
        const { c, section } = ui;
        section(`Memory recall  ${c.muted(`(workspace: ${r.workspace}, ${r.count} entr${r.count === 1 ? "y" : "ies"}${r.truncated ? ", truncated" : ""})`)}`);
        console.log(`  ${c.muted(r.note)}`);
        for (const e of r.entries) {
          console.log(`  - [${c.bold(e.name)}] (${e.tier}) — ${e.description}`);
          if (opts.full) {
            console.log();
            console.log(e.body.replace(/^/gm, "    "));
            console.log();
          }
        }
        console.log();
        return;
      }
      out({
        workspace: r.workspace,
        count: r.count,
        truncated: r.truncated,
        note: r.note,
        entries: r.entries.map((e) =>
          opts.full ? { ...entryRow(e), body: e.body } : { slug: e.slug, tier: e.tier, name: e.name, description: e.description, type: e.type },
        ),
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy memory recall
  $ ralphy memory recall --workspace acme --full
`,
    );

  cmd.addHelpText(
    "after",
    `
Layout:
  global tier     .ralphy/memory/                    cross-workspace lessons (model quirks, craft, tooling)
  workspace tier  .ralphy/workspaces/<ws>/memory/    client / universe facts (cast, style DNA, rejections)
  per tier        <slug>.md + MEMORY.md index + proposed/ staging + rejected/

Append-only: re-noting an existing slug writes <slug>.v2.md (then v3...) and the
index points at the newest version; pass --force-overwrite for in-place replace.
Current dirs: ${(() => { try { return memoryDir({ tier: "global" }); } catch { return ".ralphy/memory"; } })()}
`,
  );

  return cmd;
}
