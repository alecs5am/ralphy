import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Copy, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { ArtifactMediaCardDto, ArtifactRevisionDto, GenerationAttemptDetailDto, MediaCardDto, MediaGenerationDetailDto, RunObjectMediaCardDto } from "../../../electron/ralphy/types";
import { mediaCardName } from "../../components/VirtualAssetGrid";
import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import { bridge } from "../../lib/ipc";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { COMMAND_BUTTON, COMMAND_BUTTON_ON_INSTRUMENT, PROJECT_LOCAL_ERROR, PROJECT_LOCAL_ERROR_ON_INSTRUMENT } from "../route-chrome";

/* The whole modal is portalled to the body, i.e. outside `.app-mode-work`, where every legacy
   `--fg*` token resolves to the on-dark family. That is why the toolbar's own title used to paint
   #F2F2F0 on a #E4E4E2 plate at 1.06:1: every mark below states a theme colour instead. */
/* Every plain note the stage can show. The stage is `bg-instrument`, so anything mounted in it
   that states no ink inherits the theme's — which is the stage's own colour in the light theme. */
const STAGE_NOTE = "m-0 type-sm text-on-instrument-muted";
const SURFACE = "asset-modal-surface fixed inset-asset-modal-gutter z-modal-content m-auto flex h-asset-modal-height w-asset-modal-width flex-col overflow-hidden rounded-panel bg-surface text-ink outline-none";
const TOOLBAR = "asset-modal-toolbar flex min-h-13 flex-none items-center justify-between gap-4.5 bg-surface-sunken py-1.5 pr-2.5 pl-4";
/* The identity is a two-line block, not two inline marks on one line, which is what a `div` with
   no display of its own gave it. */
const IDENTITY = "viewer-identity flex min-w-0 flex-col";
const ACTIONS = "viewer-actions flex flex-none items-center gap-1";
const ACTION = "h-control-md rounded-field px-2.5 whitespace-nowrap text-muted hover:bg-surface-hover hover:text-ink disabled:text-muted-decorative focus-visible:-outline-offset-2";
const ICON_ACTION = "h-control-md w-control-md rounded-field p-0 text-muted hover:bg-surface-hover hover:text-ink disabled:text-muted-decorative focus-visible:-outline-offset-2";
/* A property row is the two-column table the stylesheet declared and never drew: it named the
   tracks but no `display`, so every label sat on the line above its value. */
const PROPERTY_ROW = "property-row grid min-h-control-md grid-cols-(--viewer-property-columns) gap-3 type-sm";

function formatTime(value: number | null): string {
  if (value === null) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatUsd(value: number | null): string {
  if (value === null) return "Unknown";
  if (value === 0) return "$0.00";
  const exact = String(value);
  return `$${exact.includes(".") || exact.includes("e") ? exact : `${exact}.00`}`;
}

function formatCost(value: number | null, complete: boolean): string {
  return `${formatUsd(value)} · ${complete ? "Complete" : "Partial"}`;
}

function formatDuration(startedAt: number | null, endedAt: number | null): string {
  if (startedAt === null || endedAt === null) return "Not recorded";
  return `${Math.max(0, endedAt - startedAt)} ms`;
}

function isArtifactMedia(card: MediaCardDto): card is ArtifactMediaCardDto {
  return card.ref.type === "artifact";
}

function isRunObjectMedia(card: MediaCardDto): card is RunObjectMediaCardDto {
  return card.ref.type === "run-object";
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="inspector-properties m-0 grid gap-0.5">{rows.map(([label, value]) => <div className={PROPERTY_ROW} key={label}><dt className="text-muted">{label}</dt><dd className="m-0 min-w-0 text-ink [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>;
}

function PromptText({ role, value, truncated }: { role: string; value: string; truncated: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyRequest = useRef(0);
  const label = role === "negative-prompt" ? "Negative prompt" : role[0].toUpperCase() + role.slice(1);
  useEffect(() => {
    copyRequest.current += 1;
    setCopyError(null);
    return () => { copyRequest.current += 1; };
  }, [value]);
  const copy = async () => {
    const requestId = ++copyRequest.current;
    setCopyError(null);
    try {
      await bridge.copyText(value);
    } catch (error) {
      if (requestId === copyRequest.current) setCopyError(error instanceof Error ? error.message : "Copy failed");
    }
  };
  return <section className="generation-text">
    <h4>{label}{truncated ? " · Truncated" : ""}</h4>
    <pre style={expanded ? undefined : { maxHeight: 96, overflow: "hidden" }}>{value}</pre>
    <div className={ACTIONS}>
      <button className={ACTION} type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "Show less" : "Show full"}</button>
      <button className={`${ACTION} inline-flex items-center gap-1.5`} type="button" aria-label={`Copy ${role}`} onClick={() => { void copy(); }}><Copy size={14} aria-hidden="true" />Copy</button>
    </div>
    {copyError && <p className={PROJECT_LOCAL_ERROR} role="alert">{copyError}</p>}
  </section>;
}

function Attempt({ attempt }: { attempt: GenerationAttemptDetailDto }) {
  const hasPrimaryText = attempt.input?.texts.some(({ role }) => role === "prompt" || role === "text") ?? false;
  return <section className="generation-attempt">
    <h4>Attempt {attempt.attemptNo}</h4>
    <Facts rows={[
      ["Provider", attempt.provider ?? "Not recorded"],
      ["Model", attempt.model ?? "Not recorded"],
      ["State", attempt.state],
      ["Started", formatTime(attempt.startedAt)],
      ["Ended", formatTime(attempt.endedAt)],
      ["Cost", formatUsd(attempt.costUsd)],
    ]} />
    {!hasPrimaryText && <section className="generation-text"><h4>Prompt</h4><pre>Not recorded</pre></section>}
    {attempt.input?.texts.map((text, index) => <PromptText key={`${text.role}-${index}`} {...text} />)}
    {!!attempt.input?.parameters.length && <><h4>Parameters</h4><Facts rows={attempt.input.parameters.map(({ name, value }) => [name, String(value)])} /></>}
  </section>;
}

function GenerationInspector({ detail, state, error, onRetry }: {
  detail: MediaGenerationDetailDto | null;
  state: ProjectScreenSnapshot["mediaGeneration"]["status"];
  error: string | null;
  onRetry(): void;
}) {
  if (state === "loading") return <div role="status">Loading generation details…</div>;
  if (state === "error") return <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{error ?? "Generation details could not be loaded."}</span><button className={COMMAND_BUTTON} type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  if (!detail) return <><h3>Provenance unavailable</h3><p>Not recorded</p></>;
  if (detail.status === "unknown") return <><h3>Provenance unavailable</h3><p>{detail.reason === "not-recorded" ? "Not recorded" : "Ambiguous producer"}</p></>;
  if (detail.status === "not-generation") return <><h3>Not a generation</h3><Facts rows={[["State", detail.producer.state], ["Created", formatTime(detail.producer.createdAt)], ["Started", formatTime(detail.producer.startedAt)], ["Ended", formatTime(detail.producer.endedAt)]]} /></>;
  return <>
    <h3>Generation</h3>
    <Facts rows={[["State", detail.run.state], ["Created", formatTime(detail.run.createdAt)], ["Started", formatTime(detail.run.startedAt)], ["Ended", formatTime(detail.run.endedAt)], ["Generation time", formatDuration(detail.run.startedAt, detail.run.endedAt)], ["Cost", formatCost(detail.cost.knownUsd, detail.cost.complete)]]} />
    {detail.attempts.items.length === 0 ? <p>Attempts · Not recorded</p> : detail.attempts.items.map((attempt) => <Attempt key={attempt.id} attempt={attempt} />)}
  </>;
}

function RunObjectEvidence({ card }: { card: RunObjectMediaCardDto }) {
  /* The rows are `.property-row` now, so the grid, the gap and the label ink come from the row
     itself rather than from four descendant variants stated here. */
  return <section className="run-object-evidence w-full self-start rounded-none bg-transparent p-0 [&_dl]:mt-3 [&_h3]:m-0" aria-label="RunObject evidence"><h3>RunObject evidence</h3><Facts rows={[
    ["Run ID", card.runId], ["Attempt", "Unlinked"], ["Purpose", card.purpose], ["State", card.state],
    ["Retention", card.retention], ["Logical path", card.logicalPath], ["Location class", card.locationClass],
    ["Object ID", card.objectId ?? "Not promoted"],
  ]} /></section>;
}

function RevisionChooser({ revisions, selectedRevisionId, onSelect, onRetry }: {
  revisions: ProjectScreenSnapshot["mediaRevisions"];
  selectedRevisionId: string | null;
  onSelect(id: string): void;
  onRetry(): void;
}) {
  if (revisions.status === "loading") return <div className={STAGE_NOTE} role="status">Loading revisions…</div>;
  if (revisions.status === "error") return <div className={PROJECT_LOCAL_ERROR_ON_INSTRUMENT} role="alert"><span>{revisions.error ?? "Revisions could not be loaded."}</span><button className={COMMAND_BUTTON_ON_INSTRUMENT} type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  return <section className="revision-chooser flex max-h-full min-w-0 flex-col gap-2 overflow-y-auto p-6 text-on-instrument" aria-label="Artifact revisions">
    <h3 className="m-0 type-md font-normal text-on-instrument">Select a revision</h3>
    {revisions.error && <p className={PROJECT_LOCAL_ERROR_ON_INSTRUMENT} role="alert">{revisions.error}</p>}
    {revisions.items.length === 0 ? <p className={STAGE_NOTE}>No revisions returned.</p> : revisions.items.map((revision: ArtifactRevisionDto) => <article className="flex min-w-0 items-center gap-3 rounded-cell bg-instrument-raised px-3.5 py-2.5" key={revision.id}>
      <span className="min-w-0 flex-1 type-sm text-on-instrument-muted"><strong className="font-normal text-on-instrument">Revision {revision.revisionNo}</strong> · {revision.state} · {formatTime(revision.createdAt)}</span>
      <button className="inline-flex h-control-sm flex-none items-center rounded-control bg-on-instrument px-3 type-sm text-instrument transition-colors duration-fast ease-instrument hover:bg-selected-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument disabled:bg-instrument-hover disabled:text-on-instrument-muted motion-reduce:transition-none motion-reduce:duration-0" type="button" disabled={revision.id === selectedRevisionId} onClick={() => onSelect(revision.id)}>Select</button>
    </article>)}
  </section>;
}

function ViewerPreview({ card, snapshot, controller }: { card: MediaCardDto; snapshot: ProjectScreenSnapshot; controller: ProjectScreenController }) {
  if (isArtifactMedia(card) && !card.selectedRevisionId) return <RevisionChooser revisions={snapshot.mediaRevisions} selectedRevisionId={card.selectedRevisionId} onSelect={(id) => { void controller.selectMediaRevision(id); }} onRetry={() => { void controller.retryMediaRevisions(); }} />;
  const preview = snapshot.domain.preview;
  if (preview.status === "loading") return <div className={STAGE_NOTE} role="status">Loading preview…</div>;
  if (preview.status === "error") return <div className={PROJECT_LOCAL_ERROR_ON_INSTRUMENT} role="alert"><span>{preview.error ?? "Preview could not be loaded."}</span><button className={COMMAND_BUTTON_ON_INSTRUMENT} type="button" onClick={() => { void controller.retryMediaPreview(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  if (preview.status !== "ready" || !preview.value) return <p className={STAGE_NOTE}>Preview unavailable.</p>;
  const name = mediaCardName(card);
  /* The stage is a black widget, so every player takes the instrument pair. */
  if (card.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} tone="instrument" />;
  if (card.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} tone="instrument" />;
  if (card.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} tone="instrument" />;
  return <a className={`${STAGE_NOTE} underline underline-offset-2`} href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
}

function editableTarget(event: KeyboardEvent): boolean {
  let target = event.target instanceof HTMLElement ? event.target : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  for (; target; target = target.parentElement) {
    const tag = target.tagName.toLowerCase();
    const contentEditable = target.getAttribute("contenteditable");
    if (tag === "input" || tag === "textarea"
      || (contentEditable !== null && contentEditable.toLowerCase() !== "false")
      || target.getAttribute("role") === "slider") return true;
  }
  return false;
}

export function MediaViewer({ controller, snapshot }: { controller: ProjectScreenController; snapshot: ProjectScreenSnapshot }) {
  const card = snapshot.selectedMedia;
  const surfaceRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const items = snapshot.domain.pages.media.items as MediaCardDto[];
  const index = card ? items.findIndex((item) => item.ref.type === card.ref.type && item.ref.id === card.ref.id) : -1;
  if (snapshot.mediaViewerOpen && !wasOpenRef.current && typeof document !== "undefined") returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpenRef.current = snapshot.mediaViewerOpen;
  const restoreFocus = (): boolean => {
    if (typeof document === "undefined") return false;
    const previous = returnFocusRef.current;
    if (previous && previous.isConnected) { previous.focus(); return true; }
    const fallback = document.querySelector<HTMLElement>(".media-card-tile [aria-pressed='true']")
      ?? document.querySelector<HTMLElement>("[data-media-focus-fallback='true']");
    if (!fallback?.isConnected) return false;
    fallback.focus();
    return true;
  };
  useEffect(() => {
    if (!snapshot.mediaViewerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || editableTarget(event)) return;
      if (event.key === "ArrowLeft" && index > 0) void controller.navigateMediaViewer(-1);
      if (event.key === "ArrowRight" && index >= 0 && index < items.length - 1) void controller.navigateMediaViewer(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, index, items.length, snapshot.mediaViewerOpen]);
  useEffect(() => {
    if (!snapshot.mediaViewerOpen && returnFocusRef.current) restoreFocus();
  }, [snapshot.mediaViewerOpen]);
  useEffect(() => () => {
    if (!wasOpenRef.current) return;
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.isConnected && active !== document.body) return;
      if (!restoreFocus()) window.requestAnimationFrame(() => { restoreFocus(); });
    });
  }, []);
  if (!card) return null;
  return <Dialog.Root open={snapshot.mediaViewerOpen} onOpenChange={(open) => { if (!open) controller.closeMediaViewer(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      {/* The scrim's fill and blur come from `[data-instrument-overlay-backdrop]` in
        work-surfaces.css, which is one shared decision for every overlay in the app. */}
    <Dialog.Overlay asChild><motion.div className="asset-modal-overlay fixed inset-0 z-modal overscroll-contain" data-instrument-overlay-backdrop="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} /></Dialog.Overlay>
      <Dialog.Content asChild data-instrument-overlay="media-viewer" onOpenAutoFocus={(event) => { event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
        <motion.section ref={surfaceRef} tabIndex={-1} className={`${SURFACE} [&_.generation-attempt]:bg-surface-sunken`} initial={{ opacity: 0.72 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
          <div className={TOOLBAR}>
            <div className={IDENTITY}>
              <Dialog.Title asChild><strong className="truncate type-base font-normal text-ink">{mediaCardName(card)}</strong></Dialog.Title>
              <Dialog.Description asChild><small className="truncate font-code type-xs text-muted">{card.ref.type} · {card.ref.id}</small></Dialog.Description>
            </div>
            <div className={ACTIONS}>
              <button className={ICON_ACTION} type="button" disabled={index <= 0} aria-label="Previous" onClick={() => { void controller.navigateMediaViewer(-1); }}><ChevronLeft size={15} aria-hidden="true" /></button>
              <button className={ICON_ACTION} type="button" disabled={index < 0 || index >= items.length - 1} aria-label="Next" onClick={() => { void controller.navigateMediaViewer(1); }}><ChevronRight size={15} aria-hidden="true" /></button>
              <Dialog.Close asChild><button className={ICON_ACTION} type="button" aria-label="Close"><X size={15} aria-hidden="true" /></button></Dialog.Close>
            </div>
          </div>
          <div className="asset-modal-body grid min-h-0 min-w-0 flex-1 grid-cols-(--asset-modal-columns)">
            <div className="asset-modal-stage grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden overscroll-contain bg-instrument"><motion.div className="asset-modal-content grid size-full min-h-0 min-w-0 place-items-center overflow-hidden" key={`${card.ref.type}:${card.ref.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><ViewerPreview card={card} snapshot={snapshot} controller={controller} /></motion.div></div>
            <aside className="asset-modal-inspector min-h-0 min-w-0 overflow-hidden bg-surface"><div className="inspector flex size-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto bg-transparent px-3.5 pt-3 pb-5 backdrop-filter-none">{isRunObjectMedia(card) && <RunObjectEvidence card={card} />}<GenerationInspector key={`${card.ref.type}:${card.ref.id}`} detail={snapshot.mediaGeneration.value} state={snapshot.mediaGeneration.status} error={snapshot.mediaGeneration.error} onRetry={() => { void controller.retryMediaGeneration(); }} /></div></aside>
          </div>
        </motion.section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
