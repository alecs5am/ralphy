import { lstat, open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentProvider } from "../media/types";
import { providerHome, ralphyPreamble, type AgentMemoryDigest } from "./context";
import { readContextDocument, type ContextBlockDto } from "./context-document";

/**
 * The Context page's data: what the agent already knows before it reads the operator's message,
 * grouped into the five layers that carry it, in the order the agent receives them.
 *
 * The rejected shape for this was a composer popover listing file paths, which answered "which
 * files" and nothing else. A row here answers five things -- what it is, where it lives, whether it
 * is there, when it loads, and the one thing you can do about it -- because the page exists to stop
 * the app from being the only party that knows what it sent.
 *
 * Two rules the reader must not break. It never estimates a token count: the provider reports one
 * input figure per turn and no per-layer attribution, so a row states the bytes it measured on disk
 * and the page says so. And an absent file is a fact, not an error -- `absent` is a normal presence
 * and only a real defect gets the alert tone.
 */

export type ContextLayerId = "machine" | "ralphy" | "workspace" | "project" | "skills";

/**
 * How a row reaches the turn. `sealed` is the provider's own prompt: it is in every turn and we
 * cannot read it. `shadowed` is present but out-voted by a row of the same slug in a later layer.
 * `defect` is the only tone that draws red -- something the app promised and did not deliver.
 */
export type ContextPresence = "every-turn" | "on-demand" | "absent" | "shadowed" | "sealed" | "defect";

/** Where the one action on a row leads. The renderer owns what each one does. */
export type ContextActionKind = "read" | "view-assembled" | "memory-page" | "document";

export interface ContextRowDto {
  id: string;
  label: string;
  /** Printed verbatim and selectable. Empty when the row is not a place on disk. */
  path: string;
  /** The quiet sentence under the name: what it is, or why it is not there. */
  note: string;
  presence: ContextPresence;
  /** The tag beside the presence dot, already in the page's voice. */
  tag: string;
  /** Bytes on disk, when the row is a file we measured. Never converted into tokens. */
  bytes: number | null;
  action: { label: string; kind: ContextActionKind; target?: string } | null;
  /** The head of the file, for the assembled view. Only rows whose text really reaches the turn
      carry one, and it is quoted rather than summarised. */
  excerpt?: { text: string; more: number } | null;
}

export interface ContextLayerDto {
  id: ContextLayerId;
  label: string;
  /** The header's quiet sentence: whose the layer is and what editing it reaches. */
  note: string;
  rows: ContextRowDto[];
  /** A count the header states when the layer counts things rather than carrying one figure. */
  count: number | null;
  /** Why the layer could not be read. The band still renders; it just does not pretend. */
  unavailable: string | null;
  /** Set on the one layer whose edits leave this app. */
  warning: string | null;
  /** What would go here, when nothing does. A band is never hidden for being empty. */
  empty?: string | null;
}

export interface ContextPageDto {
  provider: AgentProvider;
  cwd: string;
  layers: ContextLayerDto[];
  /** The exact text this chat prepends, so the assembled view quotes rather than reconstructs. */
  preamble: string;
  /** The same context read as one document, in the order the turn carries it. */
  blocks: ContextBlockDto[];
}

/** A document as the page needs it: enough to name it, place it and see who wins its slug. */
export interface ContextDocument {
  id: string;
  slug: string;
  title: string;
  kind: string;
  revisions: number | null;
}

const PROVIDER_LABEL: Record<AgentProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  openrouter: "OpenRouter",
};

async function bytesOf(path: string): Promise<number | null> {
  return await stat(path).then((row) => (row.isFile() ? row.size : null)).catch(() => null);
}

const EXCERPT_BYTES = 4096;
const EXCERPT_LINES = 24;

/**
 * The head of a file the turn really carries. Read as a bounded prefix rather than whole: the
 * assembled view is a document to read, and a 12K instruction file pasted in full is not one. The
 * count of what was cut is stated, because a silent truncation is the failure this page prevents.
 */
async function excerpt(path: string, size: number | null): Promise<{ text: string; more: number } | null> {
  if (size === null) return null;
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(Math.min(size, EXCERPT_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
    const lines = buffer.toString("utf8").split("\n");
    const head = lines.slice(0, EXCERPT_LINES);
    /* Lines beyond the prefix we read are unknown, so the count is of the file's own newlines when
       we read all of it and "the rest" when we did not. */
    const cut = buffer.length < size ? -1 : lines.length - head.length;
    return { text: head.join("\n").trimEnd(), more: cut };
  } finally {
    await handle.close();
  }
}

/**
 * The skills a provider will name to the model, and where each one really lives. A symlink is
 * called out because following it is how a directory the operator believes is Ralphy's turns out
 * to be the tree every other tool on the machine reads.
 */
async function readSkills(path: string): Promise<{ slug: string; link: string | null }[] | null> {
  const names = await readdir(path).catch(() => null);
  if (!names) return null;
  return await Promise.all(names
    .filter((name) => !name.startsWith("."))
    .sort()
    .map(async (slug) => ({
      slug,
      link: await lstat(join(path, slug))
        .then((row) => (row.isSymbolicLink() ? join(path, slug) : null))
        .catch(() => null),
    })));
}

function machineLayer(input: {
  provider: AgentProvider;
  places: ReturnType<typeof providerHome>;
  projectFile: string;
  sizes: { instructions: number | null; project: number | null; config: number | null };
  heads: { instructions: { text: string; more: number } | null; project: { text: string; more: number } | null };
}): ContextLayerDto {
  const name = PROVIDER_LABEL[input.provider];
  const file = (
    label: string,
    path: string,
    bytes: number | null,
    absent: string,
    head: { text: string; more: number } | null = null,
  ): ContextRowDto => ({
    id: path,
    label,
    path,
    note: bytes === null ? absent : "Read before your first word, every turn",
    presence: bytes === null ? "absent" : "every-turn",
    tag: bytes === null ? "ABSENT · NORMAL" : "EVERY TURN",
    bytes,
    action: bytes === null ? null : { label: "Read", kind: "read", target: path },
    excerpt: head,
  });
  return {
    id: "machine",
    label: "Machine",
    note: "shared with every tool on this Mac",
    count: null,
    unavailable: null,
    /* The only warning on the page. These files are not Ralphy's: a change here is read by every
       other agent installed on the machine, which is not what "edit my instructions" sounds like. */
    warning: `An edit here reaches ${name}, every other agent on this Mac, and this chat alike`,
    rows: [
      file(
        `Your ${name} instructions`,
        input.places.instructions,
        input.sizes.instructions,
        "Not on this machine",
        input.heads.instructions,
      ),
      file(
        `${input.places.projectInstructions} in the working directory`,
        input.projectFile,
        input.sizes.project,
        "Nothing there to read",
        input.heads.project,
      ),
      file(`${name} configuration`, input.places.config, input.sizes.config, "Not on this machine"),
      {
        id: "sealed",
        label: `${name}'s own system prompt`,
        path: "",
        note: "Shown because it is part of every turn. The provider never exposes this text.",
        presence: "sealed",
        tag: "SEALED BY THE PROVIDER",
        bytes: null,
        action: null,
      },
    ],
  };
}

/**
 * What the app itself puts in. The preamble is real and quoted; the prompt pack is the defect the
 * handoff filed as D3 -- Ralphy creates `~/.ralphy` and ships no prompts into it, so the row says
 * so in the alert tone rather than describing a pack that is not there.
 */
function ralphyLayer(input: {
  rootPath: string;
  cli: string | null;
  preamble: string;
  pack: { path: string; bytes: number | null };
  overrides: { path: string; present: boolean };
}): ContextLayerDto {
  return {
    id: "ralphy",
    label: "Ralphy",
    note: "put in by the app · read-only",
    count: null,
    unavailable: null,
    warning: null,
    rows: [
      {
        id: "preamble",
        label: "Injected preamble",
        path: input.cli ?? input.rootPath,
        note: input.cli
          ? "Composed by the app · names its own binary by absolute path"
          : "Composed by the app · no CLI is available to this chat",
        presence: "every-turn",
        tag: "EVERY TURN",
        bytes: Buffer.byteLength(input.preamble),
        action: { label: "View", kind: "view-assembled" },
      },
      {
        id: "pack",
        label: "Bundled prompt pack",
        path: input.pack.path,
        note: input.pack.bytes === null
          ? "The app should ship its prompts here on install and replace them on update. It does not yet."
          : "Brought by the app · replaced wholesale on update",
        presence: input.pack.bytes === null ? "defect" : "on-demand",
        tag: input.pack.bytes === null ? "NOT SHIPPED" : "ON DEMAND",
        bytes: input.pack.bytes,
        action: input.pack.bytes === null ? null : { label: "Read", kind: "read", target: input.pack.path },
      },
      {
        id: "overrides",
        label: "Your prompt overrides",
        path: input.overrides.path,
        note: input.overrides.present
          ? "Yours · shadows a pack file of the same name, and an update never touches it"
          : "Where your own version of a pack prompt would live. Nothing here.",
        presence: input.overrides.present ? "on-demand" : "absent",
        tag: input.overrides.present ? "OVERRIDDEN BY YOU" : "ABSENT · NORMAL",
        bytes: null,
        action: input.overrides.present
          ? { label: "Read", kind: "read", target: input.overrides.path }
          : null,
      },
    ],
  };
}

/**
 * The operator's own layer, and the only one whose rows they edit here. A document is `on-demand`
 * because nothing loads it unasked -- that is the honest tag until the app can carry one into the
 * preamble, and the handoff filed the gap as D4.
 */
function documentRow(document: ContextDocument, shadowedBy: string | null): ContextRowDto {
  return {
    id: document.id,
    label: document.title || document.slug,
    path: document.slug,
    note: shadowedBy
      ? "The project document of the same slug wins, so this text never reaches the agent"
      : "Stored in this library · nothing loads it until you or the agent ask",
    presence: shadowedBy ? "shadowed" : "on-demand",
    tag: shadowedBy ? "SHADOWED · THE PROJECT VERSION WINS" : "ON DEMAND",
    bytes: null,
    action: { label: shadowedBy ? "See winner" : "Open", kind: "document", target: document.id },
  };
}

function memoryRow(memory: AgentMemoryDigest | null): ContextRowDto {
  const count = memory?.count ?? 0;
  return {
    id: "memory",
    label: "Memory",
    path: "",
    note: memory
      ? memory.note
      : "Nothing recalled for this chat",
    presence: count > 0 ? "every-turn" : "absent",
    tag: count > 0
      ? `${count} ACTIVE${memory?.truncated ? " · TRUNCATED AT THE CAP" : ""} · IN THE PREAMBLE`
      : "ABSENT · NORMAL",
    bytes: null,
    action: { label: "Review", kind: "memory-page" },
  };
}

export interface ContextPageInput {
  provider: AgentProvider;
  rootPath: string;
  projectPath?: string | null;
  projectName?: string | null;
  cwd: string;
  home?: string;
  cli?: string | null;
  memory?: AgentMemoryDigest | null;
  /** Workspace-owned documents. `null` when Core did not answer -- not the same as none. */
  workspaceDocuments?: readonly ContextDocument[] | null;
  projectDocuments?: readonly ContextDocument[] | null;
  /** Why Core could not be read, when it could not. */
  coreUnavailable?: string | null;
}

export async function readContextPage(input: ContextPageInput): Promise<ContextPageDto> {
  const home = input.home ?? homedir();
  const places = providerHome(input.provider, home);
  const projectFile = join(input.cwd, places.projectInstructions);
  const packPath = join(input.rootPath, "prompts");
  const overridePath = join(input.rootPath, "prompts.local");
  const [instructions, project, config, pack, overrides, skills] = await Promise.all([
    bytesOf(places.instructions),
    bytesOf(projectFile),
    bytesOf(places.config),
    stat(packPath).then((row) => (row.isDirectory() ? 0 : null)).catch(() => null),
    stat(overridePath).then(() => true).catch(() => false),
    readSkills(places.skills),
  ]);

  const [instructionsHead, projectHead] = await Promise.all([
    excerpt(places.instructions, instructions),
    excerpt(projectFile, project),
  ]);

  const present = [
    ...(instructions === null ? [] : [places.instructions]),
    ...(project === null ? [] : [projectFile]),
  ];
  const preamble = ralphyPreamble({
    rootPath: input.rootPath,
    projectPath: input.projectPath,
    cwd: input.cwd,
    instructions: present,
    cli: input.cli,
    memory: input.memory,
  });

  const projectSlugs = new Set((input.projectDocuments ?? []).map((document) => document.slug));
  const workspaceRows = input.workspaceDocuments === null || input.workspaceDocuments === undefined
    ? []
    : input.workspaceDocuments.map((document) => documentRow(
      document,
      projectSlugs.has(document.slug) ? document.slug : null,
    ));

  const blocks = await readContextDocument({
    provider: input.provider,
    home,
    cwd: input.cwd,
    rootPath: input.rootPath,
    preamble,
    memory: input.memory,
    documents: [
      ...(input.workspaceDocuments ?? []).map((row) => ({ ...row, scope: "workspace" as const })),
      ...(input.projectDocuments ?? []).map((row) => ({ ...row, scope: "project" as const })),
    ],
  });

  return {
    provider: input.provider,
    cwd: input.cwd,
    preamble,
    blocks,
    layers: [
      machineLayer({
        provider: input.provider,
        places,
        projectFile,
        sizes: { instructions, project, config },
        heads: { instructions: instructionsHead, project: projectHead },
      }),
      ralphyLayer({
        rootPath: input.rootPath,
        cli: input.cli ?? null,
        preamble,
        pack: { path: packPath, bytes: pack },
        overrides: { path: overridePath, present: overrides },
      }),
      {
        id: "workspace",
        label: "Workspace",
        note: "yours · the only rows you edit here",
        count: null,
        unavailable: input.coreUnavailable ?? null,
        warning: null,
        rows: [...workspaceRows, memoryRow(input.memory ?? null)],
        /* The most common real state, and the one worth naming: a workspace with no documents is
           not broken, it is a workspace nobody has written a brief or a style guide for yet. */
        empty: workspaceRows.length === 0
          ? "No document of your own yet. A style guide or a brief written here is what the agent reads when a task mentions your voice."
          : null,
      },
      {
        id: "project",
        label: "Project",
        note: input.projectName
          ? `${input.projectName} · wins over the workspace on the same slug`
          : "no project selected for this chat",
        count: null,
        unavailable: input.coreUnavailable ?? null,
        warning: null,
        rows: (input.projectDocuments ?? []).map((document) => documentRow(document, null)),
      },
      {
        id: "skills",
        label: "Skills",
        note: "named every turn · a body loads only when one fires",
        count: skills?.length ?? null,
        unavailable: skills === null ? `No skills directory for this provider at ${places.skills}` : null,
        warning: null,
        rows: (skills ?? []).map(({ slug, link }) => ({
          id: `skill:${slug}`,
          label: slug,
          path: join(places.skills, slug),
          /* The origin question the marketplace could not answer: a symlinked skill is shared with
             every other tool that reads the target, so removing it here removes it for them too. */
          note: link
            ? "Symlink · shared with every other tool that reads its target"
            : "Already on this Mac · installed outside Ralphy",
          presence: "on-demand",
          tag: link ? "SYMLINK · SHARED" : "ON DEMAND",
          bytes: null,
          action: { label: "Read", kind: "read", target: join(places.skills, slug) },
        })),
      },
    ],
  };
}
