// `ralphy studio` — the CLI read surface over Ralphy Studio's sidecar metadata.
//
// Studio (the local browser app, studio/) is operated by the USER; the chat
// agent (Claude Code) reads what the user prepared there. Today that is the
// agent context INBOX (#489): when the user selects objects in Studio and picks
// an action (repair / approve / compare / use-as-reference / publish), Studio
// writes a MD+JSON context pack under the active run or project. This command
// lists + shows those packs so the agent can pull the exact selection from chat.
//
// IMPORTANT: an inbox pack is CONTEXT, never an instruction to spend money. The
// agent still decides and runs the actual ralphy verbs behind the usual
// paid-generation gate (AGENTS.md #4 / the production contract). READ-ONLY.

import { Command } from "commander";
import { layoutMode } from "../lib/paths.js";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { listInbox, loadInbox, type InboxQuery } from "../lib/agent-inbox.js";

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
}

function queryFrom(opts: { workspace?: string; run?: string; project?: string }): InboxQuery {
  return { workspace: opts.workspace, run: opts.run, project: opts.project };
}

export function studioCmd() {
  const cmd = new Command("studio").description(
    "Read what the user prepared in Ralphy Studio (the local browser app). Today: the agent context inbox (#489) — context packs, NOT spend approvals.",
  );

  const inbox = cmd
    .command("inbox")
    .description("Read Studio → agent context-inbox packs (a pack is CONTEXT, not an instruction to spend money)");

  // ── list ───────────────────────────────────────────────────────────────────
  inbox
    .command("list")
    .description(
      "List Studio → agent context-inbox packs across the active (or --workspace) workspace, newest first. Scope to one run with --run or one project with --project. A pack is CONTEXT prepared in Studio; the agent still decides and runs the actual ralphy verbs behind the paid-generation gate. ZERO model calls.",
    )
    .option("--workspace <slug>", "Target workspace (default: the active one)")
    .option("--run <id>", "Only this run's packs")
    .option("--project <id>", "Only this project's packs")
    .action((opts) => {
      requireRalphyLayout("studio inbox list");
      out(listInbox(queryFrom(opts)));
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy studio inbox list
  $ ralphy studio inbox list --run spring-drop-farm-a1b2
  $ ralphy studio inbox list --project spring-001
`,
    );

  // ── show ─────────────────────────────────────────────────────────────────
  inbox
    .command("show <id>")
    .description(
      "Show one Studio → agent context-inbox pack: its action, selected objects (with `@`-pastable paths), tags, note, and requested outcome, plus the Markdown mirror path. A pack is CONTEXT, not a spend approval — read it, then decide and run the ralphy verbs yourself behind the paid-generation gate.",
    )
    .option("--workspace <slug>", "Target workspace (default: the active one)")
    .option("--run <id>", "Look only in this run")
    .option("--project <id>", "Look only in this project")
    .action((id: string, opts) => {
      requireRalphyLayout("studio inbox show");
      const found = loadInbox(id, queryFrom(opts));
      if (!found) raiseError("E_NOT_FOUND", { kind: "Inbox pack", id });
      out({
        scope: found!.scope,
        scopeId: found!.scopeId,
        jsonPath: found!.jsonPath,
        mdPath: found!.mdPath,
        ...found!.pack,
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy studio inbox show 2026-06-25T07-48-26-123Z-abc-repair
  $ ralphy studio inbox show <id> --project spring-001
`,
    );

  return cmd;
}
