import { open, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { MEMORY_HEADING, PREAMBLE_END, providerHome, type AgentMemoryDigest } from "./context";
import type { AgentProvider } from "../media/types";

/**
 * The prompt, as a document.
 *
 * The Context page's first shape was an inventory of files, and reading it did not tell the operator
 * what the agent would actually be told. This module builds the other reading: one scroll of blocks
 * in the order the turn carries them, each block the real text with a rail beside it saying whether
 * it rides every turn, may be pulled in, or is sealed.
 *
 * Two things it goes looking for, because both were invisible before. An instruction file names
 * other files -- `docs/playbooks/`, `~/.ralphy/prompts/covers.md` -- and those names are the chain
 * the operator actually reasons about; each one becomes a child block with its own size, or a stated
 * defect when the path resolves to nothing. And Ralphy writes a block into the machine's own
 * instruction file (`<!-- ralphy:start -->`), so that text is lifted out and attributed to the app
 * rather than left reading as something the operator wrote.
 */

/** The rail's grammar. Solid rides every turn, dashed may be pulled in. */
export type ContextRail = "solid" | "dashed";

export interface ContextBlockDto {
  id: string;
  /** The mono title line: a path when the block is a file, a name when it is not. */
  title: string;
  /** The quiet tag beside the title. */
  tag: string;
  rail: { label: string; note: string; kind: ContextRail };
  bytes: number | null;
  /** The text, verbatim. Null when there is nothing readable to show. */
  body: string | null;
  /** `markdown` renders; `text` stays mono and literal; `none` has no body. */
  format: "markdown" | "text" | "none";
  /** Lines past the excerpt; -1 when the file is longer than we read at all. */
  more: number;
  /** A sentence under the body: what the cut means, or why the block is here. */
  note: string | null;
  /** True when nothing loads this until something asks. Drives the filter and the dashed rail. */
  onDemand: boolean;
  /** The block whose text named this one. */
  linkedFrom: string | null;
  /** The paths this block's text names, so the reader can mark them live inside the body. */
  links: readonly { text: string; blockId: string | null; note: string }[];
  /** A real problem, in the page's one alert tone. */
  defect: string | null;
}

const EXCERPT_BYTES = 24_576;
const EXCERPT_LINES = 400;
const CHILD_BYTES = 8192;
const CHILD_LINES = 60;
const MAX_REFERENCES = 12;
/** Ralphy's own installer writes this block into the agent's instruction file. */
const RALPHY_START = "<!-- ralphy:start";
const RALPHY_END = "<!-- ralphy:end -->";

interface FileText {
  text: string;
  bytes: number;
  more: number;
}

async function readHead(path: string, maxBytes: number, maxLines: number): Promise<FileText | null> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return null;
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(Math.min(info.size, maxBytes));
    await handle.read(buffer, 0, buffer.length, 0);
    const lines = buffer.toString("utf8").split("\n");
    const head = lines.slice(0, maxLines);
    return {
      text: head.join("\n").trimEnd(),
      bytes: info.size,
      /* Lines we can count only when we read the whole file; otherwise the honest answer is that
         there is more and we do not know how much. */
      more: buffer.length < info.size ? -1 : lines.length - head.length,
    };
  } finally {
    await handle.close();
  }
}

/**
 * The places a body names. A token counts as one when it looks like a path -- it has a separator or
 * a home prefix -- and either ends in a document extension or in a slash. That deliberately skips
 * the prose an instruction file is full of: `and/or`, `CSV/TSV`, `.gitignore`, a URL.
 */
export function references(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.split(/[\s`'"()[\],;]+/)) {
    const token = raw.replace(/[.,;:]+$/, "");
    if (!token || token.length > 200) continue;
    if (/^[a-z][\w+.-]*:\/\//i.test(token)) continue;
    if (!/\.(?:md|markdown|toml|json|ya?ml|txt)$/i.test(token) && !token.endsWith("/")) continue;
    /* Two real segments, so `.codegraph/` and a bare `/` are not paths the text is pointing at --
       they are the prose an instruction file is full of. */
    if (token.split("/").filter(Boolean).length < 2) continue;
    found.add(token);
    if (found.size >= MAX_REFERENCES) break;
  }
  return [...found];
}

/**
 * Where a named place actually is. A `<placeholder>` resolves nowhere by construction, which is the
 * most useful thing this function reports: the instruction naming it is telling the agent to read
 * something that does not exist.
 */
function resolveReference(token: string, from: string, home: string): string | null {
  if (token.includes("<") || token.includes(">")) return null;
  if (token.startsWith("~/")) return join(home, token.slice(2));
  if (isAbsolute(token)) return token;
  return resolve(dirname(from), token);
}

async function directoryNote(path: string): Promise<string | null> {
  const names = await readdir(path).catch(() => null);
  if (!names) return null;
  const visible = names.filter((name) => !name.startsWith("."));
  return `${visible.length} ${visible.length === 1 ? "file" : "files"} here`;
}

function railFor(kind: ContextRail, label: string, note: string) {
  return { kind, label, note };
}

/** A child of an instruction file: the place its text told the agent to read. */
async function childBlock(input: {
  token: string;
  parentId: string;
  parentPath: string;
  home: string;
  /* Who wrote the sentence naming this place. A reference the operator's own file makes and does
     not resolve is normal -- they may not have written that file yet. One Ralphy wrote is a broken
     promise, and the only kind that earns the alert tone. */
  owner: "machine" | "ralphy";
}): Promise<ContextBlockDto> {
  const id = `${input.parentId}>${input.token}`;
  const target = resolveReference(input.token, input.parentPath, input.home);
  const head = target ? await readHead(target, CHILD_BYTES, CHILD_LINES) : null;
  const folder = target && !head ? await directoryNote(target) : null;
  const known = head !== null || folder !== null;
  return {
    id,
    title: input.token,
    tag: `↖ NAMED BY ${input.parentPath}`,
    rail: known
      ? railFor("dashed", "Playbook", "ON DEMAND · MAY LOAD")
      : railFor("dashed", input.owner === "ralphy" ? "Missing" : "Not written", "NAMED · NOT ON THIS MACHINE"),
    bytes: head?.bytes ?? null,
    body: head?.text ?? null,
    format: head ? (/\.(?:md|markdown)$/i.test(input.token) ? "markdown" : "text") : "none",
    more: head?.more ?? 0,
    note: head
      ? "Loads into the turn that asks for it · its cost lands on that turn, never before"
      : folder
        ? `A directory · ${folder} · the agent reads one when the instruction sends it there`
        : null,
    onDemand: true,
    linkedFrom: input.parentId,
    links: [],
    defect: known || input.owner === "machine"
      ? null
      : target === null
        ? "Ralphy's own block names a placeholder, not a path. Nothing resolves it, so the agent cannot read what the app told it to read."
        : `Ralphy's own block sends the agent to ${target}, which is not on this machine.`,
  };
}

/**
 * One place, read for the operator inside the app. The Context page used to answer "where is this"
 * with a Finder window, which is an answer that leaves the app to be useful; a skill or a playbook
 * is text, and reading text is something this app can do itself.
 *
 * A directory answers with the file an agent would read there, or with what it holds.
 */
export interface ContextFileDto {
  path: string;
  title: string;
  text: string;
  bytes: number | null;
  more: number;
  format: "markdown" | "text";
}

export async function readContextFile(path: string): Promise<ContextFileDto | null> {
  const info = await stat(path).catch(() => null);
  if (!info) return null;
  if (info.isDirectory()) {
    const names = (await readdir(path).catch(() => [])).filter((name) => !name.startsWith("."));
    for (const candidate of ["SKILL.md", "README.md", "AGENTS.md", "CLAUDE.md", "index.md"]) {
      if (!names.includes(candidate)) continue;
      const inside = await readContextFile(join(path, candidate));
      if (inside) return { ...inside, title: `${path}/${candidate}` };
    }
    return {
      path,
      title: path,
      text: names.sort().join("\n"),
      bytes: null,
      more: 0,
      format: "text",
    };
  }
  const head = await readHead(path, EXCERPT_BYTES, EXCERPT_LINES);
  return head && {
    path,
    title: path,
    text: head.text,
    bytes: head.bytes,
    more: head.more,
    format: /\.(?:md|markdown)$/i.test(path) ? "markdown" : "text",
  };
}

export interface ContextDocumentInput {
  provider: AgentProvider;
  home: string;
  cwd: string;
  rootPath: string;
  preamble: string;
  memory?: AgentMemoryDigest | null;
  /** Workspace and project documents, as the page's band reader already resolved them. */
  documents?: readonly { id: string; title: string; slug: string; scope: "workspace" | "project" }[];
}

export async function readContextDocument(input: ContextDocumentInput): Promise<ContextBlockDto[]> {
  const places = providerHome(input.provider, input.home);
  /* The provider's own system prompt is not here. It rides every turn, the provider never exposes
     it, and a block with a title and a rail gave a thing nobody can read or change the same weight
     as the files the operator writes. The page states it once, in a line, and moves on. */
  const blocks: ContextBlockDto[] = [];

  /* The instruction chain, in the order the provider reads it: its own global file first, then the
     working directory's, which is read last and wins a conflict. */
  const chain = [
    { path: places.instructions, tag: "GLOBAL · READ FIRST" },
    { path: join(input.cwd, places.projectInstructions), tag: "WORKING DIRECTORY · READ LAST, WINS ON CONFLICT" },
  ];

  for (const file of chain) {
    const head = await readHead(file.path, EXCERPT_BYTES, EXCERPT_LINES);
    if (!head) {
      blocks.push({
        id: file.path,
        title: file.path,
        tag: "ABSENT · NORMAL",
        rail: railFor("dashed", "Machine", "NOT ON THIS MACHINE"),
        bytes: null,
        body: null,
        format: "none",
        more: 0,
        note: "Nothing here to read, which is a normal state. If you write this file, every agent on this Mac reads it.",
        onDemand: false,
        linkedFrom: null,
        links: [],
        defect: null,
      });
      continue;
    }

    /* Ralphy's installer writes a block into this file. Attributing it to the app rather than
       leaving it inside the machine's text is the difference between "you wrote this" and "we did";
       the machine block still shows the file whole, because whole is what the provider sends. */
    const start = head.text.indexOf(RALPHY_START);
    const end = head.text.indexOf(RALPHY_END);
    const injected = start >= 0 && end > start
      ? head.text.slice(head.text.indexOf("\n", start) + 1, end).trim()
      : null;

    const tokens = references(head.text);
    const owned = new Set(injected ? references(injected) : []);
    const children = await Promise.all(tokens.map((token) => childBlock({
      token,
      parentId: file.path,
      parentPath: file.path,
      home: input.home,
      owner: owned.has(token) ? "ralphy" : "machine",
    })));
    const byToken = new Map(children.map((child) => [child.title, child]));

    blocks.push({
      id: file.path,
      title: file.path,
      tag: file.tag,
      rail: railFor("solid", "Machine", "EVERY TURN · GUARANTEED"),
      bytes: head.bytes,
      body: head.text,
      format: "markdown",
      more: head.more,
      note: null,
      onDemand: false,
      linkedFrom: null,
      links: tokens.map((token) => ({
        text: token,
        blockId: byToken.get(token)?.id ?? null,
        note: byToken.get(token)?.defect ? "not there" : byToken.get(token)?.bytes === null ? "elsewhere" : "may load",
      })),
      defect: null,
    });

    if (injected) {
      const injectedTokens = references(injected);
      blocks.push({
        id: `${file.path}#ralphy`,
        title: "Ralphy's own block, inside the file above",
        tag: "WRITTEN BY THE APP · v1",
        rail: railFor("solid", "Ralphy", "EVERY TURN · GUARANTEED"),
        bytes: Buffer.byteLength(injected),
        body: injected,
        format: "markdown",
        more: 0,
        note: "Ralphy's CLI installed this into the machine file. Its size is already counted in the block above; it is separated here because the app wrote it, not you.",
        onDemand: false,
        linkedFrom: file.path,
        links: injectedTokens.map((token) => ({
          text: token,
          blockId: byToken.get(token)?.id ?? null,
          note: byToken.get(token)?.defect ? "not there" : byToken.get(token)?.bytes === null ? "elsewhere" : "may load",
        })),
        defect: injectedTokens.some((token) => byToken.get(token)?.defect)
          ? "This block sends the agent to places that do not resolve from its working directory. Until the app ships its prompts into the library, the routing it describes does not exist."
          : null,
      });
    }

    blocks.push(...children);
  }

  const config = await readHead(places.config, EXCERPT_BYTES, EXCERPT_LINES);
  if (config) {
    blocks.push({
      id: places.config,
      title: places.config,
      tag: "PROVIDER CONFIGURATION",
      rail: railFor("solid", "Machine", "EVERY TURN · GUARANTEED"),
      bytes: config.bytes,
      body: config.text,
      format: "text",
      more: config.more,
      note: null,
      onDemand: false,
      linkedFrom: null,
      links: [],
      defect: null,
    });
  }

  /* The preamble, split where the memory section starts: the app's own lines and the workspace's
     recalled rules are two different things with two different owners, and one block would have
     counted the digest inside a figure labelled "the app". */
  const at = input.preamble.indexOf(MEMORY_HEADING);
  const appLines = at < 0
    ? input.preamble
    : `${input.preamble.slice(0, at).trimEnd()}\n${PREAMBLE_END}`;
  const memoryLines = at < 0
    ? null
    : input.preamble.slice(at, input.preamble.lastIndexOf(PREAMBLE_END)).trimEnd();

  blocks.push({
    id: "preamble",
    title: "Ralphy preamble",
    tag: "COMPOSED BY THE APP · SENT VERBATIM",
    rail: railFor("solid", "Ralphy", "EVERY TURN · GUARANTEED"),
    bytes: Buffer.byteLength(appLines),
    body: appLines,
    format: "text",
    more: 0,
    note: "The app writes this itself, so it is the one block on the page whose text is not on disk anywhere.",
    onDemand: false,
    linkedFrom: null,
    links: [],
    defect: null,
  });

  if (memoryLines) {
    blocks.push({
      id: "memory",
      title: "Workspace memory digest",
      tag: input.memory?.truncated
        ? `CAPPED AT 50 · ${input.memory.count} RECALLED, SOME DID NOT FIT`
        : `${input.memory?.count ?? 0} SENT · NOTHING CUT`,
      rail: railFor("solid", "Memory", "EVERY TURN · DIGEST"),
      bytes: Buffer.byteLength(memoryLines),
      body: memoryLines,
      format: "text",
      more: 0,
      note: "Recalled as reference, not as instructions. It rides inside the preamble above.",
      onDemand: false,
      linkedFrom: "preamble",
      links: [],
      defect: input.memory?.truncated
        ? "More entries were recalled than the preamble carries. The ones past the cap were not sent."
        : null,
    });
  }

  for (const document of input.documents ?? []) {
    blocks.push({
      id: `document:${document.id}`,
      title: document.title || document.slug,
      tag: document.scope === "project"
        ? "PROJECT DOCUMENT · WINS OVER THE WORKSPACE ON THE SAME SLUG"
        : "WORKSPACE DOCUMENT",
      rail: railFor("dashed", document.scope === "project" ? "Project" : "Workspace", "ON DEMAND · MAY LOAD"),
      bytes: null,
      body: null,
      format: "none",
      more: 0,
      note: "Stored in the library. Nothing loads it until you or the agent ask for it by name.",
      onDemand: true,
      linkedFrom: null,
      links: [],
      defect: null,
    });
  }

  return blocks;
}
