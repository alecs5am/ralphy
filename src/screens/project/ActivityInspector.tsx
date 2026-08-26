import { Clock3, DollarSign, RotateCw } from "lucide-react";

import type { ActivityRunDetail } from "../../../electron/media/types";
import type { ActivityDto } from "../../../electron/ralphy/types";
import { AiBrandIcon } from "../../components/AiBrandIcon";
import { RalphyMascot } from "../../components/RalphyMascot";
import { activitySource, humanizeActivity, summarizeActivityRun } from "./activity-presentation";
import { WINDOW, WINDOW_BODY, WINDOW_TITLEBAR, WindowClose } from "../../components/ui/Window";

const dateValue = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value);
const duration = (value: number | null) => value === null ? "—" : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;

/* This panel is portalled to the right-rail host at body level, outside `.app-mode-work`, where
   the legacy `--fg*` family resolves to the on-dark set. Every ink here is stated as a theme
   utility for that reason: the sheet's `--fg-3` labels were painting #A4A4A0 on the light panel
   at 2.1:1, and the metric tiles' `--raised` plate was the legacy #2D2D2D dark block. */
const SECTION = "activity-inspector-section pt-4.5";
const SECTION_HEADING = "m-0 pb-2.25 type-sm font-normal text-muted";
const TERM_LIST = "m-0 grid gap-2";
const TERM_ROW = "grid grid-cols-(--activity-term-columns) gap-2.5";
const TERM = "type-sm text-muted";
const VALUE = "font-code type-sm text-muted [overflow-wrap:anywhere]";
const STATE_PLATE = "activity-inspector-state grid min-h-activity-state place-items-center gap-2.5 type-sm text-muted";
const STATE_ACTION = "inline-flex h-control-sm items-center gap-1.5 rounded-control bg-surface-sunken px-3 type-sm text-ink hover:bg-surface-hover";

export function ActivityInspector({ event, detail, loading, error, onRetry, onClose }: {
  event: ActivityDto;
  detail: ActivityRunDetail | null;
  loading: boolean;
  error: string | null;
  onRetry(): void;
  onClose(): void;
}) {
  const source = activitySource(event);
  const summary = detail ? summarizeActivityRun(detail) : null;
  const model = summary?.models[0] ?? null;

  /* Inline in the timeline's grid the panel is a column; below `activity-columns` the route
     stacks and the panel becomes a bounded pinned sheet. Both are container variants, so neither
     reaches the portalled copy, which has no `project-domain` container above it. */
  return <aside className={`activity-inspector text-ink @max-activity-columns/project-domain:z-sticky @max-activity-columns/project-domain:w-activity-inspector ${WINDOW}`} data-instrument-overlay="run-inspector" aria-labelledby="activity-inspector-title">
    {/* One line on the panel: the source's mark, what happened, and the close. */}
    <header className={`activity-inspector-header ${WINDOW_TITLEBAR}`}>
      {/* Holds the near-white mascot, so the chip has to be the dark surface. */}
      <span className="activity-inspector-brand grid size-8 flex-none place-items-center rounded-full bg-instrument text-on-instrument-muted" aria-hidden="true">
        {source === "ralphy" ? <RalphyMascot size={22} /> : source === "generation" ? <AiBrandIcon provider="openrouter" model={model ?? undefined} size={20} /> : <Clock3 size={18} />}
      </span>
      <h2 className="m-0 min-w-0 flex-none truncate type-md font-normal" id="activity-inspector-title">{humanizeActivity(event.action)}</h2>
      <p className="m-0 min-w-0 flex-1 truncate type-sm text-muted">{humanizeActivity(source)} · {humanizeActivity(event.entityType)}</p>
      <WindowClose className="activity-inspector-close" label="Close activity details" onClick={onClose} />
    </header>
    <div className={`activity-inspector-card overflow-y-auto p-4 [scrollbar-gutter:stable] ${WINDOW_BODY}`}>

    {loading && !detail ? <p className={STATE_PLATE}>Loading details…</p> : null}
    {error && !detail ? <div className={STATE_PLATE} role="alert"><span>{error}</span><button className={STATE_ACTION} type="button" onClick={onRetry}><RotateCw size={14} /> Retry</button></div> : null}

    {detail ? <>
      <section className="activity-inspector-metrics mt-3.5 grid grid-cols-(--activity-metric-columns) gap-1.5" aria-label="Run metrics">
        <div className="grid min-w-0 gap-1.25 rounded-cell bg-surface-sunken p-2.25"><span className="flex items-center gap-1 type-sm text-muted">State</span><strong className="overflow-hidden font-code type-sm font-normal text-ellipsis">{humanizeActivity(detail.run.state)}</strong></div>
        <div className="grid min-w-0 gap-1.25 rounded-cell bg-surface-sunken p-2.25"><span className="flex items-center gap-1 type-sm text-muted"><Clock3 size={13} /> Duration</span><strong className="overflow-hidden font-code type-sm font-normal text-ellipsis">{duration(summary?.durationMs ?? null)}</strong></div>
        <div className="grid min-w-0 gap-1.25 rounded-cell bg-surface-sunken p-2.25"><span className="flex items-center gap-1 type-sm text-muted"><DollarSign size={13} /> Cost</span><strong className="overflow-hidden font-code type-sm font-normal text-ellipsis">{summary?.costUsd == null ? "—" : `$${summary.costUsd.toFixed(4)}`}</strong></div>
      </section>
      <section className={SECTION}>
        <h3 className={SECTION_HEADING}>Overview</h3>
        <dl className={TERM_LIST}>
          <div className={TERM_ROW}><dt className={TERM}>Run</dt><dd className={VALUE}>{detail.run.id}</dd></div>
          <div className={TERM_ROW}><dt className={TERM}>Kind</dt><dd className={VALUE}>{humanizeActivity(detail.run.kind)}</dd></div>
          <div className={TERM_ROW}><dt className={TERM}>Model</dt><dd className={VALUE}>{model ?? "—"}</dd></div>
          <div className={TERM_ROW}><dt className={TERM}>Provider</dt><dd className={VALUE}>{summary?.providers.join(", ") || "—"}</dd></div>
          <div className={TERM_ROW}><dt className={TERM}>Event time</dt><dd className={VALUE}>{dateValue(event.createdAt).toLocaleString()}</dd></div>
          <div className={TERM_ROW}><dt className={TERM}>Sequence</dt><dd className={VALUE}>{event.sequence}</dd></div>
        </dl>
      </section>
      <section className={SECTION}>
        <h3 className={SECTION_HEADING}>Attempts</h3>
        <div className="activity-attempts grid gap-0.5">
          {detail.attempts.map((attempt) => <div className="activity-attempt grid min-h-8.5 grid-cols-(--activity-attempt-columns) items-center gap-2 rounded-control px-1.75 py-1.25 text-muted hover:bg-surface-hover hover:text-ink" key={attempt.id}>
            <AiBrandIcon provider="openrouter" model={attempt.model ?? undefined} size={16} />
            <span className="truncate">{attempt.model ?? attempt.provider ?? `Attempt ${attempt.attemptNo}`}</span>
            <small className="truncate">{humanizeActivity(attempt.state)}</small>
            <strong className="truncate font-code type-sm font-normal">{attempt.costUsd === null ? "—" : `$${attempt.costUsd.toFixed(4)}`}</strong>
          </div>)}
        </div>
      </section>
    </> : !loading && !error ? <section className={SECTION}><h3 className={SECTION_HEADING}>Overview</h3><dl className={TERM_LIST}>
      <div className={TERM_ROW}><dt className={TERM}>Entity</dt><dd className={VALUE}>{event.entityId}</dd></div>
      <div className={TERM_ROW}><dt className={TERM}>Type</dt><dd className={VALUE}>{humanizeActivity(event.entityType)}</dd></div>
      <div className={TERM_ROW}><dt className={TERM}>Event time</dt><dd className={VALUE}>{dateValue(event.createdAt).toLocaleString()}</dd></div>
      <div className={TERM_ROW}><dt className={TERM}>Sequence</dt><dd className={VALUE}>{event.sequence}</dd></div>
    </dl></section> : null}
    </div>
  </aside>;
}
