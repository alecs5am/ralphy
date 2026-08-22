import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtifactMediaCardDto, ArtifactRevisionDto } from "../../../electron/ralphy/types";
import { bridge } from "../../lib/ipc";
import { SharedArtifactPreview } from "./SharedArtifactPreview";
import type { SharedLibraryWorkflowKind } from "./SharedLibraryWorkflows";
import { presentSharedArtifact, type Availability, type SharedArtifactPresentation } from "./presentation";

type RevisionState = {
  status: "loading" | "ready";
  items: ArtifactRevisionDto[];
  nextCursor: string | null;
  loadingMore: boolean;
  error: string | null;
};

type SelectionState =
  | { status: "idle" }
  | { status: "pending" | "conflict" | "reloading" | "reloaded" | "error"; revisionId: string; message?: string };

/* The inspector is a light widget: its own surface, sunken blocks inside it, and one step up
   again for a chip standing on a sunken block. The ring is the one reset.css paints. */
const ACTION = "inline-flex min-h-control-md items-center justify-center gap-1.5 rounded-control bg-surface-sunken px-2.5 type-xs text-muted disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.25";
const INSET = "rounded-field bg-surface-sunken";
const CHIP = "rounded-chip bg-surface-hover px-1.75 py-1 font-code type-mono-sm tracking-meta text-muted";
/* The title chips stand on the inspector's own surface, so they take the sunken step instead. */
const TITLE_CHIP = "rounded-chip bg-surface-sunken px-1.75 py-1 font-code type-mono-sm tracking-meta text-muted";
const REASON = "mb-0 type-mono-md leading-caption text-muted";
const ALERT = `flex items-center gap-2 p-2 type-mono-md text-ink ${INSET} [&>span]:min-w-0 [&>span]:flex-1`;
const FACT_ROW = "grid min-w-0 grid-cols-(--shared-library-fact-columns) gap-3";
const FACT_LABEL = "m-0 type-mono-md text-muted";
const FACT_VALUE = "m-0 font-code type-mono-md text-right text-muted [overflow-wrap:anywhere]";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConflict = (error: unknown) => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";
const formatBytes = (bytes: number | null) => bytes === null ? "Size unavailable" : bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const titleText = (artifact: SharedArtifactPresentation) => artifact.title.status === "ready" || artifact.title.status === "partial" ? artifact.title.value : "Title unavailable";
const provenanceText = (artifact: SharedArtifactPresentation) => artifact.provenance === "generation"
  ? "Generated media evidence"
  : artifact.provenance === "not-generation"
    ? "Core reports non-generation provenance"
    : "Core returned unknown coarse provenance";

function Section({ title, badge, children, open = true, className = "" }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  open?: boolean;
  className?: string;
}) {
  return <details className={`shared-inspector-section group m-0 ${className}`} open={open || undefined}>
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.75 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-3.25 flex-none text-muted transition-transform duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 group-open:rotate-90" aria-hidden="true" />
      <h3 className="m-0 min-w-0 flex-1 type-xs font-normal text-muted">{title}</h3>
      {badge && <span className={CHIP}>{badge}</span>}
    </summary>
    <div className="pb-3 pl-5 type-label text-muted [&_p]:my-1.25 [&_p]:leading-row [&_ul]:m-0 [&_ul]:pl-4.25">{children}</div>
  </details>;
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="m-0 grid gap-1.75">{rows.map(([label, value]) => <div className={FACT_ROW} key={label}><dt className={FACT_LABEL}>{label}</dt><dd className={FACT_VALUE}>{value}</dd></div>)}</dl>;
}

const availabilityReason = (value: Availability<unknown>) => value.status === "ready" ? "Available from Core." : value.reason;
const stringList = (value: Availability<string[]>) => value.status === "ready"
  ? value.value.length ? value.value.join(" · ") : "No values returned by Core."
  : value.status === "partial"
    ? value.value.length ? value.value.join(" · ") : value.reason
    : value.reason;

function AgentUse({ artifact }: { artifact: SharedArtifactPresentation }) {
  const values = artifact.agentUse.status === "ready" || artifact.agentUse.status === "partial"
    ? artifact.agentUse.value
    : null;
  return <dl className={`m-0 grid gap-2.75 p-3.25 ${INSET}`}>
    {([
      ["Purpose", values?.purpose ?? availabilityReason(artifact.agentUse)],
      ["Use when", values?.useWhen ?? availabilityReason(artifact.agentUse)],
      ["Avoid when", values?.avoidWhen ?? availabilityReason(artifact.agentUse)],
      ["Constraints", values?.constraints ?? availabilityReason(artifact.agentUse)],
      ["Agent-use canonical status", availabilityReason(artifact.canonicalStatus)],
    ] as const).map(([label, value]) => <div key={label}>
      <dt className="m-0 font-code type-mono-sm tracking-caps-tight text-muted">{label}</dt>
      <dd className="m-0 mt-0.75 type-sm text-muted">{value}</dd>
    </div>)}
  </dl>;
}

export function SharedArtifactInspector({ artifact, workspaceId, rootEpoch, returnFocus, onClose, onReconcile, onOpenWorkflow }: {
  artifact: SharedArtifactPresentation;
  workspaceId: string;
  rootEpoch: number;
  returnFocus: HTMLElement | null;
  onClose(): void;
  onReconcile(card: ArtifactMediaCardDto): void;
  onOpenWorkflow?(kind: Exclude<SharedLibraryWorkflowKind, "add" | "promote">, origin: HTMLButtonElement): void;
}) {
  const [detail, setDetail] = useState(artifact);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionState>({ status: "loading", items: [], nextCursor: null, loadingMore: false, error: null });
  const [selection, setSelection] = useState<SelectionState>({ status: "idle" });
  const [openState, setOpenState] = useState<{ status: "idle" | "pending" | "error"; message?: string }>({ status: "idle" });
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const request = useRef(0);
  const revisionRequest = useRef(0);
  const selectionRequest = useRef(0);
  const actionRequest = useRef(0);
  const idStem = artifact.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const unavailableActionsId = `shared-inspector-${idStem}-actions-unavailable`;
  const targetlessActionId = `shared-inspector-${idStem}-targetless-action`;
  const backlinksReasonId = `shared-inspector-${idStem}-backlinks-unavailable`;

  const loadDetail = useCallback(async () => {
    const current = ++request.current;
    setDetailError(null);
    try {
      const card = await bridge.loadSharedLibraryArtifact(workspaceId, artifact.id);
      if (current === request.current) setDetail(presentSharedArtifact(card));
      return card;
    } catch (error) {
      if (current === request.current) setDetailError(errorMessage(error));
      return null;
    }
  }, [artifact.id, workspaceId]);

  const loadRevisionPage = useCallback(async (after: string | null = null) => {
    const current = ++revisionRequest.current;
    const append = after !== null;
    setRevisions((value) => append
      ? { ...value, loadingMore: true, error: null }
      : { status: "loading", items: [], nextCursor: null, loadingMore: false, error: null });
    try {
      const page = await bridge.loadSharedLibraryRevisions(workspaceId, artifact.id, after);
      if (current !== revisionRequest.current) return;
      setRevisions((value) => {
        if (!append) return { status: "ready", items: page.items, nextCursor: page.nextCursor, loadingMore: false, error: null };
        const seen = new Set(value.items.map(({ id }) => id));
        return {
          status: "ready",
          items: [...value.items, ...page.items.filter(({ id }) => !seen.has(id) && !!seen.add(id))],
          nextCursor: page.nextCursor,
          loadingMore: false,
          error: null,
        };
      });
    } catch (error) {
      if (current !== revisionRequest.current) return;
      setRevisions((value) => ({ ...value, status: "ready", loadingMore: false, error: errorMessage(error) }));
    }
  }, [artifact.id, workspaceId]);

  useEffect(() => {
    setDetail(artifact);
    setSelection({ status: "idle" });
    setOpenState({ status: "idle" });
    void loadDetail();
    void loadRevisionPage();
    return () => {
      request.current += 1;
      revisionRequest.current += 1;
      selectionRequest.current += 1;
      actionRequest.current += 1;
    };
  }, [artifact.id, loadDetail, loadRevisionPage, rootEpoch]);

  const selectRevision = async (revisionId: string) => {
    const current = ++selectionRequest.current;
    setSelection({ status: "pending", revisionId });
    try {
      const card = await bridge.selectSharedLibraryRevision(workspaceId, artifact.id, revisionId, detail.selectedRevisionId);
      if (current !== selectionRequest.current) return;
      setDetail(presentSharedArtifact(card));
      setSelection({ status: "idle" });
      onReconcile(card);
    } catch (error) {
      if (current !== selectionRequest.current) return;
      setSelection(isConflict(error)
        ? { status: "conflict", revisionId }
        : { status: "error", revisionId, message: errorMessage(error) });
    }
  };

  const reloadConflict = async () => {
    if (selection.status !== "conflict") return;
    const revisionId = selection.revisionId;
    const current = ++selectionRequest.current;
    setSelection({ status: "reloading", revisionId });
    const card = await loadDetail();
    if (current !== selectionRequest.current) return;
    await loadRevisionPage();
    if (current !== selectionRequest.current) return;
    setSelection(card
      ? { status: "reloaded", revisionId }
      : { status: "error", revisionId, message: "Current selected default could not be reloaded." });
  };

  const openOriginal = async () => {
    const current = ++actionRequest.current;
    setOpenState({ status: "pending" });
    try {
      await bridge.performSharedLibraryAction(workspaceId, artifact.id, "open");
      if (current === actionRequest.current) setOpenState({ status: "idle" });
    } catch (error) {
      if (current === actionRequest.current) setOpenState({ status: "error", message: errorMessage(error) });
    }
  };

  const restoreFocus = () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  const close = () => {
    onClose();
    queueMicrotask(restoreFocus);
  };

  return <Dialog.Root open modal={false} onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Content asChild onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
      {/* The inspector splits the content row until the row is too narrow to split, and then
          covers it — measured against the row, never the window. */}
      <aside
        className="shared-artifact-inspector flex w-shared-inspector min-w-0 flex-none flex-col overflow-hidden rounded-panel bg-surface text-ink @max-shared-inspector/shared-content:absolute @max-shared-inspector/shared-content:inset-0 @max-shared-inspector/shared-content:z-10 @max-shared-inspector/shared-content:size-full"
        aria-label="Shared artifact inspector"
        data-instrument-overlay="shared-inspector"
      >
        <header className="shared-inspector-head flex min-h-11 flex-none items-center gap-2.5 bg-surface-sunken pt-2.5 pr-3 pb-1.5 pl-4">
          <span className="min-w-0 flex-1 truncate font-code type-mono-sm tracking-caps text-muted">{detail.kind} · {detail.mime ?? "MIME unavailable"}</span>
          <button className="grid size-7 place-items-center rounded-control text-muted hover:bg-surface-hover hover:text-ink [&_svg]:size-3.5" type="button" aria-label="Close artifact inspector" onClick={close}><X aria-hidden="true" /></button>
        </header>
        <div className="shared-inspector-scroll flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-1.5 pb-4.5">
          <div>
            <Dialog.Title asChild><h2 className="m-0 type-heading font-normal text-ink">{titleText(detail)}</h2></Dialog.Title>
            <Dialog.Description asChild><p className="mx-0 mt-0.75 mb-2.25 font-code type-mono-md text-muted">Slug identity · {detail.slug}</p></Dialog.Description>
            <div className="flex flex-wrap gap-1.25"><span className={TITLE_CHIP}>Kind · {detail.kind}</span><span className={TITLE_CHIP}>Selected revision state · {detail.selectedState ?? "Unavailable"}</span><span className={TITLE_CHIP}>Revision · {detail.selectedRevisionId ?? "Unselected"}</span></div>
          </div>

          {detailError && <div className={ALERT} role="alert"><span>{detailError}</span><button className={ACTION} type="button" onClick={() => { void loadDetail(); }}><RefreshCw aria-hidden="true" />Retry detail</button></div>}

          <div className="shared-inspector-preview relative grid min-h-shared-preview place-items-center overflow-hidden rounded-cell bg-instrument [&>:is(.image-viewport,.custom-video-player,.audio-waveform-player)]:min-h-shared-preview [&>:is(.image-viewport,.custom-video-player,.audio-waveform-player)]:w-full">
            <SharedArtifactPreview artifact={detail} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={bridge.resolveSharedLibraryPreview} />
            {detail.preview === "no-target" && <span className="absolute inset-x-3 bottom-2.5 type-mono-md text-center text-on-instrument-muted">No preview target</span>}
          </div>
          <Facts rows={[
            ["MIME", detail.mime ?? "Unavailable from Core"],
            ["Bytes", formatBytes(detail.bytes)],
            ["Storage class", detail.storageClass ?? "Unavailable from Core"],
            ["Coarse media provenance", provenanceText(detail)],
            ["Semantic roles", stringList(detail.semanticRoles)],
            ["Tags", stringList(detail.tags)],
            ["Named entities", stringList(detail.entities)],
            ["Canonical status", availabilityReason(detail.canonicalStatus)],
          ]} />
          <div className="shared-inspector-actions grid grid-cols-2 gap-1.75">
            <button className={`${ACTION} bg-instrument text-on-instrument focus-visible:outline-focus-on-instrument`} type="button" aria-disabled="true" aria-describedby={unavailableActionsId}>Use in project</button>
            <button className={ACTION} type="button" aria-disabled="true" aria-describedby={unavailableActionsId}>Complete metadata</button>
            <button className={`${ACTION} col-span-full`} type="button" aria-describedby={detail.preview === "no-target" ? targetlessActionId : undefined} disabled={detail.preview === "no-target" || openState.status === "pending"} onClick={() => { void openOriginal(); }}><ExternalLink aria-hidden="true" />{openState.status === "pending" ? "Opening original…" : "Open original"}</button>
          </div>
          <p className={`-mt-2 ${REASON}`} id={unavailableActionsId}>Use in project and Complete metadata are unavailable until Core exposes mutation contracts.</p>
          {detail.preview === "no-target" && <p className={`-mt-2 ${REASON}`} id={targetlessActionId}>Open original is unavailable because Core returned no selected media target.</p>}
          {openState.status === "error" && <div className={ALERT} role="alert"><span>{openState.message}</span><button className={ACTION} type="button" onClick={() => { void openOriginal(); }}>Retry open original</button></div>}

          {onOpenWorkflow && <div className="shared-inspector-workflows grid gap-1.5">
            <button className={`${ACTION} w-full`} type="button" aria-expanded={workflowMenuOpen} aria-controls={`shared-inspector-${idStem}-workflow-menu`} onClick={() => setWorkflowMenuOpen((open) => !open)}>More workflow previews</button>
            {workflowMenuOpen && <div className={`grid gap-1.25 p-2 ${INSET}`} id={`shared-inspector-${idStem}-workflow-menu`} role="group" aria-label="Preview unavailable workflows">
              <p className={`mt-0 mb-0.75 ${REASON}`}>Preview unavailable workflow · final actions remain disabled for this Core version.</p>
              <button className={ACTION} type="button" onClick={(event) => onOpenWorkflow("duplicate", event.currentTarget)}>Preview duplicate workflow</button>
              <button className={ACTION} type="button" onClick={(event) => onOpenWorkflow("suggestions", event.currentTarget)}>Preview metadata suggestions</button>
              <button className={ACTION} type="button" onClick={(event) => onOpenWorkflow("archive", event.currentTarget)}>Preview archive impact</button>
            </div>}
          </div>}

          <Section title="Context agents receive"><AgentUse artifact={detail} /></Section>

          <Section title="Revisions" badge="Append-only">
            {revisions.status === "loading" && <p role="status">Loading revisions…</p>}
            {revisions.status === "ready" && revisions.items.length === 0 && <p>No revision records returned by Core.</p>}
            {revisions.items.map((revision) => {
              const selected = revision.id === detail.selectedRevisionId;
              return <article className={`mb-1.75 p-2.5 ${INSET}`} key={revision.id}>
                <header className="flex items-center justify-between gap-2"><strong className="type-label font-normal text-muted">Revision {revision.revisionNo}</strong>{selected && <span className={CHIP}>Selected default</span>}</header>
                <p className="font-code type-mono-sm text-muted [overflow-wrap:anywhere]">{revision.state} · <time dateTime={new Date(revision.createdAt).toISOString()}>{new Date(revision.createdAt).toISOString()}</time></p>
                <p className="font-code type-mono-sm text-muted [overflow-wrap:anywhere]">Parent revision ID · {revision.parentRevisionId ?? "None returned"}</p>
                <p className="font-code type-mono-sm text-muted [overflow-wrap:anywhere]">Authored session ID · {revision.authoredBySessionId ?? "None returned"}</p>
                {!selected && <button className={`${ACTION} mt-1.75 w-full`} type="button" aria-label={`Select revision ${revision.revisionNo} as default for future use`} disabled={selection.status === "pending" || selection.status === "reloading"} onClick={() => { void selectRevision(revision.id); }}>Select as default for future use</button>}
              </article>;
            })}
            {revisions.error && <div className={ALERT} role="alert"><span>{revisions.error}</span><button className={ACTION} type="button" onClick={() => { void loadRevisionPage(revisions.nextCursor); }}>Retry revision page</button></div>}
            {revisions.nextCursor && !revisions.error && <button className={`${ACTION} w-full`} type="button" disabled={revisions.loadingMore} onClick={() => { void loadRevisionPage(revisions.nextCursor); }}>{revisions.loadingMore ? "Loading more revisions…" : "Load more revisions"}</button>}
            <div className="mt-2.25 rounded-field bg-surface-hover p-2.75"><strong className="type-label font-normal text-muted">Existing references stay pinned</strong><p>Selecting a revision changes only the default for future use.</p>{onOpenWorkflow
              ? <button className={`${ACTION} mt-2 w-full`} type="button" onClick={(event) => onOpenWorkflow("update-review", event.currentTarget)}>Preview revision update review</button>
              : <button className={`${ACTION} mt-2 w-full`} type="button" aria-disabled="true" aria-describedby={backlinksReasonId}>Review existing usages unavailable</button>}<p id={backlinksReasonId}>Review existing usages is unavailable because Core does not expose backlinks.</p></div>
            {selection.status === "pending" && <p role="status">Selecting default revision…</p>}
            {selection.status === "reloading" && <p role="status">Reloading current selected default…</p>}
            {selection.status === "conflict" && <div className={ALERT} role="alert"><span>The selected default changed in Core. Reload current state before retrying.</span><button className={ACTION} type="button" onClick={() => { void reloadConflict(); }}>Reload current state</button></div>}
            {selection.status === "reloaded" && <div className={ALERT} role="status"><span>Current selected default reloaded. Retry when ready.</span><button className={ACTION} type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
            {selection.status === "error" && <div className={ALERT} role="alert"><span>{selection.message}</span><button className={ACTION} type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
          </Section>

          <Section title="Provenance and rights">
            <Facts rows={[
              ["Coarse media provenance", provenanceText(detail)],
              ["Rights evidence", "Rights and provenance evidence are unavailable from this Core version"],
              ["Licence", "Unavailable from this Core version"],
              ["Attribution", "Unavailable from this Core version"],
              ["Consent", "Unavailable from this Core version"],
            ]} />
          </Section>

          <Section title="Referenced as" badge="Aggregated evidence" className="shared-inspector-referenced-as">
            {detail.referencedAs.length > 0
              ? <ul>{detail.referencedAs.map((role) => <li key={role}>{role}</li>)}</ul>
              : <p>No referenced-role evidence returned by Core.</p>}
          </Section>

          <Section title="Actual usage" badge="System-derived" className="shared-inspector-actual-usage">
            <p>System-derived backlinks are unavailable from this Core version.</p>
          </Section>

          <Section title="Related artifacts"><p>Relationship data is unavailable from this Core version.</p></Section>

          <Section title="Technical details" className="shared-inspector-technical" open={false}>
            <Facts rows={[
              ["Artifact ID", detail.id],
              ["Selected revision ID", detail.selectedRevisionId ?? "None returned"],
              ["MIME", detail.mime ?? "None returned"],
              ["Storage class", detail.storageClass ?? "None returned"],
            ]} />
          </Section>
        </div>
      </aside>
    </Dialog.Content>
  </Dialog.Root>;
}
