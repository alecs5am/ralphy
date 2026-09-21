import { useEffect, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { ArrowUpRight, Layers3, RotateCcw } from "@/shared/ui/icons";
import { UnitRevisionPreview, unitRevisionNumber } from "@/entities/unit";
import type { UnitRevisionDto } from "../../../../electron/ralphy/types";
import type { UnitCardReference } from "../lib/agent-mdx";

export interface AgentUnitNavigation {
  workspaceId?: string | null;
  onOpenUnit?(project: ProjectReference, unitId: string, label: string, revisionId?: string): void;
}

type UnitSummary = {
  identity: string;
  title: string;
  versions: number;
  source: UnitRevisionDto | null;
  sourceLabel?: string | null;
  revisions: UnitRevisionDto[];
};

const PREVIEW_LIMIT = 4;
const UNIT_REFRESH_DEBOUNCE_MS = 120;
const CARD_ACTION = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

export function ChatUnitCard({ reference, workspaceId, onOpenUnit }: AgentUnitNavigation & { reference: UnitCardReference }) {
  const [result, setResult] = useState<UnitSummary | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sameWorkspace = reference.workspaceId === workspaceId;
  const identity = `${reference.workspaceId}:${reference.projectId}:${reference.unitId}`;
  const summary = result?.identity === identity ? result : null;

  useEffect(() => {
    let current = true;
    let epoch = 0;
    setResult(null); setError(false);
    if (!sameWorkspace) return;
    const project = { workspaceId: reference.workspaceId, projectId: reference.projectId };
    const load = async () => {
      const requestEpoch = ++epoch;
      try {
        const unit = await bridge.loadProjectUnit(project, reference.unitId);
        if (!current || requestEpoch !== epoch) return;
        if (unit.id !== reference.unitId || !unit.latestRevisionId) throw new Error("Unit is not ready");
        const [latest, page, original] = await Promise.all([
          bridge.loadProjectUnitRevision(project, unit.id, unit.latestRevisionId),
          bridge.loadProjectUnitPage(project, { kind: "revisions", unitId: unit.id }),
          unit.sourceRevisionId ? bridge.loadProjectUnitRevision(project, unit.id, unit.sourceRevisionId).catch(() => null) : null,
        ]);
        if (latest.unitId !== unit.id || latest.id !== unit.latestRevisionId) throw new Error("Version does not belong to this unit");
        const source = original?.unitId === unit.id && original.id === unit.sourceRevisionId ? original : null;
        const revisions = [...new Map([latest, ...page.items]
          .filter((revision) => revision.unitId === unit.id && revision.id !== source?.id)
          .map((revision) => [revision.id, revision])).values()]
          .sort((a, b) => b.revisionNo - a.revisionNo)
          .slice(0, PREVIEW_LIMIT - (source ? 1 : 0));
        if (current && requestEpoch === epoch) {
          setError(false);
          setResult({ identity, title: unit.slug, versions: Math.max(0, latest.revisionNo - (source ? 1 : 0)), source, sourceLabel: unit.sourceLabel, revisions });
        }
      } catch {
        if (current && requestEpoch === epoch) { setResult(null); setError(true); }
      }
    };
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = bridge.onMediaEvent((event) => {
      if (event.type !== "activity-refresh") return;
      clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, UNIT_REFRESH_DEBOUNCE_MS);
    });
    return () => { current = false; clearTimeout(timer); unsubscribe(); };
  }, [reference.workspaceId, reference.projectId, reference.unitId, sameWorkspace, identity, attempt]);

  const title = reference.title ?? summary?.title ?? "Content";
  const open = (revisionId?: string) => onOpenUnit?.(
    { workspaceId: reference.workspaceId, projectId: reference.projectId }, reference.unitId, title, revisionId,
  );
  const previews = summary ? [...(summary.source ? [summary.source] : []), ...summary.revisions] : [];

  return <div className="agent-unit-card min-w-0 overflow-hidden rounded-field bg-chat-field">
    <button type="button" aria-label={`Open ${title}`} disabled={!sameWorkspace || !onOpenUnit || !summary}
      className={`${CARD_ACTION} flex w-full items-center gap-2 rounded-field px-2 py-2 text-left text-ink hover:bg-chat-control`}
      onClick={() => open()}>
      <Layers3 size={14} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate type-sm font-medium">{title}</span>
      {sameWorkspace && summary && <span className="shrink-0 type-xs tabular-nums text-muted">{summary.versions ? `${summary.versions} ${summary.versions === 1 ? "version" : "versions"}` : "Original"}</span>}
      <ArrowUpRight size={14} className="shrink-0 text-muted" />
    </button>
    {sameWorkspace && summary ? <div className="agent-unit-gallery flex gap-1 px-2 pb-2">
      {previews.map((revision) => {
        const original = revision.id === summary.source?.id;
        const label = original ? "Original" : `R${unitRevisionNumber(revision, summary.source)}`;
        const note = (original ? summary.sourceLabel : revision.note)?.split("\n", 1)[0];
        return <button key={revision.id} type="button" disabled={!onOpenUnit}
          className={`${CARD_ACTION} agent-unit-variant group relative min-w-0 max-w-chat-unit-preview flex-1 overflow-hidden rounded-chip text-left`}
          aria-label={`Open ${title}, ${original ? "original" : `revision ${unitRevisionNumber(revision, summary.source)}`}${note ? `: ${note}` : ""}`}
          title={`${label}${note ? ` · ${note}` : ""}`} onClick={() => open(revision.id)}>
          <UnitRevisionPreview project={reference} revisionId={revision.id} sealedAt={revision.sealedAt} className="aspect-chat-unit-preview w-full" />
          <span className="absolute inset-x-0 bottom-0 bg-media-plate px-1.5 py-1 type-xs text-on-instrument">
            <span>{label}</span>
            {note && <span className="hidden truncate group-hover:block group-focus-visible:block">{note}</span>}
          </span>
        </button>;
      })}
    </div> : <div className="flex items-center gap-2 px-2 pb-2 type-xs text-muted" role="status">
      <span>{!sameWorkspace ? "This content belongs to another workspace" : error ? "Content unavailable" : "Loading content…"}</span>
      {sameWorkspace && error && <button type="button" className={`${CARD_ACTION} inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-ink hover:bg-chat-control`} onClick={() => setAttempt((value) => value + 1)}><RotateCcw size={12} />Retry</button>}
    </div>}
  </div>;
}
