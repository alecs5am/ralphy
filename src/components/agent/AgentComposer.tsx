import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { FileText, Folder, Layers, X } from "lucide-react";
import {
  ATTACHMENT_KINDS,
  RALPHY_ENTITY_DRAG,
  readEntityDrop,
  readFileDrop,
  type Attachment,
} from "../../chat/attachments";
import { bridge } from "../../lib/ipc";
import type { ProjectSummary, WorkspaceSummary } from "../../lib/ipc";
import type { UnitDto } from "../../../electron/ralphy/types";

/**
 * Handoff 17's live composer: a field that holds text and atomic entity tags, with `@` opening a
 * picker over the caret.
 *
 * The field is `contenteditable` rather than a textarea because a tag is an element, not a run of
 * characters, and atomicity is the platform's to give: a `contenteditable="false"` chip is already
 * one unit to backspace and to the arrow keys, so none of that is re-implemented here.
 *
 * The DOM is the source of truth for what is typed and the parent is told the serialised prompt on
 * every input, which is the one thing it needs -- whether there is anything to send, and what to
 * send. A React-controlled `contenteditable` would fight the caret on every keystroke.
 *
 * A tag serialises to `@kind:ref` at its position in the text, where `ref` is something the agent
 * can resolve against the library: a unit's slug, a document's slug, a project's `workspace/project`.
 * It is a reference the way a person writing "see unit hero-cut" makes one, not a protocol.
 */

export type TagKind = "unit" | "file" | "project";

export interface TagEntity {
  kind: TagKind;
  /* What the agent resolves. */
  ref: string;
  label: string;
}

/* Kind carries the colour and the glyph. The tint is the kind's ink at 12%, so one token per kind
   answers for both themes -- see theme/agent-rail.css. */
const KINDS: Record<TagKind, { icon: typeof Layers; ink: string; tint: string; label: string }> = {
  unit: { icon: Layers, ink: "text-tag-unit", tint: "bg-tag-unit/12", label: "UNIT" },
  file: { icon: FileText, ink: "text-tag-file", tint: "bg-tag-file/12", label: "FILE" },
  project: { icon: Folder, ink: "text-tag-project", tint: "bg-tag-project/12", label: "PROJECT" },
};

/* The tag itself. `display:inline-block` with padding and no fixed height, so its text sits on the
   surrounding baseline exactly -- the handoff's alignment rule, and the reason there is no
   `vertical-align` anywhere near it. */
const TAG = "agent-tag inline-block rounded-full px-2.25 py-0.75 type-sm leading-tag whitespace-nowrap align-baseline";

export function agentTagClass(kind: TagKind): string {
  return `${TAG} is-${kind} ${KINDS[kind].tint} ${KINDS[kind].ink}`;
}

/* Handoff 2d, on the operator's own bubble: the chip takes the bubble's ink and a wash of it, and
   the kind moves to the glyph. That is the handoff's own logic rather than a shortcut -- a per-kind
   ink cannot survive here, because the bubble is dark under the light theme and light under the
   dark one, and a tag whose hue flips with the theme is no longer a tag whose hue means its kind.
   Which is also why the field's chip carries no glyph: there the colour is the kind, and it reads. */
const TAG_ON_INVERSE = `${TAG} bg-desk-primary-ink/14 text-desk-primary-ink`;

/** Renders a serialised prompt back as text and tags: the bubble's side of the same contract. */
export function AgentTaggedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let index = 0;
  for (const match of text.matchAll(/@(unit|file|project|media|memory|scheduled):([^\s]+)/g)) {
    const at = match.index;
    if (at > index) parts.push(text.slice(index, at));
    const kind = match[1] as TagKind;
    /* The bubble's chip is one style for every kind -- the operator's own bubble inverts, and a
       per-kind ink cannot survive that -- so the attachment kinds render here too, by glyph. */
    const Icon = ATTACHMENT_KINDS[kind].icon;
    parts.push(<span className={`${TAG_ON_INVERSE} is-${kind}`} key={`${at}-${match[2]}`}>
      <Icon size={11} strokeWidth={1.9} className="agent-tag-glyph mr-1.25 inline" aria-hidden="true" />
      {match[2]}
    </span>);
    index = at + match[0].length;
  }
  if (index < text.length) parts.push(text.slice(index));
  return <>{parts}</>;
}

/* What the picker can offer. Each source is real: the project the panel is already showing, its
   units, and its documents. Nothing here is a fixture -- a project with no units offers none. */
function projectEntities(
  workspace: WorkspaceSummary | null,
  project: ProjectSummary | null,
): TagEntity[] {
  if (!project) return [];
  return [{
    kind: "project",
    ref: `${project.workspaceId}/${project.projectId}`,
    label: workspace ? `${project.name} · ${workspace.name}` : project.name,
  }];
}

async function catalogFor(project: ProjectSummary | null, query: string): Promise<TagEntity[]> {
  if (!project) return [];
  const reference = { workspaceId: project.workspaceId, projectId: project.projectId };
  /* Units come whole -- a project holds tens, not thousands -- and documents come through the
     library's own search, which is the only one that knows their bodies. */
  const [units, documents] = await Promise.all([
    bridge.loadProjectPage({ tab: "units", project: reference })
      .then((page) => (page.items as UnitDto[]).map((unit): TagEntity => ({
        kind: "unit", ref: unit.slug, label: `${unit.slug} · ${unit.format}`,
      })))
      .catch(() => []),
    query
      ? bridge.searchProjectDocuments(reference, query)
        .then((page) => page.items.map((document): TagEntity => ({
          kind: "file", ref: document.slug, label: document.documentTitle || document.slug,
        })))
        .catch(() => [])
      : Promise.resolve([]),
  ]);
  return [...units, ...documents];
}

export interface AgentComposerHandle {
  /** Replace everything in the field with this text and put the caret at the end. */
  fill(text: string): void;
  clear(): void;
  focus(): void;
}

/* Walks the field and writes what the provider will receive: text as typed, a tag as `@kind:ref`
   at its own position. */
function serialise(root: HTMLElement): string {
  let out = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof HTMLElement) {
      out += node.dataset.tag ? `@${node.dataset.tag}` : node.tagName === "BR" ? "\n" : node.textContent ?? "";
    }
  }
  return out;
}

/* The `@query` a caret sitting at the end of `before` is in, or null. A query stops at whitespace,
   and an `@` in the middle of a word -- an email, a handle -- is not a trigger. The rule is a
   string rule, so it is separated from the selection it is read through and checked on its own. */
export function tagQueryAt(before: string): { start: number; query: string } | null {
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  /* The character before the `@` has to be nothing or a space, or every address becomes a picker. */
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  return { start: at, query };
}

/* ...and where the caret actually is. */
function activeQuery(root: HTMLElement): { node: Text; start: number; query: string } | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!(node instanceof Text) || !root.contains(node)) return null;
  const found = tagQueryAt(node.textContent?.slice(0, range.startOffset) ?? "");
  return found && { node, ...found };
}

export function AgentComposer({
  handle,
  workspace,
  project,
  placeholder,
  onChange,
  onSubmit,
  onEscape,
  attachments,
  onAttach,
  onDetach,
  children,
}: {
  handle: RefObject<AgentComposerHandle | null>;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  placeholder: string;
  onChange(prompt: string): void;
  onSubmit(): void;
  /* ESC with the picker closed. The picker's own ESC closes it first, which is the handoff's
     priority order: stop streaming, then close the menu. */
  onEscape(): void;
  /* Dragged in rather than typed: the strip above the field, and what a drop adds to it. */
  attachments: readonly Attachment[];
  onAttach(added: Attachment[]): void;
  onDetach(index: number): void;
  /* The controls row, which the composer draws under its own field. */
  children: ReactNode;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const [dropping, setDropping] = useState(false);
  /* The open query *is* the menu: holding it as a string rather than an object means the state
     changes when the query changes and not on every caret move, which is what lets the highlight
     survive an arrow key. `sync` runs on keyup too, and an object literal there reset the
     highlight to the first row on the very keystroke that moved it. */
  const [query, setQuery] = useState<string | null>(null);
  const [entities, setEntities] = useState<TagEntity[]>([]);
  const [highlight, setHighlight] = useState(0);

  const sync = useCallback((): void => {
    const root = field.current;
    if (!root) return;
    const prompt = serialise(root);
    setEmpty(prompt.trim().length === 0);
    onChange(prompt);
    const active = activeQuery(root);
    setQuery(active ? active.query : null);
  }, [onChange]);

  /* A new query is a new row set, so the highlight starts over -- and only then. */
  useEffect(() => { setHighlight(0); }, [query]);

  useImperativeHandle(handle, () => ({
    fill(text: string) {
      const root = field.current;
      if (!root) return;
      root.textContent = text;
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      sync();
    },
    clear() {
      const root = field.current;
      if (!root) return;
      root.replaceChildren();
      setQuery(null);
      setEmpty(true);
      onChange("");
    },
    focus() {
      field.current?.focus();
    },
  }), [onChange, sync]);

  /* The catalog is fetched per query rather than held: units are cheap and a document search is a
     query, so a stale list would be a list of the wrong project's documents. */
  useEffect(() => {
    if (query === null) return;
    let live = true;
    const timer = setTimeout(() => {
      void catalogFor(project, query).then((rows) => {
        if (live) setEntities(rows);
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, project]);

  const needle = query?.toLocaleLowerCase() ?? "";
  const rows = [...projectEntities(workspace, project), ...entities]
    .filter(({ label, ref }) => !needle || `${label} ${ref}`.toLocaleLowerCase().includes(needle))
    .slice(0, 8);
  /* The catalog can arrive shorter than where the operator has already walked, so the cursor is
     clamped rather than stored clamped: the key handler stays one line. */
  const cursor = rows.length ? Math.min(highlight, rows.length - 1) : 0;

  /* Eats the typed `@query` and puts the tag plus one non-breaking space in its place, so the caret
     lands after the tag and a following word never fuses onto it. */
  const insert = (entity: TagEntity): void => {
    const root = field.current;
    const active = root ? activeQuery(root) : null;
    if (!root || !active) return;
    const range = document.createRange();
    range.setStart(active.node, active.start);
    range.setEnd(active.node, active.start + active.query.length + 1);
    range.deleteContents();
    const tag = document.createElement("span");
    tag.className = agentTagClass(entity.kind);
    tag.contentEditable = "false";
    tag.dataset.tag = `${entity.kind}:${entity.ref}`;
    tag.textContent = entity.ref;
    const trailing = document.createTextNode(" ");
    range.insertNode(trailing);
    range.insertNode(tag);
    const after = document.createRange();
    after.setStart(trailing, 1);
    after.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(after);
    setQuery(null);
    sync();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (query !== null && rows.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((cursor + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
        return;
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        insert(rows[cursor]!);
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (query !== null) setQuery(null);
      else onEscape();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  /* The whole composer is the target, not the field: a drop is about the message, and aiming at a
     one-line field is a worse ask than aiming at the box. */
  const onDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDropping(false);
    const entities = readEntityDrop(event.dataTransfer);
    const files = entities.length === 0 ? [...event.dataTransfer.files] : [];
    const added = [...entities, ...readFileDrop(files, (file) => bridge.pathForFile(file))];
    if (added.length) onAttach(added);
  };

  return <div
    className={`agent-composer relative mx-3 mb-3 flex flex-none flex-col gap-2.25 rounded-composer bg-chat-field p-2.75 ${dropping ? "is-dropping outline-2 -outline-offset-2 outline-dashed outline-ink" : ""}`}
    onDragOver={(event) => {
      /* Only what this composer can actually take: a Ralphy entity or a file. Saying so on
         `dragover` is what turns the cursor into a copy cursor rather than a refusal. */
      if (!event.dataTransfer.types.some((type) => type === RALPHY_ENTITY_DRAG || type === "Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropping(true);
    }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false); }}
    onDrop={onDrop}
  >
    {attachments.length > 0 && <div className="agent-attachments flex flex-wrap gap-1.5" aria-label="Attachments">
      {attachments.map((attachment, index) => {
        const Icon = ATTACHMENT_KINDS[attachment.kind].icon;
        return <span
          className="agent-attachment inline-flex h-7 max-w-full items-center gap-1.75 rounded-full bg-chat-control pr-1 pl-2.5 type-sm text-ink"
          key={`${attachment.kind}:${attachment.ref}`}
        >
          <Icon size={12} strokeWidth={1.9} className="flex-none text-secondary" aria-hidden="true" />
          <span className="min-w-0 truncate">{attachment.label}</span>
          <span className="flex-none font-code type-mono-xs tracking-mono text-secondary">{ATTACHMENT_KINDS[attachment.kind].label}</span>
          <button
            className="grid size-5 flex-none place-items-center rounded-full text-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            type="button"
            aria-label={`Remove ${attachment.label}`}
            onClick={() => onDetach(index)}
          >
            <X size={11} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>;
      })}
    </div>}
    <div className="relative min-h-11">
      <div
        ref={field}
        className="agent-composer-field max-h-agent-composer min-h-11 w-full overflow-y-auto px-0.5 type-md leading-loose whitespace-pre-wrap text-ink outline-0 [overflow-wrap:anywhere]"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message agent"
        onInput={sync}
        onKeyUp={sync}
        onMouseUp={sync}
        onKeyDown={onKeyDown}
        /* Paste arrives as text: a pasted `<div>` or a pasted colour would be markup this field
           does not own, and a tag is only ever made by the picker. */
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text.replace(/\r\n?/g, "\n"));
        }}
      />
      {/* `secondary`, not `muted-decorative`: the placeholder is a real element now rather than a
          pseudo, and the decorative step measures 2.6:1 on the chat field. A line the operator is
          meant to read is not a counter. */}
      {empty && <span className="pointer-events-none absolute top-0 left-0.5 type-md leading-loose text-secondary" aria-hidden="true">{placeholder}</span>}
      {query !== null && <AgentTagMenu query={query} rows={rows} highlight={cursor} onPick={insert} />}
    </div>
    {children}
  </div>;
}

function AgentTagMenu({
  query,
  rows,
  highlight,
  onPick,
}: {
  query: string;
  rows: readonly TagEntity[];
  highlight: number;
  onPick(entity: TagEntity): void;
}) {
  return <div className="agent-tag-menu absolute bottom-full left-0 z-agent-popover mb-2 flex w-agent-tag-menu max-w-full flex-col gap-0.5 rounded-menu bg-card p-1.5 [corner-shape:squircle]">
    <span className="flex items-center gap-1.75 px-2.25 pt-1 pb-1.25">
      <span className="font-code type-mono-xs tracking-mono text-secondary">ATTACH</span>
      {query && <span className="min-w-0 truncate font-code type-mono-xs text-ink">{query}</span>}
      <span className="min-w-0 flex-1" aria-hidden="true" />
      <span className="font-code type-mono-xs tracking-mono text-secondary">↑↓ ↩ ESC</span>
    </span>
    {rows.map((entity, index) => {
      const step = KINDS[entity.kind];
      const Icon = step.icon;
      return <button
        /* `mousedown` is where the caret would be lost, so the pick happens there and the default
           is refused: by `click` the field has already blurred and the range is gone. */
        className={`agent-tag-row grid h-8 min-w-0 grid-cols-(--agent-tag-columns) items-center gap-2.25 rounded-tab px-2 text-left ${index === highlight ? "is-highlighted bg-chat-field text-ink" : "bg-transparent text-secondary hover:bg-row-hover"}`}
        type="button"
        key={`${entity.kind}:${entity.ref}`}
        onMouseDown={(event) => {
          event.preventDefault();
          onPick(entity);
        }}
      >
        <Icon size={15} strokeWidth={1.8} className={`flex-none ${step.ink}`} aria-hidden="true" />
        <span className="min-w-0 truncate type-ui">{entity.label}</span>
        <span className="font-code type-mono-xs tracking-mono text-secondary">{step.label}</span>
      </button>;
    })}
    {rows.length === 0 && <span className="px-2.25 py-2 type-ui text-secondary">
      {/* Not "no results": the field is still live, and ESC is how the operator keeps typing. */}
      No match — press ESC to keep typing
    </span>}
  </div>;
}
