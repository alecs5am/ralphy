import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown, FileText, Layers, Package, ScrollText, Settings2, Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ContextLayerDto,
  ContextLayerId,
  ContextPageDto,
  ContextPresence,
  ContextRowDto,
} from "../../electron/agent/context-page";
import type { ContextFileDto } from "../../electron/agent/context-document";
import type { AgentChatUsage } from "../chat/useAgentChat";
import { bridge, type AgentProvider, type ProjectSummary } from "../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "./route-chrome";
import { ContextDocument } from "./context/ContextDocument";
import { MarkdownView } from "../components/MarkdownView";

export const contextInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.context",
  states: ["loading", "ready", "partial", "unavailable", "selected"],
  rootMarker: "workspace-context",
  landmarks: ["Context", "What the agent carries before it reads your message"],
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
const PILL_PRIMARY = "inline-flex h-control-md flex-none items-center gap-2 rounded-control bg-desk-primary px-3.5 type-sm text-desk-primary-ink hover:opacity-88";

/** A count the operator reads as a size, in the unit we actually measured. */
function bytes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
}

/** A token figure the provider reported. Never derived from anything else. */
function tokens(value: number | null): string {
  if (value === null) return "—";
  return value < 1000 ? `${value}` : `${(value / 1000).toFixed(1)}K`;
}

/**
 * The budget block. With a measured turn it states the total and, when the provider named a window,
 * what fraction of it the turn used at true scale -- the emptiness is the point. Without one it says
 * so; a bar drawn from an estimate would be the only lie on the page.
 */
function Budget({ usage, provider }: { usage: AgentChatUsage | null; provider: AgentProvider }) {
  const share = usage?.contextWindow ? Math.min(1, usage.inputTokens / usage.contextWindow) : null;
  return <div className="context-budget flex flex-col gap-2.25 px-5 pt-4.5 pb-4">
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {/* A dash at display size reads as a stray minus, so the unmeasured state leads with the
          sentence instead. The figure is only ever drawn when there is one. */}
      {usage
        ? <strong className={`${NUMBER} type-display leading-headline`}>{tokens(usage.inputTokens)}</strong>
        : <strong className="type-title font-normal text-muted">No turn measured yet</strong>}
      <span className="type-sm text-muted">
        {usage?.contextWindow
          ? `of ${tokens(usage.contextWindow)} before your first word`
          : usage
            ? `carried into the last turn · ${provider === "claude" ? "Claude" : "this provider"} does not report a window`
            : "the figures on this page come from a real turn, so they appear after the first one"}
      </span>
      <span className="min-w-0 flex-1" aria-hidden="true" />
      {usage && <span className={`${META} text-right`}>MEASURED ON THE LAST TURN · NOTHING ESTIMATED</span>}
    </div>
    {share !== null && <div className="h-context-scale-bar w-full overflow-hidden rounded-control bg-unreviewed" role="presentation">
      {/* One segment, not five: the provider reports what the turn carried and never says which
          layer carried it, so the bar is honest about the total and silent about the split. */}
      <div className="h-full rounded-control bg-ink" style={{ width: `${Math.max(0.35, share * 100)}%` }} />
    </div>}
    <p className={`m-0 ${META}`}>
      PER-LAYER ATTRIBUTION IS NOT REPORTED BY EITHER HARNESS · A ROW BELOW STATES THE BYTES IT MEASURED ON DISK
    </p>
  </div>;
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
function Reader({ file, onClose }: {
  file: ContextFileDto | { path: string; failure: string };
  onClose(): void;
}) {
  const failure = "failure" in file ? file.failure : null;
  return <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay className="fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content
        className="context-reader fixed inset-6 z-scrim-content m-auto flex h-fit max-h-context-reader w-full max-w-context-column flex-col overflow-hidden rounded-panel bg-panel p-0.5 text-ink outline-none"
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
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-inner bg-card px-5 py-4">
          {failure && <p className="m-0 type-sm text-failure-ink">{failure}</p>}
          {"format" in file && file.format === "markdown"
            && <div className="context-body"><MarkdownView markdown={file.text} /></div>}
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

export function ContextScreen({ provider, project, workspaceId, usage, onOpenMemory }: {
  provider: AgentProvider;
  project: ProjectSummary | null;
  workspaceId: string | null;
  usage: AgentChatUsage | null;
  onOpenMemory(): void;
}) {
  const [page, setPage] = useState<ContextPageDto | null>(null);
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
      workspaceId,
      project: project ? { workspaceId: project.workspaceId, projectId: project.projectId } : null,
    })
      .then((value) => { if (live) setPage(value); })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error.message : "The bridge did not answer");
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a project is its two ids
  }, [provider, workspaceId, projectId]);

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
      {file && <Reader file={file} onClose={() => setFile(null)} />}
      {failure && <p className={PROJECT_LOCAL_ERROR}>{failure}</p>}
      {!page && !failure && <p className={PROJECT_SKELETON}>Reading what this chat carries…</p>}
      {page && !inventory && <ContextDocument
        blocks={page.blocks ?? []}
        provider={provider}
        total={usage?.inputTokens ?? null}
        window={usage?.contextWindow ?? null}
        onOpenInventory={() => setInventory(true)}
        onRead={read}
      />}
      {page && inventory
        && <div className="mx-auto flex w-full max-w-context-column flex-col rounded-panel bg-panel p-0.5">
          <div className="flex h-9 flex-none items-center gap-2.5 px-3">
            <span className={`${MONO} type-mono-sm text-muted`}>CONTEXT</span>
            <span className="truncate type-sm text-ink">{project ? project.name : "this workspace"}</span>
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <span className={`${MONO} type-mono-2xs text-muted`}>
              {`${provider.toLocaleUpperCase()} · ${total} ROWS IN EVERY TURN`}
            </span>
            <button className={PILL} type="button" onClick={() => setInventory(false)}>The prompt</button>
          </div>
          <div className="flex w-full flex-col rounded-inner bg-card">
            {page && <>
              <Budget usage={usage} provider={provider} />
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
                <span className={META}>ABSENT IS NORMAL, NEVER AN ERROR · ONLY A DEFECT AND A MACHINE-WIDE EDIT DRAW RED</span>
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
        </div>}
    </main>
  </InstrumentScreenRoot>;
}
