import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentProvider } from "../media/types";

/**
 * What a chat can actually reach.
 *
 * The harness runs the provider's CLI in the library's *parent* -- the operator's home -- so the
 * instruction files in context are the provider's own global ones, and whatever happens to sit in
 * that directory. Ralphy's own AGENTS.md and playbooks live in the core checkout, which is not the
 * working directory and is not reachable by a relative path; a preamble that said "follow this
 * repository's AGENTS.md" was naming a file that is not there.
 *
 * This module is the single answer to "what is in context", and both halves read it: the preamble
 * the harness injects is built from it, and the panel shows the same list. A file is listed with
 * whether it exists, so an absent one reads as absent rather than as a promise.
 *
 * Two things reach the agent because they were measured to be missing: the absolute path of the CLI
 * this app runs, and the workspace's memory digest. Both were held by the app and given to nobody --
 * the preamble said the bare word `ralphy`, which on a real machine resolved to an older release
 * that cannot open a schema-9 library, and the digest was computed only to be shown to the operator
 * in a dialog.
 */

export type AgentContextKind =
  | "instructions"
  | "config"
  | "skills"
  | "library"
  | "project"
  | "cwd"
  | "cli"
  | "memory";

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

const MAX_MEMORY_LINES = 50;
const MAX_MEMORY_LINE = 200;

export interface AgentContextEntry {
  kind: AgentContextKind;
  label: string;
  path: string;
  present: boolean;
  /** A count, a note -- whatever the entry can state as a fact. */
  detail: string | null;
}

export interface AgentContextDto {
  provider: AgentProvider;
  cwd: string;
  entries: AgentContextEntry[];
  /** The exact text prepended to every prompt in this chat: the system prompt's entry point. */
  preamble: string;
}

const MAX_LISTED = 200;

async function present(path: string): Promise<boolean> {
  return await stat(path).then(() => true).catch(() => false);
}

async function countEntries(path: string): Promise<number | null> {
  return await readdir(path)
    .then((rows) => rows.filter((row) => !row.startsWith(".")).slice(0, MAX_LISTED).length)
    .catch(() => null);
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
  projectPath?: string | null;
  cwd: string;
  instructions: readonly string[];
  cli?: string | null;
  memory?: AgentMemoryDigest | null;
}): string {
  const lines = (input.memory?.entries ?? [])
    .slice(0, MAX_MEMORY_LINES)
    .map(({ name, description }) => `- ${`${name}: ${description}`.slice(0, MAX_MEMORY_LINE)}`);
  return [
    "[Ralphy Media context]",
    `Library: ${input.rootPath}`,
    input.projectPath ? `Active project: ${input.projectPath}` : "Active project: none selected",
    `Working directory: ${input.cwd}`,
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
        `Drive every Ralphy step through that exact path; \`${input.cli} --help\` lists it. The library is its store -- read and change it through the CLI rather than by reading files under it.`,
      ]
      : ["No Ralphy CLI is available to this chat; do not invent one."]),
    ...(lines.length > 0
      ? [
        "",
        `Workspace memory (${input.memory?.count ?? lines.length}${input.memory?.truncated ? ", truncated" : ""}). ${input.memory?.note ?? ""}`.trim(),
        ...lines,
      ]
      : []),
    "[/Ralphy Media context]",
  ].join("\n");
}

export async function readAgentContext(input: {
  provider: AgentProvider;
  rootPath: string;
  projectPath?: string | null;
  cwd: string;
  home?: string;
  /** The absolute path of the CLI this app runs, not whatever `ralphy` resolves to. */
  cli?: string | null;
  memory?: AgentMemoryDigest | null;
}): Promise<AgentContextDto> {
  const home = input.home ?? homedir();
  const places = providerHome(input.provider, home);
  const projectFile = join(input.cwd, places.projectInstructions);
  const [globalThere, projectThere, configThere, skillCount] = await Promise.all([
    present(places.instructions),
    present(projectFile),
    present(places.config),
    countEntries(places.skills),
  ]);
  const instructions = [
    ...(globalThere ? [places.instructions] : []),
    ...(projectThere ? [projectFile] : []),
  ];
  const entries: AgentContextEntry[] = [
    {
      kind: "cwd",
      label: "Working directory",
      path: input.cwd,
      present: true,
      detail: "Where the provider's CLI runs",
    },
    {
      kind: "library",
      label: "Library",
      path: input.rootPath,
      present: true,
      detail: "Named in every prompt",
    },
    ...(input.projectPath ? [{
      kind: "project" as const,
      label: "Active project",
      path: input.projectPath,
      present: true,
      detail: "Named in every prompt",
    }] : []),
    {
      kind: "instructions",
      label: "Your instructions",
      path: places.instructions,
      present: globalThere,
      detail: globalThere ? "Read at every turn" : "Not on this machine",
    },
    {
      kind: "instructions",
      label: `${places.projectInstructions} in the working directory`,
      path: projectFile,
      present: projectThere,
      detail: projectThere ? "Read at every turn" : "Nothing there to read",
    },
    {
      kind: "config",
      label: "Provider configuration",
      path: places.config,
      present: configThere,
      detail: configThere ? null : "Not on this machine",
    },
    {
      kind: "cli",
      label: "Ralphy CLI",
      path: input.cli ?? "not available",
      present: Boolean(input.cli),
      detail: input.cli
        ? "Named by absolute path in every prompt"
        : "No CLI is available to this chat",
    },
    {
      kind: "memory",
      label: "Workspace memory",
      path: input.rootPath,
      present: (input.memory?.entries.length ?? 0) > 0,
      detail: input.memory
        ? `${input.memory.count} recalled${input.memory.truncated ? " · truncated" : ""} · in every prompt`
        : "Not recalled for this chat",
    },
    {
      kind: "skills",
      label: "Skills it can call",
      path: places.skills,
      present: skillCount !== null,
      detail: skillCount === null
        ? "No skills installed for this provider"
        : `${skillCount} installed · loaded when one is needed`,
    },
  ];
  return {
    provider: input.provider,
    cwd: input.cwd,
    entries,
    preamble: ralphyPreamble({ ...input, cwd: input.cwd, instructions }),
  };
}
