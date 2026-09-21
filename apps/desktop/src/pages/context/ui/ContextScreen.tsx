import { PageHeader, PAGE_HEADER_BUTTON } from "@/shared/ui/PageHeader";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Brain, ChevronDown, FileText, Layers, Package, ScrollText, Settings2, Sparkles,
} from "@/shared/ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ContextLayerDto,
  ContextLayerId,
  ContextPageDto,
  ContextPresence,
  ContextRowDto,
} from "../../../../electron/agent/context-page";
import type { ContextFileDto } from "../../../../electron/agent/context-document";
import type { AgentChatUsage } from "@/features/agent-chat";
import { bridge, type AgentPermissionMode, type AgentProvider, type ProjectSummary } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "@/shared/ui/route-chrome";
import { ContextUsage } from "./ContextUsage";
import { ContextDocument, followPath, linkPaths, markPaths } from "./ContextDocument";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { Window, WindowBody, WINDOW } from "@/shared/ui/Window";

export const contextInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.context",
  states: ["loading", "ready", "partial", "unavailable", "selected"],
  rootMarker: "workspace-context",
  landmarks: ["Context", "What this chat can draw on"],
} as const);

/**
 * The Context page: everything a chat carries before the agent reads the operator's message, in the
 * five layers that carry it and in the order the agent receives them.
 *
 * Its one rule is that no figure on it is invented. The provider reports one input total per turn
 * and never says which layer that total came from, so the page shows the measured total, states that
 * per-layer attribution is not reported, and gives each row the bytes it measured on disk rather
 * than a token count derived from them. A row with nothing in it reads `—`, never `0`: a dash says
 * "not reported", and a zero would be a claim.
 *
 * The second rule is that absent is normal. Only two things draw the alert tone -- an edit that
 * would leave this app, and something Ralphy promised and did not deliver.
 */

const LAYER_ICON: Record<ContextLayerId, typeof Layers> = {
  machine: Settings2,
  ralphy: Package,
  workspace: FileText,
  project: ScrollText,
  skills: Sparkles,
};

/* A ring rather than a fill: the page separates "loads every turn" from "loads when asked" by the
   shape of the mark, so the two never depend on telling two greys apart. */
const RING = "bg-transparent inset-ring-2 inset-ring-muted-decorative";

/* The presence dot is the page's whole vocabulary for "when does this load", so each state is a
   distinct shape rather than a distinct colour: solid loads every turn, a ring loads on demand, a
   faint disc is absent or out-voted, and only a defect is red. */
const PRESENCE_DOT: Record<ContextPresence, string> = {
  "every-turn": "bg-ink",
  "on-demand": RING,
  absent: "bg-layer-absent",
  shadowed: "bg-layer-absent",
  sealed: RING,
  defect: "bg-alert",
};

const MONO = "font-code tracking-caps";
const META = `${MONO} type-mono-xs text-muted`;
const PATH = "truncate font-code type-mono-xs text-muted select-text";
const BAND_NAME = "type-ui text-ink";
const NUMBER = "font-display font-extrabold tracking-normal text-ink";
const PILL = "inline-flex h-6 flex-none items-center rounded-control bg-field px-2.5 type-label text-ink hover:bg-row-hover";
const PILL_GHOST = "inline-flex h-7.5 flex-none items-center gap-1.75 rounded-control bg-transparent px-3 type-sm text-muted hover:text-ink";
const PILL_PRIMARY = "inline-flex h-control-md flex-none items-center gap-2 rounded-control bg-brand px-3.5 type-sm text-brand-ink hover:opacity-88";

/** A count the operator reads as a size, in the unit we actually measured. */
function bytes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
}

function Row({ row, onAction }: { row: ContextRowDto; onAction(row: ContextRowDto): void }) {
  const muted = row.presence === "absent" || row.presence === "shadowed";
  const dot = PRESENCE_DOT[row.presence];
  return <div className="context-row grid min-h-context-row grid-cols-(--context-row-columns) items-center gap-3.5 rounded-row px-2.5 py-2 hover:bg-row-hover">
    {/* The dot sits on the name's own line, not on the centre of a three-line block. */}
    <i className={`mt-1 size-1.5 self-start rounded-full ${dot}`} aria-hidden="true" />
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={`truncate type-sm ${muted ? "text-muted" : "text-ink"}`}>{row.label}</span>
      {row.path && <span className={PATH} title={row.path}>{row.path}</span>}
      <span className={`type-sm ${muted ? "text-muted" : "text-secondary"}`}>{row.note}</span>
    </span>
    <span className={`${MONO} type-mono-2xs flex-none text-right ${row.presence === "defect" ? "text-failure-ink" : "text-muted"}`}>
      {row.tag}
    </span>
    <span className={`${MONO} type-mono-sm w-14 flex-none text-right text-muted`}>{bytes(row.bytes)}</span>
    {row.action
      ? <button className={PILL} type="button" onClick={() => onAction(row)}>{row.action.label}</button>
      : <span className="w-0" aria-hidden="true" />}
  </div>;
}

function Band({ layer, open, onToggle, onAction }: {
  layer: ContextLayerDto;
  open: boolean;
  onToggle(): void;
  onAction(row: ContextRowDto): void;
}) {
  const Icon = LAYER_ICON[layer.id];
  return <section className="context-band flex flex-col" aria-label={layer.label}>
    <button
      className="context-band-header flex h-context-band items-center gap-2.5 rounded-row px-2.5 text-left hover:bg-row-hover"
      type="button"
      aria-expanded={open}
      onClick={onToggle}
    >
      <ChevronDown
        size={12}
        strokeWidth={2}
        className={`flex-none text-muted transition-transform duration-state ease-instrument ${open ? "" : "-rotate-90"}`}
        aria-hidden="true"
      />
      <Icon size={13} strokeWidth={1.8} className="flex-none text-secondary" aria-hidden="true" />
      <span className={BAND_NAME}>{layer.label}</span>
      <span className="min-w-0 truncate type-sm text-muted">{layer.note}</span>
      <span className="min-w-0 flex-1" aria-hidden="true" />
      {/* The only red on the page besides a defect: an edit here is read by every other agent. */}
      {layer.warning && <span className={`${MONO} type-mono-2xs flex-none text-failure-ink`}>{layer.warning.toLocaleUpperCase()}</span>}
      <span className={`${NUMBER} type-sm flex-none`}>{layer.count === null ? "—" : layer.count}</span>
    </button>
    {open && <div className="flex flex-col pl-context-indent">
      {layer.unavailable
        ? <p className={`m-0 rounded-row bg-panel px-3 py-2.5 type-sm text-muted`}>
          {layer.unavailable} — this band's source is the library store, so it says nothing rather
          than reading empty. The file-backed bands above still read.
        </p>
        : layer.rows.length === 0
          ? <p className="m-0 px-2.5 py-2.5 type-sm text-muted">
            {layer.empty ?? "Nothing here yet. This is a normal state, not a failure."}
          </p>
          : <>
            {layer.rows.map((row) => <Row row={row} onAction={onAction} key={row.id} />)}
            {layer.empty && <p className="m-0 px-2.5 pt-1 pb-2.5 type-sm text-muted">{layer.empty}</p>}
          </>}
    </div>}
  </section>;
}

/**
 * One place, read in the app. A skill, a playbook, an override file: text the agent will read, so
 * text the operator can read here rather than in whatever editor the Finder hands the file to.
 *
 * A viewer over the page rather than a panel inside it: a playbook is opened from a name buried in
 * a routing table, and pushing the document down to make room for it loses the name that was
 * clicked. It closes on Escape, on the backdrop, and from its own header.
 */
function Reader({ file, onRead, onClose }: {
  file: ContextFileDto | { path: string; failure: string };
  onRead(path: string): void;
  onClose(): void;
}) {
  const failure = "failure" in file ? file.failure : null;
  const body = useRef<HTMLDivElement>(null);
  /* A router opened here routes onward, so the reader marks its paths the same way the document
     does -- following a routing table never runs out of links. */
  useEffect(() => markPaths(body.current, "links" in file ? file.links : []), [file]);
  return <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay className="fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content
        className={`context-reader fixed inset-6 z-scrim-content m-auto h-fit max-h-context-reader w-full max-w-context-column text-ink outline-none ${WINDOW}`}
        data-instrument-overlay="context-reader"
      >
        <div className="flex h-10 flex-none items-center gap-2.5 px-3">
          <span className={`${MONO} type-mono-2xs text-muted`}>READING</span>
          <Dialog.Title asChild>
            <span className={`${MONO} min-w-0 flex-1 truncate type-mono-xs text-secondary`}>
              {"title" in file ? file.title : file.path}
            </span>
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {"path" in file ? `The contents of ${file.path}` : "This place could not be read"}
          </Dialog.Description>
          {"bytes" in file && file.bytes !== null && <span className={META}>{bytes(file.bytes)}</span>}
          <Dialog.Close asChild><button className={PILL} type="button">Close</button></Dialog.Close>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-frame bg-card px-5 py-4">
          {failure && <p className="m-0 type-sm text-failure-ink">{failure}</p>}
          {"format" in file && file.format === "markdown"
            && <div className="context-body" ref={body} onClick={followPath(onRead)}>
              <MarkdownView markdown={linkPaths(file.text, "links" in file ? file.links : [])} />
            </div>}
          {"format" in file && file.format === "text" && <pre
            className={`${MONO} m-0 overflow-x-auto whitespace-pre-wrap type-mono-xs leading-document text-secondary`}
          >{file.text}</pre>}
          {"more" in file && file.more > 0 && <p className={`${META} m-0`}>
            {`FIRST PART SHOWN · ${bytes(file.more)} MORE IN THE FILE`}
          </p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function ContextScreen({ provider, permissionMode = "plan", project, workspaceId, usage, onOpenMemory }: {
  provider: AgentProvider;
  permissionMode?: AgentPermissionMode;
  project: ProjectSummary | null;
  workspaceId: string | null;
  usage: AgentChatUsage | null;
  onOpenMemory(): void;
}) {
  const [page, setPage] = useState<ContextPageDto | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  /* The document is what the page opens on. The inventory answers a different question -- which
     files, what can I do about them -- and the operator asks that one second. */
  const [inventory, setInventory] = useState(false);
  /* A place the operator asked to read, read here. The page used to answer "what is in this" with a
     Finder window, which is an answer that has to leave the app to be useful. */
  const [file, setFile] = useState<ContextFileDto | { path: string; failure: string } | null>(null);
  /* Machine, Ralphy and Workspace open; Project and Skills closed. The two closed ones are lists
     whose length the header already states, and the operator opens them to answer a question. */
  const [open, setOpen] = useState<Record<ContextLayerId, boolean>>({
    machine: true, ralphy: true, workspace: true, project: false, skills: false,
  });
  const projectId = project?.projectId ?? null;

  useEffect(() => {
    let live = true;
    setPage(null);
    setFailure(null);
    /* Read on mount rather than held: a file appears the moment the operator writes it, and a
       stale inventory is worse on this page than anywhere else in the app. */
    void bridge.loadAgentContext({
      provider,
      permissionMode,
      workspaceId,
      project: project ? { workspaceId: project.workspaceId, projectId: project.projectId } : null,
    })
      .then((value) => { if (live) setPage(value); })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error.message : "The bridge did not answer");
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a project is its two ids
  }, [provider, permissionMode, workspaceId, projectId, refresh]);

  /* One loader for both surfaces: a row's action and a name inside the prompt open the same
     reader, so a place that cannot be read says so in one voice. */
  const read = useCallback((path: string) => {
    void bridge.readContextPath(path)
      .then((value) => setFile(value ?? { path, failure: "Nothing there to read any more" }))
      .catch((error: unknown) => setFile({
        path,
        failure: error instanceof Error ? error.message : "The bridge did not answer",
      }));
  }, []);

  const act = useCallback((row: ContextRowDto) => {
    if (!row.action) return;
    if (row.action.kind === "memory-page") onOpenMemory();
    else if (row.action.kind === "view-assembled") setInventory(false);
    else if (row.action.kind === "read" && row.action.target) read(row.action.target);
  }, [onOpenMemory, read]);

  const state = failure ? "unavailable" : !page ? "loading" : inventory ? "selected" : "ready";
  const total = useMemo(() => (page?.layers ?? []).reduce(
    (sum, band) => sum + band.rows.filter((row) => row.presence === "every-turn").length,
    0,
  ), [page]);

  return <InstrumentScreenRoot descriptor={contextInstrumentStates} state={state}>
    <main className="main-region context-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto bg-transparent p-2 type-base text-ink">
      {file && <Reader file={file} onRead={read} onClose={() => setFile(null)} />}
      <PageHeader title="Context" icon={Layers} meta={`${provider === "claude" ? "Claude" : "Codex"} · ${project?.name ?? "Current workspace"}`}>
        <div className="page-header-segments flex items-center gap-0.5 rounded-full bg-panel p-0.5" role="group" aria-label="Context view"><button className={PAGE_HEADER_BUTTON} type="button" aria-label="Instruction chain" title="Instruction chain" aria-pressed={!inventory} onClick={() => setInventory(false)}><ScrollText size={14} /><span className="page-header-action-label">Instructions</span></button><button className={PAGE_HEADER_BUTTON} type="button" aria-label="Source inventory" title="Source inventory" aria-pressed={inventory} onClick={() => setInventory(true)}><FileText size={14} /><span className="page-header-action-label">Sources</span></button></div>
        <button className={PAGE_HEADER_BUTTON} type="button" aria-label="Memory" title="Open Memory" onClick={onOpenMemory}><Brain size={14} /><span className="page-header-action-label">Memory</span></button>
      </PageHeader>
      <Window className="mx-auto w-full max-w-context-column shrink-0">
        <WindowBody>
          <p className="m-0 px-3 pt-3 type-sm leading-prose text-secondary">What this chat can draw on: instructions, source documents and available tools.</p>
          <ContextUsage usage={usage} provider={provider} />
        </WindowBody>
      </Window>
      {failure && <div role="alert" className={PROJECT_LOCAL_ERROR}>Could not load context. {failure} <button type="button" className="underline" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {!page && !failure && <p className={PROJECT_SKELETON}>Reading what this chat carries…</p>}
      {page && !inventory && <ContextDocument
        blocks={page.blocks ?? []}
        provider={provider}
        onOpenInventory={() => setInventory(true)}
        onRead={read}
      />}
      {page && inventory
        && <Window className="mx-auto w-full max-w-context-column shrink-0">
          <div className="flex h-9 flex-none items-center gap-2.5 px-3">
            <span className={`${MONO} type-mono-sm text-muted`}>CONTEXT</span>
            <span className="truncate type-sm text-ink">{project ? project.name : "this workspace"}</span>
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <span className={`${MONO} type-mono-2xs text-muted`}>
              {`${provider.toLocaleUpperCase()} · ${total} ROWS IN EVERY TURN`}
            </span>
            <button className={PILL} type="button" onClick={() => setInventory(false)}>Instruction chain</button>
          </div>
          <div className="flex w-full flex-col rounded-frame bg-card">
            {page && <>
              <p className="m-0 px-3 py-3 type-sm text-secondary">Browse sources by where they live. File sizes are measured on disk; they are not token counts.</p>
              <div className="flex flex-col gap-0.5 px-2 pb-2">
                {(page.layers ?? []).map((band) => <Band
                  layer={band}
                  open={open[band.id]}
                  onToggle={() => setOpen((current) => ({ ...current, [band.id]: !current[band.id] }))}
                  onAction={act}
                  key={band.id}
                />)}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 px-5 pt-1 pb-4">
                <span className={META}>Missing sources are optional unless marked as a problem.</span>
                <span className="min-w-0 flex-1" aria-hidden="true" />
                <button className={PILL_GHOST} type="button" onClick={onOpenMemory}>Open Memory page</button>
                <button className={PILL_PRIMARY} type="button" onClick={() => setInventory(false)}>
                  What the agent sees
                  <span className={`${MONO} type-mono-2xs opacity-70`}>↩</span>
                </button>
              </div>
            </>}
            {page && (page.layers ?? []).every((band) => band.rows.length === 0) && <p className={EMPTY_SECTION}>
              Nothing on this machine to read yet.
            </p>}
          </div>
        </Window>}
    </main>
  </InstrumentScreenRoot>;
}
