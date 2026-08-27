import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImageOff, PanelRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ArtifactMediaCardDto, ArtifactRevisionDto } from "../../../../electron/ralphy/types";
import { isSupportedFontPreviewMime } from "../../../../shared/font-preview";
import { AudioWaveform } from "@/entities/media/ui/AudioWaveform";
import { ImageViewport } from "@/entities/media/ui/ImageViewport";
import { VideoPlayer } from "@/entities/media/ui/VideoPlayer";
import { bridge } from "@/shared/api/ipc";
import { presentSharedArtifact, type Availability, type SharedArtifactPresentation } from "../lib/presentation";
import { Modal } from "@/shared/ui/Modal";

/* The viewer is a full-surface light widget: its own surface, the stage and the context rail one
   step down, and a block inside the rail one step up again. Controls that stand on media take the
   on-instrument ink and ring in both themes, because the frame under them is black either way. */
const ACTION = "inline-flex min-h-7 items-center justify-center gap-1.5 rounded-control bg-surface-sunken px-2.5 type-label text-muted transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.25";
/* The selected revision is the disabled one, so the dimming lives on the other branch: a pill
   cannot be both the current choice and greyed out. */
const TRANSPORT_BUTTON = "inline-flex min-h-6 items-center justify-center gap-1.5 rounded-control px-2 font-code type-mono-sm transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 disabled:cursor-not-allowed";
const STEP = "absolute top-1/2 z-sticky grid size-8.5 -mt-4.25 place-items-center rounded-full bg-media-plate text-on-instrument disabled:cursor-not-allowed disabled:opacity-28 focus-visible:outline-focus-on-instrument [&_svg]:size-3.75";
const ALERT = "shared-viewer-alert flex flex-none items-center gap-2 rounded-field bg-surface-sunken px-2.5 py-2 type-mono-md text-ink [&>span]:min-w-0 [&>span]:flex-1";
const STATE = "flex max-w-shared-notice flex-col items-center justify-center gap-2 p-6 text-center text-muted [&>svg]:size-7 [&>svg]:text-muted";
const STATE_TITLE = "type-md font-normal text-ink";
const STATE_LINE = "font-code type-mono-md";
const SECTION_LABEL = "m-0 font-code type-mono-sm font-normal tracking-caps text-muted";
const SECTION_COPY = "m-0 type-label leading-normal text-muted";
const FACT_ROW = "grid grid-cols-(--shared-library-viewer-fact-columns) gap-2";
const FACT_LABEL = "m-0 type-mono-sm text-muted";
const FACT_VALUE = "m-0 font-code type-mono-sm text-right text-muted [overflow-wrap:anywhere]";
const REASON = "-mt-1.75 mb-0 type-mono-md leading-caption text-muted";

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
  if (isSupportedFontPreviewMime(mime)) return "font";
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
    let candidate: FontFace;
    try {
      candidate = new FontFace("RalphySharedArtifactPreview", `url("${src}")`);
    } catch {
      onError();
      return;
    }
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
  if (!face) return <div className={`shared-viewer-preview-state ${STATE}`} role="status">Loading font preview…</div>;
  /* A specimen previews the face at the size the face is meant to be read at, so these two steps
     are content and not UI type. */
  return <div className="flex max-h-full w-shared-specimen max-w-shared-specimen-inset flex-col gap-4.5 overflow-y-auto p-10.5" style={{ fontFamily: '"RalphySharedArtifactPreview"' }}>
    <span className="font-code type-mono-sm tracking-caps text-muted">Font specimen · {slug}</span>
    <strong className="type-specimen-display font-normal leading-specimen-display text-ink">Aa Bb Cc 123</strong>
    <p className="m-0 type-specimen leading-specimen text-ink">Handgloves &amp; rooftop dusk</p>
    <small className="type-title leading-specimen-sample text-muted">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</small>
  </div>;
}

const availabilityReason = (value: Availability<unknown>) => value.status === "ready" ? "Available from Core." : value.reason;
const stringList = (value: Availability<string[]>) => value.status === "ready"
  ? value.value.length ? value.value.join(" · ") : "No values returned by Core."
  : value.status === "partial"
    ? value.value.length ? value.value.join(" · ") : value.reason
    : value.reason;

function ViewerStage({ artifact, preview, kind, onPreviewError }: {
  artifact: SharedArtifactPresentation;
  preview: PreviewState;
  kind: ViewerKind;
  onPreviewError(): void;
}) {
  if (artifact.preview === "no-target") return <div className={`shared-viewer-preview-state ${STATE}`}>
    <ImageOff aria-hidden="true" /><strong className={STATE_TITLE}>Preview unavailable</strong><span className={STATE_LINE}>No preview target · Core returned no selected preview target.</span>
  </div>;
  if (kind === "unsupported") return <div className={STATE}>
    <FileText aria-hidden="true" />
    <strong className={STATE_TITLE}>In-place preview unavailable</strong>
    <span className={STATE_LINE}>{artifact.mime ?? "MIME unavailable"} · {formatBytes(artifact.bytes)}</span>
    <p className="mt-0.75 mb-0 type-label leading-normal text-muted">The current Desktop contract exposes no bounded safe read for this content. Use Open original.</p>
  </div>;
  if (preview.status === "loading") return <div className={`shared-viewer-preview-state ${STATE}`} role="status">Loading preview…</div>;
  if (preview.status === "unavailable") return <div className={`shared-viewer-preview-state ${STATE}`} title={preview.reason}>
    <ImageOff aria-hidden="true" /><strong className={STATE_TITLE}>Preview unavailable</strong><span className={STATE_LINE}>{preview.reason}</span>
  </div>;
  const name = `Slug identity: ${artifact.slug}`;
  if (kind === "image" || kind === "vector") return <div className={`absolute inset-0 grid place-items-center [&>.image-viewport]:size-full ${kind === "vector" ? "shared-viewer-vector-stage bg-ghost" : "shared-viewer-image-stage"}`}>
    <ImageViewport src={preview.url} name={name} tone="instrument" onError={onPreviewError} />
    <span className="pointer-events-none absolute bottom-3 left-3 h-5.5 rounded-chip bg-media-plate px-2 py-1.25 font-code type-mono-sm tracking-label text-on-instrument">FIT</span>
  </div>;
  /* The stage is a light widget (`bg-surface-sunken`). A picture and a video bring their own
     black media frame, so their chrome stays on-dark; the waveform paints no plate at all, and
     with the on-dark default its title read #F2F2F0 on #E4E4E2 -- 1.06:1. */
  if (kind === "video") return <VideoPlayer src={preview.url} name={name} tone="instrument" onError={onPreviewError} />;
  if (kind === "audio") return <AudioWaveform src={preview.url} name={name} sizeBytes={preview.sizeBytes} tone="surface" onError={onPreviewError} />;
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const detailRequest = useRef(0);
  const previewRequest = useRef(0);
  const revisionRequest = useRef(0);
  const selectionRequest = useRef(0);
  const actionRequest = useRef(0);
  const unavailableActionId = useId();
  const targetlessActionId = useId();
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
    actionRequest.current += 1;
    setOpenState("idle");
    return () => {
      detailRequest.current += 1;
      selectionRequest.current += 1;
      actionRequest.current += 1;
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

  return <Modal
    id="shared-viewer"
    open
    onOpenChange={(open) => { if (!open) close(); }}
    size="h-shared-viewer-height w-shared-viewer-width"
    layer="viewer"
    className="shared-artifact-viewer @container/shared-viewer"
    /* The head is one line of facts about the artifact, which is also its name here: there is no
       separate heading, because the slug and the kind are the identity. */
    title={topLine}
    titleClassName="m-0 min-w-0 flex-1 truncate font-code type-mono-sm tracking-caps text-muted"
    description={`Preview ${detail.slug}`}
    descriptionClassName="sr-only"
    closeLabel="Close viewer"
    actions={<button className={ACTION} type="button" aria-label="Open original" aria-describedby={detail.preview === "no-target" ? targetlessActionId : undefined} disabled={detail.preview === "no-target" || openState === "pending"} onClick={() => { void openOriginal(); }}><ExternalLink aria-hidden="true" />{openState === "pending" ? "Opening original…" : "Open original"}</button>}
    card="raw"
    titlebarClassName="shared-viewer-head"
    bodyClassName="shared-viewer-body flex items-stretch gap-4 p-3.5 @max-shared-viewer/shared-viewer:flex-col @max-shared-viewer/shared-viewer:overflow-y-auto"
    surfaceRef={surfaceRef}
    onOpenAutoFocus={(event) => { event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true }); }}
    onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
  >
            <div className="shared-viewer-main flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
              <div className="shared-viewer-stage relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden rounded-menu bg-surface [&>:is(.custom-video-player,.audio-waveform-player)]:w-full [&>:is(.custom-video-player,.audio-waveform-player)]:max-w-shared-stage-media [&>.custom-video-player]:h-full [&_.custom-video-player_.viewer-video]:object-contain @max-shared-viewer/shared-viewer:h-shared-stage-basis @max-shared-viewer/shared-viewer:min-h-shared-stage @max-shared-viewer/shared-viewer:flex-none">
                <ViewerStage artifact={detail} preview={preview} kind={kind} onPreviewError={() => setPreview({ status: "unavailable", reason: "The preview media could not be decoded or loaded." })} />
                <button className={`${STEP} left-3`} type="button" aria-label="Previous artifact" disabled={!canPrevious} onClick={() => navigate(artifacts[index - 1])}><ChevronLeft aria-hidden="true" /></button>
                <button className={`${STEP} right-3`} type="button" aria-label="Next artifact" disabled={!canNext} onClick={() => navigate(artifacts[index + 1])}><ChevronRight aria-hidden="true" /></button>
              </div>
              <div className="shared-viewer-transport flex min-h-control-md flex-none flex-wrap items-center gap-1.75 font-code type-mono-sm text-muted">
                <span>{index >= 0 ? index + 1 : 0} / {artifacts.length} loaded</span>
                <i className="h-3.5 w-px bg-ink/8" aria-hidden="true" />
                <strong className="ml-auto type-mono-sm font-normal tracking-caps text-muted">Revision</strong>
                {revisions.loading && revisions.items.length === 0 && <span role="status">Loading revisions…</span>}
                {revisions.items.map((revision) => {
                  const selected = revision.id === detail.selectedRevisionId;
                  return <button
                    type="button"
                    key={revision.id}
                    className={`${TRANSPORT_BUTTON} ${selected ? "is-selected bg-instrument text-on-instrument [&_small]:text-on-instrument-muted focus-visible:outline-focus-on-instrument" : "bg-surface-sunken text-ink hover:bg-surface-hover disabled:opacity-50"}`}
                    disabled={selected || selection.status === "pending" || selection.status === "reloading"}
                    aria-label={selected ? `Revision ${revision.revisionNo} selected default` : `Select revision ${revision.revisionNo} as default for future use`}
                    onClick={() => { void selectRevision(revision.id); }}
                  >Revision {revision.revisionNo}{selected && <small className="ml-1.25 type-mono-sm text-current">Selected default</small>}</button>;
                })}
                {revisions.nextCursor && <><span>More revisions are available</span><button className={`${TRANSPORT_BUTTON} bg-surface-sunken text-ink hover:bg-surface-hover disabled:opacity-50`} type="button" disabled={revisions.loading} onClick={() => { void loadRevisions(revisions.nextCursor); }}>Load more revisions</button></>}
              </div>
              {revisions.error && <div className={ALERT} role="alert"><span>Revision history unavailable · {revisions.error}</span><button className={ACTION} type="button" onClick={() => { void loadRevisions(revisions.items.length ? revisions.nextCursor : null); }}>Retry revisions</button></div>}
              {selection.status === "pending" && <p className={SECTION_COPY} role="status">Selecting default revision…</p>}
              {selection.status === "reloading" && <p className={SECTION_COPY} role="status">Reloading current selected default…</p>}
              {selection.status === "conflict" && <div className={ALERT} role="alert"><span>The selected default changed in Core. Reload current state before retrying.</span><button className={ACTION} type="button" onClick={() => { void reloadConflict(); }}>Reload current state</button></div>}
              {selection.status === "reloaded" && <div className={ALERT} role="status"><span>Current selected default reloaded. Retry when ready.</span><button className={ACTION} type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
              {selection.status === "error" && <div className={ALERT} role="alert"><span>Revision selection unavailable · {selection.message}</span><button className={ACTION} type="button" onClick={() => { void selectRevision(selection.revisionId); }}>Retry selection</button></div>}
              {openState === "error" && <div className={ALERT} role="alert"><span>Open original unavailable.</span><button className={ACTION} type="button" onClick={() => { void openOriginal(); }}>Retry open original</button></div>}
            </div>
            <aside className="shared-viewer-context flex w-shared-viewer-context min-w-0 flex-none flex-col gap-3.25 overflow-y-auto rounded-menu bg-surface p-4 @max-shared-viewer/shared-viewer:w-full @max-shared-viewer/shared-viewer:overflow-visible">
              <div>
                <Dialog.Title asChild><h2 className="m-0 type-title font-normal leading-title text-ink">{titleText(detail)}</h2></Dialog.Title>
                <Dialog.Description asChild><p className="mt-1.25 mb-0 font-code type-mono-md text-muted">Slug identity · {detail.slug}</p></Dialog.Description>
              </div>
              <dl className="m-0 grid gap-1.25">
                {([
                  ["MIME", detail.mime ?? "Unavailable"],
                  ["Size", formatBytes(detail.bytes)],
                  ["Selected revision state", detail.selectedState ?? "Unavailable"],
                  ["Semantic roles", stringList(detail.semanticRoles)],
                  ["Tags", stringList(detail.tags)],
                  ["Named entities", stringList(detail.entities)],
                  ["Canonical status", availabilityReason(detail.canonicalStatus)],
                ] as const).map(([label, value]) => <div className={FACT_ROW} key={label}><dt className={FACT_LABEL}>{label}</dt><dd className={FACT_VALUE}>{value}</dd></div>)}
              </dl>
              <section className="flex flex-col gap-1.25 rounded-cell bg-surface-hover p-3.25"><h3 className={SECTION_LABEL}>Context agents receive</h3><dl className="m-0 grid gap-1.25">
                {(["Purpose", "Use when", "Avoid when", "Constraints"] as const).map((label) => <div className={FACT_ROW} key={label}><dt className={FACT_LABEL}>{label}</dt><dd className={FACT_VALUE}>{availabilityReason(detail.agentUse)}</dd></div>)}
                <div className={FACT_ROW}><dt className={FACT_LABEL}>Agent-use canonical status</dt><dd className={FACT_VALUE}>{availabilityReason(detail.canonicalStatus)}</dd></div>
              </dl></section>
              <section className="flex flex-col gap-1.25"><h3 className={SECTION_LABEL}>Referenced as</h3><p className={SECTION_COPY}>{detail.referencedAs.length ? detail.referencedAs.join(" · ") : "No referenced-role evidence returned by Core."}</p></section>
              <section className="flex flex-col gap-1.25"><h3 className={SECTION_LABEL}>Actual usage</h3><p className={SECTION_COPY}>System-derived backlinks are unavailable from this Core version.</p></section>
              <span className="flex-1 @max-shared-viewer/shared-viewer:hidden" />
              <button className={`${ACTION} w-full flex-none`} type="button" aria-disabled="true" aria-describedby={unavailableActionId}>Use in project unavailable</button>
              <p className={REASON} id={unavailableActionId}>Use in project is unavailable until Core exposes a mutation contract.</p>
              {detail.preview === "no-target" && <p className={REASON} id={targetlessActionId}>Open original is unavailable because Core returned no selected media target.</p>}
              {onOpenInspector && <button className={`${ACTION} w-full flex-none`} type="button" onClick={() => onOpenInspector(detail)}><PanelRight aria-hidden="true" />Open full inspector</button>}
              <small className="font-code type-mono-sm tracking-meta text-muted">← → ARTIFACT · MEDIA CONTROLS ARE LABELLED · ESC CLOSE</small>
            </aside>
  </Modal>;
}
