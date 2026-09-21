import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentPermissionMode, AgentProvider } from "../media/types";

/**
 * What a chat carries before it reads the operator's message.
 *
 * The harness runs the provider's CLI in the library's *parent* -- the operator's home -- so the
 * instruction files in context are the provider's own global ones, and whatever happens to sit in
 * that directory. Ralphy's own AGENTS.md and playbooks live in the core checkout, which is not the
 * working directory and is not reachable by a relative path; a preamble that said "follow this
 * repository's AGENTS.md" was naming a file that is not there.
 *
 * This module owns the text: where the provider keeps its own files, and the preamble Ralphy
 * prepends. What the operator sees of all of it is the Context page, which reads the same places
 * for its own rows -- see `context-page.ts`.
 *
 * Two things reach the agent because they were measured to be missing: the absolute path of the CLI
 * this app runs, and the workspace's memory digest. Both were held by the app and given to nobody --
 * the preamble said the bare word `ralphy`, which on a real machine resolved to an older release
 * that cannot open a schema-9 library, and the digest was computed only to be shown to the operator
 * in a dialog.
 */

/**
 * The workspace's memory digest, as Core merged it: global entries with the workspace's own
 * overriding them on slug collision, capped, and carrying Core's own caution about what a recalled
 * entry is. Only the index lines go into the prompt -- a name and its one-line description is what
 * `MEMORY.md` is for, and fifty full bodies is not a preamble.
 */
export interface AgentMemoryDigest {
  count: number;
  truncated: boolean;
  note: string;
  entries: readonly { name: string; description: string }[];
}

/**
 * Where the memory section begins inside the preamble. The Context page splits the preamble on it
 * so the app's own lines and the workspace's recalled rules are two blocks with two real sizes
 * instead of one block counted twice.
 */
export const MEMORY_HEADING = "Workspace memory (";
export const PREAMBLE_END = "[/Ralphy Media context]";

const MAX_MEMORY_LINES = 50;
const MAX_MEMORY_LINE = 200;

async function present(path: string): Promise<boolean> {
  return await stat(path).then(() => true).catch(() => false);
}

/** Where a provider keeps the instructions and skills it reads without being asked. */
export function providerHome(provider: AgentProvider, home: string): {
  instructions: string;
  config: string;
  skills: string;
  projectInstructions: string;
} {
  return provider === "claude"
    ? {
      instructions: join(home, ".claude", "CLAUDE.md"),
      config: join(home, ".claude", "settings.json"),
      skills: join(home, ".claude", "skills"),
      projectInstructions: "CLAUDE.md",
    }
    : {
      instructions: join(home, ".codex", "AGENTS.md"),
      config: join(home, ".codex", "config.toml"),
      skills: join(home, ".codex", "skills"),
      projectInstructions: "AGENTS.md",
    };
}

/**
 * The preamble, built from the files that are actually there. Naming absolute paths rather than
 * "this repository's AGENTS.md" is the difference between an instruction and a wish: the working
 * directory is the operator's home, and nothing relative resolves to Ralphy's own guides.
 */
export function ralphyPreamble(input: {
  rootPath: string;
  workspaceId?: string | null;
  projectId?: string | null;
  projectPath?: string | null;
  cwd: string;
  instructions: readonly string[];
  permissionMode?: AgentPermissionMode;
  cli?: string | null;
  memory?: AgentMemoryDigest | null;
}): string {
  const readOnly = (input.permissionMode ?? "plan") === "plan";
  const lines = (input.memory?.entries ?? [])
    .slice(0, MAX_MEMORY_LINES)
    .map(({ name, description }) => `- ${`${name}: ${description}`.slice(0, MAX_MEMORY_LINE)}`);
  return [
    "[Ralphy Media context]",
    `Library: ${input.rootPath}`,
    `Active workspace ID: ${input.workspaceId ?? "none selected"}`,
    `Active project: ${input.projectId ?? input.projectPath ?? "none selected"}`,
    `Working directory: ${input.cwd}`,
    'Chat presentation: use <PromptCard title="Image prompt" text="Exact reusable prompt" /> for a prompt the user should copy, and <CaptionCard title="Instagram caption" text="Exact audience-facing caption" /> for ready-to-copy social text. These cards display text; they do not generate, save, schedule or publish anything. Use them only when that action is useful, not for ordinary prose. Put each card where it belongs in the explanation, outside code fences on its own line; do not collect cards at the end. Attributes must be quoted strings: escape & as &amp;, double quotes as &quot;, and < as &lt;. No JavaScript, expressions, handlers or imports. Keep titles under 200 characters and text under 8000 characters.',
    readOnly
      ? 'Agent permissions: Read-only files. Inspect existing content and propose a plan. Do not generate, import, create, revise, or save content, including paid generation whose output cannot be saved. When the request needs writes, explain the restriction and ask the user to change "Read-only files" to "Workspace access" using the visible "Agent permissions" selector beside the chat composer, then continue. Never change permissions yourself or bypass the sandbox.'
      : `Agent permissions: ${input.permissionMode === "full" ? "Full access" : "Workspace access"}. Work within the selected permissions and the user's request.`,
    ...(input.instructions.length > 0
      ? [`Instructions already in your context: ${input.instructions.join(", ")}`]
      : []),
    /* The absolute path, never the bare word. `ralphy` on the operator's PATH is a different
       program from the one this app runs -- an older release there cannot open this library at all,
       and a turn that shells out to it fails in a way that looks like the library is broken. The
       library itself is a store, not a tree: an agent that walks it finds a SQLite file. */
    ...(input.cli
      ? [
        `Ralphy CLI: ${input.cli}`,
        `Drive every Ralphy step through that exact path; \`'${input.cli.replaceAll("'", "'\\''")}' --help\` lists it. The library is its store -- ${readOnly ? "read it" : "read and change it"} through the CLI rather than by reading files under it.`,
        `Always pass --root ${JSON.stringify(input.rootPath)} explicitly. Scoped CRUD commands use --workspace ${JSON.stringify(input.workspaceId ?? "<choose-workspace>")}. For generation and reference imports, --project and --workspace are mutually exclusive destinations: use only --project with a verified project ID from the active workspace. Never change a different workspace.`,
        "Generation connections are managed by Settings > Providers and are shared by Create, Canvas and this chat. The exact Ralphy CLI above uses the app's credential snapshot, ignoring older project/workspace generation keys and ordinary shell overrides. Check `provider list` for configuration, not authentication. Never source .env files, search for alternate keys, print credential values, or change provider credentials in chat. If a provider is missing or rejected, direct setup to Settings > Providers. MCP connections and the agent's own subscription are separate and managed in its app.",
        "A sandbox or Keychain access denial is not a provider authentication rejection. E_SECRET_STORE alone does not prove a key is invalid or missing: report the access restriction, not a need to reconnect or replace provider keys. Only suggest provider setup when the provider is explicitly missing or authentication is rejected.",
        ...(readOnly ? [
          "Creative experiments: inspect existing source creatives and reported metrics. Keep findings and proposed changes in the chat; missing measurements stay unknown, and proposed improvements are hypotheses. Do not claim that a proposal is generated or saved content.",
        ] : [
        "Creative experiments: read source creatives and metrics through the connected MCP. Keep source IDs, URLs, date range and reported metrics in a project document; missing measurements stay unknown. Treat proposed audience or metric improvements as hypotheses, never measured lifts.",
        "Use the active project, or create one in the active workspace if none is selected. Keep one Unit per source creative with `unit create`; reuse it for later experiments. Keep the original as a baseline; use `unit revise` for each alternative, passing the expected latest revision ID and original parent revision ID. Preserve previous versions. Record the changed variable and hypothesis in --note, with complete items and platform presentations for that version.",
        "Persist real previews before claiming a variant is ready. Text-only variants can use Document items and platform captions; visual variants need distinct generated/imported Artifact revisions. A prompt or proposed actor change is a concept, not a rendered visual. Compare social platforms, copy, CTA, visual presence or actors when requested. Read CLI --help for exact document, artifact and unit commands. Do not publish or change ad campaigns during an experiment.",
        "Unit presentation items are the public creative: put only audience-facing copy or media in them. Keep experiment hypotheses in the revision note and provenance in a separate project document. Exclude source-evidence and internal notes from presentation item lists.",
        'Return Markdown with standalone MDX cards for saved project Units: <UnitCard workspaceId="ws_id" projectId="proj_id" unitId="unit_id" title="Creative 1" />. Replace IDs with actual CLI results. Put each card outside code fences, on its own line with blank lines around it. Only quoted string attributes are supported; no JavaScript, imports or expressions. The app reads the actual version count. Create the number of variants requested by the user, never a fixed demo count. When variants derive from an imported creative, retain that original as an unchanged sealed Unit revision and link it using `ralphy unit source <variant-unit-id> --revision <original-revision-id> --label "Source name"` using the actual source name. Do not call the first generated variant the original. The linked original is separate from the requested variant count. Include concise findings and test hypotheses alongside the cards.',
        ]),
      ]
      : ["No Ralphy CLI is available to this chat; do not invent one."]),
    ...(lines.length > 0
      ? [
        "",
        `${MEMORY_HEADING}${input.memory?.count ?? lines.length}${input.memory?.truncated ? ", truncated" : ""}). ${input.memory?.note ?? ""}`.trim(),
        ...lines,
      ]
      : []),
    PREAMBLE_END,
  ].join("\n");
}

/**
 * The preamble for one turn, built from the files that are actually on the machine. The Context
 * page reads the same places for its own rows; what this function owns is the text the turn
 * carries, so a session asks for the string and nothing else.
 */
export async function agentPreamble(input: {
  provider: AgentProvider;
  permissionMode?: AgentPermissionMode;
  rootPath: string;
  workspaceId?: string | null;
  projectId?: string | null;
  projectPath?: string | null;
  cwd: string;
  home?: string;
  /** The absolute path of the CLI this app runs, not whatever `ralphy` resolves to. */
  cli?: string | null;
  memory?: AgentMemoryDigest | null;
}): Promise<string> {
  const home = input.home ?? homedir();
  const places = providerHome(input.provider, home);
  const projectFile = join(input.cwd, places.projectInstructions);
  const [globalThere, projectThere] = await Promise.all([
    present(places.instructions),
    present(projectFile),
  ]);
  return ralphyPreamble({
    ...input,
    cwd: input.cwd,
    instructions: [
      ...(globalThere ? [places.instructions] : []),
      ...(projectThere ? [projectFile] : []),
    ],
  });
}
