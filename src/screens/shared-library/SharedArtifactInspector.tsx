import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtifactRevisionDto } from "../../../electron/ralphy/types";
import { bridge } from "../../lib/ipc";
import { SharedArtifactPreview } from "./SharedArtifactPreview";
import { presentSharedArtifact, type SharedArtifactPresentation } from "./presentation";

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
  return <details className={`shared-inspector-section ${className}`} open={open || undefined}>
    <summary><ChevronRight aria-hidden="true" /><h3>{title}</h3>{badge && <span>{badge}</span>}</summary>
    <div>{children}</div>
  </details>;
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="shared-inspector-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function UnavailableAgentUse() {
  return <dl className="shared-inspector-agent-use">
    {["Purpose", "Use when", "Avoid when", "Constraints"].map((label) => <div key={label}><dt>{label}</dt><dd>Unavailable from this Core version</dd></div>)}
  </dl>;
}

export function SharedArtifactInspector({ artifact, workspaceId, rootEpoch, returnFocus, onClose, onRefresh }: {
  artifact: SharedArtifactPresentation;
  workspaceId: string;
  rootEpoch: number;
  returnFocus: HTMLElement | null;
  onClose(): void;
  onRefresh(): Promise<void>;
}) {
  const [detail, setDetail] = useState(artifact);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionState>({ status: "loading", items: [], nextCursor: null, loadingMore: false, error: null });
  const [selection, setSelection] = useState<SelectionState>({ status: "idle" });
  const [openState, setOpenState] = useState<{ status: "idle" | "pending" | "error"; message?: string }>({ status: "idle" });
  const request = useRef(0);
  const revisionRequest = useRef(0);
  const selectionRequest = useRef(0);
  const actionRequest = useRef(0);

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
      void onRefresh();
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
    setSelection({ status: "reloading", revisionId });
    const card = await loadDetail();
    await loadRevisionPage();
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
      <aside className="shared-artifact-inspector" aria-label="Shared artifact inspector">
        <header className="shared-inspector-head">
          <span>{detail.kind} · {detail.mime ?? "MIME unavailable"}</span>
          <button type="button" aria-label="Close artifact inspector" onClick={close}><X aria-hidden="true" /></button>
        </header>
        <div className="shared-inspector-scroll">
          <div className="shared-inspector-title">
            <Dialog.Title asChild><h2>{titleText(detail)}</h2></Dialog.Title>
            <Dialog.Description asChild><p>Slug identity · {detail.slug}</p></Dialog.Description>
            <div><span>Kind · {detail.kind}</span><span>State · {detail.selectedState ?? "Unavailable"}</span><span>Revision · {detail.selectedRevisionId ?? "Unselected"}</span></div>
          </div>

          {detailError && <div className="shared-inspector-alert" role="alert"><span>{detailError}</span><button type="button" onClick={() => { void loadDetail(); }}><RefreshCw aria-hidden="true" />Retry detail</button></div>}

          <div className="shared-inspector-preview">
            <SharedArtifactPreview artifact={detail} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={bridge.resolveSharedLibraryPreview} />
          </div>
          <Facts rows={[
            ["MIME", detail.mime ?? "Unavailable from Core"],
            ["Bytes", formatBytes(detail.bytes)],
            ["Storage class", detail.storageClass ?? "Unavailable from Core"],
            ["Coarse media provenance", provenanceText(detail)],
          ]} />
          <div className="shared-inspector-actions">
            <button type="button" disabled title="Use in project is unavailable until Core exposes a mutation contract.">Use in project</button>
            <button type="button" disabled title="Complete metadata is unavailable until Core exposes a metadata mutation contract.">Complete metadata</button>
            <button type="button" disabled={detail.preview === "no-target" || openState.status === "pending"} onClick={() => { void openOriginal(); }}><ExternalLink aria-hidden="true" />{openState.status === "pending" ? "Opening original…" : "Open original"}</button>
          </div>
          {openState.status === "error" && <div className="shared-inspector-alert" role="alert"><span>{openState.message}</span><button type="button" onClick={() => { void openOriginal(); }}>Retry open original</button></div>}

          <Section title="Context agents receive"><UnavailableAgentUse /></Section>

          <Section title="Revisions" badge="Append-only">
            {revisions.status === "loading" && <p role="status">Loading revisions…</p>}
            {revisions.status === "ready" && revisions.items.length === 0 && <p>No revision records returned by Core.</p>}
            {revisions.items.map((revision) => {
              const selected = revision.id === detail.selectedRevisionId;
              return <article className="shared-inspector-revision" key={revision.id}>
                <header><strong>Revision {revision.revisionNo}</strong>{selected && <span>Selected default</span>}</header>
                <p>{revision.state} · <time dateTime={new Date(revision.createdAt).toISOString()}>{new Date(revision.createdAt).toISOString()}</time></p>
                <p>Parent revision ID · {revision.parentRevisionId ?? "None returned"}</p>
                <p>Authored session ID · {revision.authoredBySessionId ?? "None returned"}</p>
                {!selected && <button type="button" aria-label={`Select revision ${revision.revisionNo} as default for future use`} disabled={selection.status === "pending" || selection.status === "reloading"} onClick={() => { void selectRevision(revision.id); }}>Select as default for future use</button>}
              </article>;
            })}
            {revisions.error && <div className="shared-inspector-alert" role="alert"><span>{revisions.error}</span><button type="button" onClick={() => { void loadRevisionPage(revisions.nextCursor); }}>Retry revision page</button></div>}
            {revisions.nextCursor && !revisions.error && <button className="shared-inspector-load-more" type="button" disabled={revisions.loadingMore} onClick={() => { void loadRevisionPage(revisions.nextCursor); }}>{revisions.loadingMore ? "Loading more revisions…" : "Load more revisions"}</button>}
            <div className="shared-inspector-selection-note"><strong>Existing references stay pinned</strong><p>Selecting a revision changes only the default for future use.</p><button type="button" disabled title="Review existing usages is unavailable because Core does not expose backlinks.">Review existing usages unavailable</button></div>
            {selection.status === "pending" && <p role="status">Selecting default revision…</p>}
            {selection.status === "reloading" && <p role="status">Reloading current selected default…</p>}
            {selection.status === "conflict" && <div className="shared-inspector-alert" role="alert"><span>The selected default changed in Core. Reload current state before retrying.</span><button type="button" onClick={() => { void reloadConflict(); }}>Reload current state</button></div>}
            {selection.status === "reloaded" && <div className="shared-inspector-alert" role="status"><span>Current selected default reloaded. Retry when ready.</span><button type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
            {selection.status === "error" && <div className="shared-inspector-alert" role="alert"><span>{selection.message}</span><button type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
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
