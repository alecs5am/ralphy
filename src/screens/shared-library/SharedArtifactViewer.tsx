import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImageOff, PanelRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtifactMediaCardDto, ArtifactRevisionDto } from "../../../electron/ralphy/types";
import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import { bridge } from "../../lib/ipc";
import { presentSharedArtifact, type SharedArtifactPresentation } from "./presentation";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string; sizeBytes: number }
  | { status: "unavailable"; reason: string };

type RevisionState = {
  items: ArtifactRevisionDto[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

type SelectionState =
  | { status: "idle" }
  | { status: "pending" | "conflict" | "reloading" | "reloaded" | "error"; revisionId: string; message?: string };

type ViewerKind = "image" | "vector" | "video" | "audio" | "font" | "unsupported";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConflict = (error: unknown) => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";
const titleText = (artifact: SharedArtifactPresentation) => artifact.title.status === "ready" || artifact.title.status === "partial"
  ? artifact.title.value
  : "Title unavailable — Core does not return artifact titles";
const formatBytes = (bytes: number | null) => bytes === null
  ? "Size unavailable"
  : bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function viewerKind(mime: string | null): ViewerKind {
  const value = mime?.toLocaleLowerCase() ?? "";
  if (value === "image/svg+xml" || value === "application/svg+xml") return "vector";
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (value.startsWith("font/") || value.startsWith("application/font-") || value.startsWith("application/x-font-") || value === "application/vnd.ms-fontobject") return "font";
  return "unsupported";
}

function editableTarget(event: KeyboardEvent): boolean {
  let target = event.target instanceof HTMLElement
    ? event.target
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  for (; target; target = target.parentElement) {
    const tag = target.tagName.toLocaleLowerCase();
    if (tag === "input" || tag === "textarea" || target.getAttribute("role") === "slider" || target.isContentEditable) return true;
  }
  return false;
}

function FontSpecimen({ src, slug, onError }: { src: string; slug: string; onError(): void }) {
  const [face, setFace] = useState<FontFace | null>(null);
  useEffect(() => {
    if (typeof FontFace === "undefined") {
      onError();
      return;
    }
    let current = true;
    let loaded: FontFace | null = null;
    const candidate = new FontFace(slug, `url("${src}")`);
    void candidate.load().then((value) => {
      if (!current) return;
      loaded = value;
      document.fonts?.add(value);
      setFace(value);
    }).catch(() => { if (current) onError(); });
    return () => {
      current = false;
      if (loaded) document.fonts?.delete(loaded);
    };
  }, [onError, slug, src]);
  if (!face) return <div className="shared-viewer-preview-state" role="status">Loading font preview…</div>;
  return <div className="shared-viewer-font" style={{ fontFamily: `"${slug}"` }}>
    <span>Font specimen · {slug}</span>
    <strong>Aa Bb Cc 123</strong>
    <p>Handgloves &amp; rooftop dusk</p>
    <small>ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</small>
  </div>;
}

function ViewerStage({ artifact, preview, kind, onPreviewError }: {
  artifact: SharedArtifactPresentation;
  preview: PreviewState;
  kind: ViewerKind;
  onPreviewError(): void;
}) {
  if (artifact.preview === "no-target") return <div className="shared-viewer-preview-state">
    <ImageOff aria-hidden="true" /><strong>Preview unavailable</strong><span>Core returned no selected preview target.</span>
  </div>;
  if (kind === "unsupported") return <div className="shared-viewer-fallback">
    <FileText aria-hidden="true" />
    <strong>In-place preview unavailable</strong>
    <span>{artifact.mime ?? "MIME unavailable"} · {formatBytes(artifact.bytes)}</span>
    <p>The current Desktop contract exposes no bounded safe read for this content. Use Open original.</p>
  </div>;
  if (preview.status === "loading") return <div className="shared-viewer-preview-state" role="status">Loading preview…</div>;
  if (preview.status === "unavailable") return <div className="shared-viewer-preview-state" title={preview.reason}>
    <ImageOff aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.reason}</span>
  </div>;
  const name = `Slug identity: ${artifact.slug}`;
  if (kind === "image" || kind === "vector") return <div className={kind === "vector" ? "shared-viewer-vector-stage" : "shared-viewer-image-stage"}>
    <ImageViewport src={preview.url} name={name} onError={onPreviewError} />
    <span className="shared-viewer-fit-label">FIT</span>
  </div>;
  if (kind === "video") return <VideoPlayer src={preview.url} name={name} onError={onPreviewError} />;
  if (kind === "audio") return <AudioWaveform src={preview.url} name={name} sizeBytes={preview.sizeBytes} onError={onPreviewError} />;
  return <FontSpecimen src={preview.url} slug={artifact.slug} onError={onPreviewError} />;
}

export function SharedArtifactViewer({ artifact, artifacts, workspaceId, rootEpoch, returnFocus, onClose, onNavigate, onReconcile, onOpenInspector }: {
  artifact: SharedArtifactPresentation;
  artifacts: SharedArtifactPresentation[];
  workspaceId: string;
  rootEpoch: number;
  returnFocus: HTMLElement | null;
  onClose(): void;
  onNavigate(artifact: SharedArtifactPresentation): void;
  onReconcile(card: ArtifactMediaCardDto): void;
  onOpenInspector?(artifact: SharedArtifactPresentation): void;
}) {
  const [detail, setDetail] = useState(artifact);
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [revisions, setRevisions] = useState<RevisionState>({ items: [], nextCursor: null, loading: true, error: null });
  const [selection, setSelection] = useState<SelectionState>({ status: "idle" });
  const [openState, setOpenState] = useState<"idle" | "pending" | "error">("idle");
  const surfaceRef = useRef<HTMLElement>(null);
  const detailRequest = useRef(0);
  const previewRequest = useRef(0);
  const revisionRequest = useRef(0);
  const selectionRequest = useRef(0);
  const actionRequest = useRef(0);
  const kind = viewerKind(detail.mime);
  const index = artifacts.findIndex(({ id }) => id === detail.id);
  const canPrevious = index > 0;
  const canNext = index >= 0 && index < artifacts.length - 1;

  const restoreFocus = useCallback(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, [returnFocus]);
  const close = useCallback(() => {
    onClose();
    queueMicrotask(restoreFocus);
  }, [onClose, restoreFocus]);

  const loadDetail = useCallback(async () => {
    const current = ++detailRequest.current;
    try {
      const card = await bridge.loadSharedLibraryArtifact(workspaceId, artifact.id);
      if (current !== detailRequest.current) return null;
      setDetail(presentSharedArtifact(card));
      return card;
    } catch {
      return null;
    }
  }, [artifact.id, workspaceId]);

  const loadRevisions = useCallback(async (after: string | null = null) => {
    const current = ++revisionRequest.current;
    setRevisions((value) => ({ ...value, loading: true, error: null, ...(after === null ? { items: [], nextCursor: null } : {}) }));
    try {
      const page = await bridge.loadSharedLibraryRevisions(workspaceId, detail.id, after);
      if (current !== revisionRequest.current) return;
      setRevisions((value) => {
        const seen = new Set(value.items.map(({ id }) => id));
        return {
          items: after === null ? page.items : [...value.items, ...page.items.filter(({ id }) => !seen.has(id) && !!seen.add(id))],
          nextCursor: page.nextCursor,
          loading: false,
          error: null,
        };
      });
    } catch (error) {
      if (current === revisionRequest.current) setRevisions((value) => ({ ...value, loading: false, error: errorMessage(error) }));
    }
  }, [detail.id, workspaceId]);

  useEffect(() => {
    setDetail(artifact);
    setSelection({ status: "idle" });
    return () => {
      detailRequest.current += 1;
      selectionRequest.current += 1;
    };
  }, [artifact]);

  useEffect(() => {
    void loadRevisions();
    return () => { revisionRequest.current += 1; };
  }, [loadRevisions, rootEpoch]);

  useEffect(() => {
    const current = ++previewRequest.current;
    if (kind === "unsupported") return;
    if (detail.preview === "no-target") {
      setPreview({ status: "unavailable", reason: "Core returned no selected preview target." });
      return;
    }
    setPreview({ status: "loading" });
    void bridge.resolveSharedLibraryPreview(workspaceId, detail.id).then((value) => {
      if (current !== previewRequest.current) return;
      setPreview(value
        ? { status: "ready", url: value.url, sizeBytes: value.sizeBytes }
        : { status: "unavailable", reason: "Core did not return a guarded preview URL." });
    }).catch(() => {
      if (current === previewRequest.current) setPreview({ status: "unavailable", reason: "The guarded preview URL could not be loaded." });
    });
    return () => { previewRequest.current += 1; };
  }, [detail.id, detail.preview, detail.selectedRevisionId, kind, rootEpoch, workspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || editableTarget(event)) return;
      if (event.key === "ArrowLeft" && canPrevious) {
        event.preventDefault();
        onNavigate(artifacts[index - 1]);
      }
      if (event.key === "ArrowRight" && canNext) {
        event.preventDefault();
        onNavigate(artifacts[index + 1]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [artifacts, canNext, canPrevious, index, onNavigate]);

  const selectRevision = async (revisionId: string) => {
    const current = ++selectionRequest.current;
    setSelection({ status: "pending", revisionId });
    try {
      const card = await bridge.selectSharedLibraryRevision(workspaceId, detail.id, revisionId, detail.selectedRevisionId);
      if (current !== selectionRequest.current) return;
      const next = presentSharedArtifact(card);
      setDetail(next);
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
    await loadRevisions();
    if (current !== selectionRequest.current) return;
    setSelection(card
      ? { status: "reloaded", revisionId }
      : { status: "error", revisionId, message: "Current selected default could not be reloaded." });
  };

  const openOriginal = async () => {
    const current = ++actionRequest.current;
    setOpenState("pending");
    try {
      await bridge.performSharedLibraryAction(workspaceId, detail.id, "open");
      if (current === actionRequest.current) setOpenState("idle");
    } catch {
      if (current === actionRequest.current) setOpenState("error");
    }
  };

  const navigate = (next: SharedArtifactPresentation | undefined) => {
    if (!next) return;
    onNavigate(next);
  };
  const topLine = [detail.kind, detail.mime ?? "MIME unavailable", `Slug · ${detail.slug}`]
    .map((value) => value.toLocaleUpperCase()).join(" · ");

  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Content asChild
        onOpenAutoFocus={(event) => { event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
        <section ref={surfaceRef} tabIndex={-1} className="shared-artifact-viewer" aria-label={`Preview ${detail.slug}`}>
          <header className="shared-viewer-head">
            <span>{topLine}</span>
            <button type="button" aria-label="Open original" disabled={detail.preview === "no-target" || openState === "pending"} onClick={() => { void openOriginal(); }}><ExternalLink aria-hidden="true" />{openState === "pending" ? "Opening original…" : "Open original"}</button>
            <button type="button" aria-label="Close viewer" onClick={close}><X aria-hidden="true" /></button>
          </header>
          <div className="shared-viewer-body">
            <div className="shared-viewer-main">
              <div className="shared-viewer-stage">
                <ViewerStage artifact={detail} preview={preview} kind={kind} onPreviewError={() => setPreview({ status: "unavailable", reason: "The preview media could not be decoded or loaded." })} />
                <button className="shared-viewer-previous" type="button" aria-label="Previous artifact" disabled={!canPrevious} onClick={() => navigate(artifacts[index - 1])}><ChevronLeft aria-hidden="true" /></button>
                <button className="shared-viewer-next" type="button" aria-label="Next artifact" disabled={!canNext} onClick={() => navigate(artifacts[index + 1])}><ChevronRight aria-hidden="true" /></button>
              </div>
              <div className="shared-viewer-transport">
                <span>{index >= 0 ? index + 1 : 0} / {artifacts.length} loaded</span>
                <i aria-hidden="true" />
                <strong>Revision</strong>
                {revisions.loading && revisions.items.length === 0 && <span role="status">Loading revisions…</span>}
                {revisions.items.map((revision) => {
                  const selected = revision.id === detail.selectedRevisionId;
                  return <button
                    type="button"
                    key={revision.id}
                    className={selected ? "is-selected" : ""}
                    disabled={selected || selection.status === "pending" || selection.status === "reloading"}
                    aria-label={selected ? `Revision ${revision.revisionNo} selected default` : `Select revision ${revision.revisionNo} as default for future use`}
                    onClick={() => { void selectRevision(revision.id); }}
                  >Revision {revision.revisionNo}{selected && <small>Selected default</small>}</button>;
                })}
                {revisions.nextCursor && <><span>More revisions are available</span><button type="button" disabled={revisions.loading} onClick={() => { void loadRevisions(revisions.nextCursor); }}>Load more revisions</button></>}
              </div>
              {revisions.error && <div className="shared-viewer-alert" role="alert"><span>Revision history unavailable · {revisions.error}</span><button type="button" onClick={() => { void loadRevisions(revisions.items.length ? revisions.nextCursor : null); }}>Retry revisions</button></div>}
              {selection.status === "pending" && <p role="status">Selecting default revision…</p>}
              {selection.status === "reloading" && <p role="status">Reloading current selected default…</p>}
              {selection.status === "conflict" && <div className="shared-viewer-alert" role="alert"><span>The selected default changed in Core. Reload current state before retrying.</span><button type="button" onClick={() => { void reloadConflict(); }}>Reload current state</button></div>}
              {selection.status === "reloaded" && <div className="shared-viewer-alert" role="status"><span>Current selected default reloaded. Retry when ready.</span><button type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
              {selection.status === "error" && <div className="shared-viewer-alert" role="alert"><span>Revision selection unavailable · {selection.message}</span><button type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
              {openState === "error" && <div className="shared-viewer-alert" role="alert"><span>Open original unavailable.</span><button type="button" onClick={() => { void openOriginal(); }}>Retry open original</button></div>}
            </div>
            <aside className="shared-viewer-context">
              <div className="shared-viewer-title">
                <Dialog.Title asChild><h2>{titleText(detail)}</h2></Dialog.Title>
                <Dialog.Description asChild><p>Slug identity · {detail.slug}</p></Dialog.Description>
              </div>
              <dl className="shared-viewer-facts">
                <div><dt>MIME</dt><dd>{detail.mime ?? "Unavailable"}</dd></div>
                <div><dt>Size</dt><dd>{formatBytes(detail.bytes)}</dd></div>
                <div><dt>Selected state</dt><dd>{detail.selectedState ?? "Unavailable"}</dd></div>
              </dl>
              <section className="shared-viewer-agent-use"><h3>Context agents receive</h3><p>Agent use guidance is unavailable from this Core version.</p></section>
              <section><h3>Referenced as</h3><p>{detail.referencedAs.length ? detail.referencedAs.join(" · ") : "No referenced-role evidence returned by Core."}</p></section>
              <section><h3>Actual usage</h3><p>System-derived backlinks are unavailable from this Core version.</p></section>
              <span className="shared-viewer-spacer" />
              <button type="button" disabled title="Use in project is unavailable until Core exposes a mutation contract.">Use in project unavailable</button>
              {onOpenInspector && <button type="button" onClick={() => onOpenInspector(detail)}><PanelRight aria-hidden="true" />Open full inspector</button>}
              <small>← → ARTIFACT · MEDIA CONTROLS ARE LABELLED · ESC CLOSE</small>
            </aside>
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
