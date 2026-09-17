import { useEffect, useRef, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { ArrowRight, Layers3 } from "@/shared/ui/icons";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { UnitRevisionPreview, unitRevisionNumber } from "@/entities/unit";
import type { UnitRevisionDto } from "../../../../electron/ralphy/types";
import { parseAgentMessage, type UnitCardReference } from "../lib/agent-mdx";

const UNIT_REFRESH_DEBOUNCE_MS = 120;

export interface AgentUnitNavigation {
  workspaceId?: string | null;
  onOpenUnit?(project: ProjectReference, unitId: string, label: string): void;
}

function ChatUnitCard({ reference, workspaceId, onOpenUnit }: AgentUnitNavigation & { reference: UnitCardReference }) {
  const [summary, setSummary] = useState<{ title: string; format: string; versions: number; sourceRevisionId?: string | null; sourceLabel?: string | null; cursor: string | null; source: UnitRevisionDto | null; revisions: UnitRevisionDto[] } | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sameWorkspace = reference.workspaceId === workspaceId;
  const epoch = useRef(0);
  const expanded = useRef(visibleCount);
  expanded.current = visibleCount;
  useEffect(() => {
    let current = true;
    epoch.current++;
    setSummary(null); setError(false); setVisibleCount(8); setMoreError(false); setLoadingMore(false);
    if (!sameWorkspace) return;
    const project = { workspaceId: reference.workspaceId, projectId: reference.projectId };
    const load = async () => {
      const requestEpoch = ++epoch.current;
      setLoadingMore(false); setMoreError(false);
      try {
        const unit = await bridge.loadProjectUnit(project, reference.unitId);
        if (unit.id !== reference.unitId || !unit.latestRevisionId) throw new Error("Unit is not ready");
        const [latest, page, source] = await Promise.all([
          bridge.loadProjectUnitRevision(project, unit.id, unit.latestRevisionId),
          bridge.loadProjectUnitPage(project, { kind: "revisions", unitId: unit.id }),
          unit.sourceRevisionId ? bridge.loadProjectUnitRevision(project, unit.id, unit.sourceRevisionId).catch(() => null) : null,
        ]);
        const revisions = page.items.filter((item) => item.unitId === unit.id && item.id !== unit.sourceRevisionId);
        let cursor = page.nextCursor;
        const seen = new Set<string>();
        while (cursor && revisions.length < expanded.current && current && requestEpoch === epoch.current) {
          if (seen.has(cursor)) throw new Error("Repeated version cursor");
          seen.add(cursor);
          const next = await bridge.loadProjectUnitPage(project, { kind: "revisions", unitId: unit.id, cursor });
          revisions.push(...next.items.filter((item) => item.unitId === unit.id && item.id !== unit.sourceRevisionId && !revisions.some(({ id }) => id === item.id)));
          cursor = next.nextCursor;
        }
        if (current && requestEpoch === epoch.current) {
          setError(false);
          setSummary({ title: unit.slug, format: unit.format, versions: latest.revisionNo - (source?.unitId === unit.id ? 1 : 0), source, sourceRevisionId: unit.sourceRevisionId, sourceLabel: unit.sourceLabel, cursor, revisions: revisions.sort((a, b) => b.revisionNo - a.revisionNo) });
        }
      } catch { if (current && requestEpoch === epoch.current) { setSummary(null); setError(true); } }
    };
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = bridge.onMediaEvent((event) => {
      if (event.type !== "activity-refresh") return;
      clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, UNIT_REFRESH_DEBOUNCE_MS);
    });
    return () => { current = false; epoch.current++; clearTimeout(timer); unsubscribe(); };
  }, [reference.workspaceId, reference.projectId, reference.unitId, sameWorkspace, attempt]);
  const showMore = async () => {
    if (!summary || loadingMore) return;
    const requestEpoch = epoch.current;
    setLoadingMore(true); setMoreError(false);
    try {
      if (visibleCount >= summary.revisions.length && summary.cursor) {
        const page = await bridge.loadProjectUnitPage({ workspaceId: reference.workspaceId, projectId: reference.projectId }, { kind: "revisions", unitId: reference.unitId, cursor: summary.cursor });
        if (epoch.current !== requestEpoch) return;
        if (page.nextCursor === summary.cursor) throw new Error("Repeated version cursor");
        setSummary({ ...summary, cursor: page.nextCursor, revisions: [...summary.revisions, ...page.items.filter((item) => item.unitId === reference.unitId && item.id !== summary.sourceRevisionId && !summary.revisions.some(({ id }) => id === item.id))] });
      }
      setVisibleCount((count) => count + 8);
    } catch { if (epoch.current === requestEpoch) setMoreError(true); } finally { if (epoch.current === requestEpoch) setLoadingMore(false); }
  };
  return <div className="agent-unit-card @container/unit-card my-5 overflow-hidden rounded-frame bg-surface p-1.5 ring-1 ring-inset ring-divider">
  <button
    type="button"
    className="group block w-full overflow-hidden rounded-frame bg-surface text-left text-ink transition-colors duration-fast hover:ring-brand/40 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none disabled:opacity-60"
    disabled={!sameWorkspace || !onOpenUnit || (!summary && !error)}
    onClick={() => error ? setAttempt((value) => value + 1) : onOpenUnit?.({ workspaceId: reference.workspaceId, projectId: reference.projectId }, reference.unitId, reference.title ?? summary?.title ?? "Unit")}
  >
    <span className="block overflow-hidden rounded-field bg-card">
      <span className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <span className="grid min-w-0 gap-1.5"><span className="flex items-center gap-1.5 font-code type-mono-sm uppercase tracking-block text-muted"><Layers3 size={13} />Creative unit{summary?.format ? ` / ${summary.format}` : ""}</span><strong className="type-title font-medium leading-row">{reference.title ?? summary?.title ?? "Creative unit"}</strong></span>
        {summary && sameWorkspace && <span className="shrink-0 rounded-control bg-brand px-2.5 py-1 font-code type-xs text-brand-ink">{summary.versions} versions</span>}
      </span>
      {sameWorkspace && summary && summary.revisions.length > 0 && <span className={`agent-unit-gallery grid gap-2 px-3 ${summary.revisions.slice(0, visibleCount).length <= 4 || summary.revisions.slice(0, visibleCount).length === 8 ? "grid-cols-2" : "grid-cols-3 @max-sm/unit-card:grid-cols-2"}`}>
        {summary.revisions.slice(0, visibleCount).map((revision) => <span key={revision.id} className="agent-unit-variant min-w-0 overflow-hidden rounded-cell bg-surface" title={`Revision ${unitRevisionNumber(revision, summary.source)}${revision.note ? `: ${revision.note}` : ""}`}>
          <UnitRevisionPreview project={reference} revisionId={revision.id} sealedAt={revision.sealedAt} className="aspect-creative-preview w-full" />
          <span className="flex items-center justify-between gap-1 px-2.5 py-2"><strong className="font-code type-xs font-medium">R{unitRevisionNumber(revision, summary.source)}</strong><span className={`type-xs ${unitRevisionNumber(revision, summary.source) === summary.versions ? "font-medium text-ink" : "text-muted"}`}>{unitRevisionNumber(revision, summary.source) === summary.versions ? "Latest" : revision.id === summary.sourceRevisionId ? "Original" : unitRevisionNumber(revision, summary.source) === 1 ? "First version" : "Variant"}</span></span>
          {revision.note && <span className="block truncate px-2.5 pb-2 type-xs text-secondary">{revision.note.split("\n", 1)[0]}</span>}
        </span>)}
      </span>}
      {sameWorkspace && summary?.sourceRevisionId && <span className="mx-3 mt-3 flex items-center gap-3 rounded-field bg-surface p-3"><UnitRevisionPreview project={reference} revisionId={summary.sourceRevisionId} className="size-12 shrink-0 rounded-cell" /><span className="grid gap-1"><strong className="type-sm">R0 · Original</strong><span className="type-xs text-muted">{summary.sourceLabel ?? "Source creative"} · View in Unit</span></span></span>}
      <span className="flex items-center justify-between gap-3 px-4 py-3.5"><span className="type-sm text-muted">{!sameWorkspace ? "This unit belongs to another workspace" : error ? "Unit unavailable · Retry" : summary ? "Explore and compare versions" : "Loading creative…"}</span><span className="grid size-8 shrink-0 place-items-center rounded-full bg-instrument text-on-instrument transition-colors duration-fast group-hover:bg-brand group-hover:text-brand-ink motion-reduce:transition-none"><ArrowRight size={16} /></span></span>
    </span>
  </button>
  {sameWorkspace && summary && (visibleCount < summary.revisions.length || summary.cursor) && <button type="button" className="agent-unit-more w-full rounded-control px-4 py-3 type-sm text-ink hover:bg-card" disabled={loadingMore} onClick={() => void showMore()}>{loadingMore ? "Loading versions…" : moreError ? "Could not load versions · Retry" : `Show more versions (${Math.min(visibleCount, summary.revisions.length)} of ${summary.versions})`}</button>}
  </div>;
}

export function AgentMessage({ markdown, ...navigation }: AgentUnitNavigation & { markdown: string }) {
  return <>{parseAgentMessage(markdown).map((part, index) => part.kind === "unit"
    ? <ChatUnitCard key={`${index}:${part.reference.unitId}`} reference={part.reference} {...navigation} />
    : <MarkdownView key={index} markdown={part.text} tone="chat" />)}</>;
}
