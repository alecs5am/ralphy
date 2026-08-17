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
  return <dl className="inspector-properties">{rows.map(([label, value]) => <div className="property-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
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
    <div className="viewer-actions">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "Show less" : "Show full"}</button>
      <button type="button" aria-label={`Copy ${role}`} onClick={() => { void copy(); }}><Copy size={14} aria-hidden="true" />Copy</button>
    </div>
    {copyError && <p className="project-local-error" role="alert">{copyError}</p>}
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
  if (state === "error") return <div className="project-local-error" role="alert"><span>{error ?? "Generation details could not be loaded."}</span><button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
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
  return <section className="run-object-evidence" aria-label="RunObject evidence"><h3>RunObject evidence</h3><Facts rows={[
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
  if (revisions.status === "loading") return <div role="status">Loading revisions…</div>;
  if (revisions.status === "error") return <div className="project-local-error" role="alert"><span>{revisions.error ?? "Revisions could not be loaded."}</span><button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  return <section className="revision-chooser" aria-label="Artifact revisions">
    <h3>Select a revision</h3>
    {revisions.error && <p className="project-local-error" role="alert">{revisions.error}</p>}
    {revisions.items.length === 0 ? <p>No revisions returned.</p> : revisions.items.map((revision: ArtifactRevisionDto) => <article key={revision.id}>
      <span><strong>Revision {revision.revisionNo}</strong> · {revision.state} · {formatTime(revision.createdAt)}</span>
      <button type="button" disabled={revision.id === selectedRevisionId} onClick={() => onSelect(revision.id)}>Select</button>
    </article>)}
  </section>;
}

function ViewerPreview({ card, snapshot, controller }: { card: MediaCardDto; snapshot: ProjectScreenSnapshot; controller: ProjectScreenController }) {
  if (isArtifactMedia(card) && !card.selectedRevisionId) return <RevisionChooser revisions={snapshot.mediaRevisions} selectedRevisionId={card.selectedRevisionId} onSelect={(id) => { void controller.selectMediaRevision(id); }} onRetry={() => { void controller.retryMediaRevisions(); }} />;
  const preview = snapshot.domain.preview;
  if (preview.status === "loading") return <div role="status">Loading preview…</div>;
  if (preview.status === "error") return <div className="project-local-error" role="alert"><span>{preview.error ?? "Preview could not be loaded."}</span><button type="button" onClick={() => { void controller.retryMediaPreview(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  if (preview.status !== "ready" || !preview.value) return <p>Preview unavailable.</p>;
  const name = mediaCardName(card);
  if (card.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} />;
  if (card.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} />;
  if (card.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} />;
  return <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
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
      <Dialog.Overlay asChild><motion.div className="asset-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} /></Dialog.Overlay>
      <Dialog.Content asChild onOpenAutoFocus={(event) => { event.preventDefault(); surfaceRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
        <motion.section ref={surfaceRef} tabIndex={-1} className="asset-modal-surface" style={{ borderRadius: 18 }} initial={{ opacity: 0.72 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
          <div className="asset-modal-toolbar">
            <div className="viewer-identity">
              <Dialog.Title asChild><strong>{mediaCardName(card)}</strong></Dialog.Title>
              <Dialog.Description asChild><small>{card.ref.type} · {card.ref.id}</small></Dialog.Description>
            </div>
            <div className="viewer-actions">
              <button type="button" disabled={index <= 0} aria-label="Previous" onClick={() => { void controller.navigateMediaViewer(-1); }}><ChevronLeft size={15} aria-hidden="true" /></button>
              <button type="button" disabled={index < 0 || index >= items.length - 1} aria-label="Next" onClick={() => { void controller.navigateMediaViewer(1); }}><ChevronRight size={15} aria-hidden="true" /></button>
              <Dialog.Close asChild><button type="button" aria-label="Close"><X size={15} aria-hidden="true" /></button></Dialog.Close>
            </div>
          </div>
          <div className="asset-modal-body">
            <div className="asset-modal-stage"><motion.div className="asset-modal-content" key={`${card.ref.type}:${card.ref.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><ViewerPreview card={card} snapshot={snapshot} controller={controller} /></motion.div></div>
            <aside className="asset-modal-inspector"><div className="inspector">{isRunObjectMedia(card) && <RunObjectEvidence card={card} />}<GenerationInspector key={`${card.ref.type}:${card.ref.id}`} detail={snapshot.mediaGeneration.value} state={snapshot.mediaGeneration.status} error={snapshot.mediaGeneration.error} onRetry={() => { void controller.retryMediaGeneration(); }} /></div></aside>
          </div>
        </motion.section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
