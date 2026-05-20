// `ralphy skill <install|uninstall>` — drop the skill bundle into the
// user's chosen agent (01.01.06).
//
// v1.0 adapters: claude / cursor / codex (per D-05). Other agents land
// under 01.11.04 — invoking them returns E_AGENT_UNSUPPORTED.
//
// First-run UX (03.02.06): when invoked on TTY without an explicit --agent,
// launch a @clack/prompts wizard that detects installed agents, asks scope,
// persists the choice to ~/.ralphy/config.json. Subsequent runs read the
// persisted choice and re-install non-interactively. `--reconfigure`
// re-launches the wizard. `--json` or non-TTY without explicit flags →
// E_WIZARD_NEEDS_TTY.

import { Command } from "commander";
import path from "node:path";
import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { installSkill, uninstallSkill, type AgentId, type Scope } from "../lib/skill/installer.js";
import {
  scaffoldSkill,
  insertRoutingRow,
  type ScaffoldOptions,
} from "../lib/skill/scaffold.js";
import {
  detectAgentsInEnv,
  defaultScopeFor,
  persistInstallChoice,
  loadInstallChoice,
  type InstallChoice,
} from "../lib/skill/wizard.js";
import { isPrettyMode } from "../lib/ui.js";

const V1_AGENTS: AgentId[] = ["claude", "cursor", "codex"];

function isV1Agent(s: string): s is AgentId {
  return (V1_AGENTS as string[]).includes(s);
}

function detectAgents(): AgentId[] {
  // Heuristic auto-detect: presence of agent-specific config dirs.
  const home = process.env.HOME || "";
  const found: AgentId[] = [];
  if (existsSync(path.join(home, ".claude"))) found.push("claude");
  // Cursor stores per-project rules so user-scope detection is unreliable;
  // include it if any of the legacy/local markers are present.
  if (existsSync(path.join(home, ".cursor")) || existsSync(".cursor")) found.push("cursor");
  if (existsSync("AGENTS.md")) found.push("codex");
  return found;
}

function bundleDir(): string {
  // Repo-checkout layout: <repo>/.agents/skills/ralphy/ if present, else
  // the .claude/skills/ralphy/ symlink target. Falls back to the repo's
  // .agents/ folder.
  const candidates = [
    path.join(process.cwd(), ".agents", "skills", "ralphy"),
    path.join(process.cwd(), ".claude", "skills", "ralphy"),
    path.join(process.cwd(), ".agents", "skills"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: empty dir we'll create on the fly. The Claude adapter still
  // writes the CLAUDE.md routing pointer, which is the load-bearing part.
  return path.join(process.cwd(), ".agents", "skills", "ralphy");
}

export function skillCmd(): Command {
  const cmd = new Command("skill").description("Manage Ralphy skill installs across AI agents");

  const installCmd = cmd
    .command("install")
    .description("Install the Ralphy skill bundle into the selected agent (claude / cursor / codex)")
    .option("--agent <id>", "Target agent (auto-detects when omitted): claude, cursor, codex")
    .option("--scope <s>", "user | project (default: user for claude/cursor, project for codex)")
    .option("--symlink", "Symlink the bundle instead of copying (default copy)")
    .option("--copy", "Force copy mode (default — opposite of --symlink)")
    .option("--dev", "Also install the ralphy-dev: maintainer namespace")
    .option("--reconfigure", "Re-launch the wizard, overwriting any persisted choice")
    .action(async (opts) => {
      const explicitAgent = (opts.agent as string | undefined) ?? null;
      const mode = opts.symlink ? "symlink" : "copy";

      // Branch 1 — explicit --agent flag: skip the wizard entirely (CI/power user).
      if (explicitAgent) {
        if (!isV1Agent(explicitAgent)) {
          raiseError("E_AGENT_UNSUPPORTED", { agent: explicitAgent });
        }
        const defaultScope = defaultScopeFor(explicitAgent as AgentId);
        const scope = (opts.scope as Scope | undefined) ?? defaultScope;
        const r = installSkill({
          agent: explicitAgent as AgentId,
          scope,
          bundleDir: bundleDir(),
          mode,
        });
        out({ installed: [r] });
        return;
      }

      // Branch 2 — persisted choice (subsequent runs): re-install
      // non-interactively unless --reconfigure was passed.
      const prior = loadInstallChoice();
      if (prior && !opts.reconfigure) {
        const installed = applyInstallChoice(prior, mode);
        out({ installed, replayed_from_config: true });
        return;
      }

      // Branch 3 — first run (or --reconfigure). Needs a TTY to drive the
      // wizard; pretty mode is the proxy. JSON / piped → E_WIZARD_NEEDS_TTY.
      if (!isPrettyMode() || !process.stdout.isTTY) {
        raiseError("E_WIZARD_NEEDS_TTY", { verb: "skill install" });
      }
      const choice = await runWizard({ devOptIn: Boolean(opts.dev) });
      persistInstallChoice(choice);
      const installed = applyInstallChoice(choice, mode);
      out({ installed, wizard_completed: true });
    });

  cmd
    .command("uninstall")
    .description("Remove the Ralphy skill bundle + sentinel block from the selected agent")
    .option("--agent <id>", "Target agent (default: all detected)")
    .option("--scope <s>", "user | project (default mirrors install)")
    .action((opts) => {
      const agent = (opts.agent as string | undefined) ?? null;
      const targets: AgentId[] = agent ? [agent as AgentId] : detectAgents();
      if (agent && !isV1Agent(agent)) {
        raiseError("E_AGENT_UNSUPPORTED", { agent });
      }
      const removed: unknown[] = [];
      for (const t of targets) {
        if (!isV1Agent(t)) continue;
        const defaultScope = t === "codex" ? "project" : "user";
        const scope = (opts.scope as "user" | "project" | undefined) ?? defaultScope;
        const r = uninstallSkill({ agent: t, scope });
        removed.push(r);
      }
      out({ removed });
    });

  const newCmd = cmd
    .command("new")
    .argument("<name>", "Skill slug (kebab-case, becomes the folder name)")
    .description("Scaffold a new skill: .agents/skills/<name>/SKILL.md + docs/playbooks/<name>.md")
    .option("--intent <text>", "One-line intent the skill captures (description's first sentence)")
    .option("--trigger <phrases...>", "Trigger phrases (repeatable; rendered as USE WHEN)")
    .option("--row <text>", "Intent text used in the AGENTS.md routing row")
    .option("--namespace <ns>", "ralphy (user) or ralphy-dev (maintainer)", "ralphy")
    .option("--add-to-routing", "Also append a row to AGENTS.md (sentinel-bounded, idempotent)")
    .option("--non-interactive", "Skip clack prompts; require --intent / --trigger flags")
    .action(async (name: string, opts) => {
      const repoRoot = process.env.RALPHY_REPO_ROOT || process.cwd();
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        raiseError("E_INPUT_INVALID", { field: "name", detail: `'${name}' is not kebab-case (^[a-z][a-z0-9-]*$)` });
      }
      const skillPath = path.join(repoRoot, ".agents", "skills", name, "SKILL.md");
      if (existsSync(skillPath)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Skill", id: name });
      }

      const ni = Boolean(opts.nonInteractive) || !process.stdout.isTTY;
      let intent: string = (opts.intent as string | undefined) ?? "";
      let triggers: string[] = (opts.trigger as string[] | undefined) ?? [];
      let rowText: string = (opts.row as string | undefined) ?? "";
      const namespace: "ralphy" | "ralphy-dev" =
        (opts.namespace as "ralphy" | "ralphy-dev") ?? "ralphy";

      if (!ni && (!intent || triggers.length === 0)) {
        p.intro(`ralphy skill new ${name}`);
        if (!intent) {
          const i = await p.text({
            message: "Intent — one sentence describing what this skill does:",
            validate: (v) => (v ? undefined : "Required"),
          });
          if (p.isCancel(i)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          intent = i as string;
        }
        if (triggers.length === 0) {
          const t = await p.text({
            message: "Trigger phrases (comma-separated, e.g. 'do X, /run-X'):",
            validate: (v) => (v ? undefined : "Required"),
          });
          if (p.isCancel(t)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          triggers = (t as string)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        if (!rowText && opts.addToRouting) {
          const r = await p.text({
            message: "Routing-table intent text (or empty to use the intent line):",
            placeholder: intent,
          });
          if (!p.isCancel(r) && typeof r === "string" && r) {
            rowText = r;
          }
        }
      }

      if (!intent) {
        raiseError("E_FLAG_MISSING", { flag: "intent", verb: "skill new" });
      }
      if (triggers.length === 0) {
        raiseError("E_FLAG_MISSING", { flag: "trigger", verb: "skill new" });
      }

      const scaffoldOpts: ScaffoldOptions = {
        repoRoot,
        name,
        intent,
        triggers,
        namespace,
      };
      const result = scaffoldSkill(scaffoldOpts);

      if (opts.addToRouting) {
        const inserted = insertRoutingRow({
          repoRoot,
          name,
          rowText: rowText || intent,
        });
        result.routingTableUpdated = inserted;
      }

      out({ skill: result });
      if (!ni) {
        p.outro(`Scaffolded ${name} — edit ${path.relative(repoRoot, skillPath)} to fill in the body.`);
      }
    });

  newCmd.addHelpText(
    "after",
    `
Examples:
  ralphy skill new my-flow --non-interactive --intent "Does X" --trigger "do X" --trigger "/x"
  ralphy skill new fancy --add-to-routing --row "When user wants fancy"
  ralphy skill new dev-only --namespace ralphy-dev --non-interactive --intent "Maintainer-only flow" --trigger "/dev-only"
`,
  );

  installCmd.addHelpText(
    "after",
    `
Examples:
  ralphy skill install --agent claude
  ralphy skill install --agent cursor --scope project
  ralphy skill install --agent codex
`,
  );

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy skill install --agent claude
  ralphy skill install <pack>      # alias: pass --agent <pack> through to the installer
  ralphy skill uninstall --agent claude
`,
  );

  return cmd;
}

// ─── Wizard helpers (03.02.06) ─────────────────────────────────────────────

function applyInstallChoice(choice: { installedAgents: AgentId[]; installScope: Scope; installDevNamespace?: boolean }, mode: "symlink" | "copy"): unknown[] {
  const installed: unknown[] = [];
  for (const a of choice.installedAgents) {
    if (!isV1Agent(a)) continue;
    const scope: Scope = a === "codex" || a === "copilot" ? "project" : choice.installScope;
    const r = installSkill({ agent: a, scope, bundleDir: bundleDir(), mode });
    installed.push(r);
  }
  return installed;
}

async function runWizard(_opts: { devOptIn: boolean }): Promise<InstallChoice> {
  p.intro("ralphy skill install");
  const detected = detectAgentsInEnv({});
  if (detected.length > 0) {
    p.note(
      detected.map((d) => `  ✓ ${d.agent.padEnd(8)} ${d.evidence}`).join("\n"),
      "Detected agents",
    );
  } else {
    p.note("  (none — pick any to install fresh)", "Detected agents");
  }

  const allAgents: AgentId[] = ["claude", "cursor", "codex"];
  const detectedIds = new Set(detected.map((d) => d.agent));
  const picks = await p.multiselect({
    message: "Install the Ralphy skill bundle for:",
    options: allAgents.map((a) => ({
      value: a,
      label: a,
      hint: detectedIds.has(a) ? "detected" : "fresh install",
    })),
    initialValues: detected.length > 0 ? detected.map((d) => d.agent).filter((a) => allAgents.includes(a)) : allAgents,
    required: true,
  });
  if (p.isCancel(picks)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // One scope question covers claude+cursor; codex is forced project.
  const claudeOrCursor = (picks as AgentId[]).some((a) => a === "claude" || a === "cursor");
  let scope: Scope = "user";
  if (claudeOrCursor) {
    const choice = await p.select({
      message: "Install scope:",
      options: [
        { value: "user", label: "user (works in every project — recommended)" },
        { value: "project", label: "project (this checkout only)" },
      ],
      initialValue: "user",
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    scope = choice as Scope;
  }

  const devOptIn = _opts.devOptIn;
  const choice: InstallChoice = {
    installedAgents: picks as AgentId[],
    installScope: scope,
    installDevNamespace: devOptIn,
  };
  p.outro("Wizard done — installing…");
  return choice;
}
