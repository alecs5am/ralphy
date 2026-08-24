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
 */

export type AgentContextKind = "instructions" | "config" | "skills" | "library" | "project" | "cwd";

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
}): string {
  return [
    "[Ralphy Media context]",
    `Library: ${input.rootPath}`,
    input.projectPath ? `Active project: ${input.projectPath}` : "Active project: none selected",
    `Working directory: ${input.cwd}`,
    ...(input.instructions.length > 0
      ? [`Instructions already in your context: ${input.instructions.join(", ")}`]
      : []),
    "Use the installed Ralphy CLI (`ralphy`) for every UGC generation step; `ralphy --help` lists it.",
    "[/Ralphy Media context]",
  ].join("\n");
}

export async function readAgentContext(input: {
  provider: AgentProvider;
  rootPath: string;
  projectPath?: string | null;
  cwd: string;
  home?: string;
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
