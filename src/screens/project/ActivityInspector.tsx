import { Clock3, DollarSign, RotateCw, X } from "lucide-react";

import type { ActivityRunDetail } from "../../../electron/media/types";
import type { ActivityDto } from "../../../electron/ralphy/types";
import { AiBrandIcon } from "../../components/AiBrandIcon";
import { RalphyMascot } from "../../components/RalphyMascot";
import { activitySource, humanizeActivity, summarizeActivityRun } from "./activity-presentation";

const dateValue = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value);
const duration = (value: number | null) => value === null ? "—" : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;

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

  return <aside className="activity-inspector rounded-panel bg-surface text-ink" data-instrument-overlay="run-inspector" aria-labelledby="activity-inspector-title">
    <header className="activity-inspector-header bg-transparent">
      <span className="activity-inspector-brand" aria-hidden="true">
        {source === "ralphy" ? <RalphyMascot size={22} /> : source === "generation" ? <AiBrandIcon provider="openrouter" model={model ?? undefined} size={20} /> : <Clock3 size={18} />}
      </span>
      <div>
        <h2 id="activity-inspector-title">{humanizeActivity(event.action)}</h2>
        <p>{humanizeActivity(source)} · {humanizeActivity(event.entityType)}</p>
      </div>
      <button className="activity-inspector-close" type="button" aria-label="Close activity details" onClick={onClose}><X size={16} /></button>
    </header>

    {loading && !detail ? <p className="activity-inspector-state">Loading details…</p> : null}
    {error && !detail ? <div className="activity-inspector-state" role="alert"><span>{error}</span><button type="button" onClick={onRetry}><RotateCw size={14} /> Retry</button></div> : null}

    {detail ? <>
      <section className="activity-inspector-metrics" aria-label="Run metrics">
        <div><span>State</span><strong>{humanizeActivity(detail.run.state)}</strong></div>
        <div><span><Clock3 size={13} /> Duration</span><strong>{duration(summary?.durationMs ?? null)}</strong></div>
        <div><span><DollarSign size={13} /> Cost</span><strong>{summary?.costUsd == null ? "—" : `$${summary.costUsd.toFixed(4)}`}</strong></div>
      </section>
      <section className="activity-inspector-section">
        <h3>Overview</h3>
        <dl>
          <div><dt>Run</dt><dd>{detail.run.id}</dd></div>
          <div><dt>Kind</dt><dd>{humanizeActivity(detail.run.kind)}</dd></div>
          <div><dt>Model</dt><dd>{model ?? "—"}</dd></div>
          <div><dt>Provider</dt><dd>{summary?.providers.join(", ") || "—"}</dd></div>
          <div><dt>Event time</dt><dd>{dateValue(event.createdAt).toLocaleString()}</dd></div>
          <div><dt>Sequence</dt><dd>{event.sequence}</dd></div>
        </dl>
      </section>
      <section className="activity-inspector-section">
        <h3>Attempts</h3>
        <div className="activity-attempts">
          {detail.attempts.map((attempt) => <div className="activity-attempt" key={attempt.id}>
            <AiBrandIcon provider="openrouter" model={attempt.model ?? undefined} size={16} />
            <span>{attempt.model ?? attempt.provider ?? `Attempt ${attempt.attemptNo}`}</span>
            <small>{humanizeActivity(attempt.state)}</small>
            <strong>{attempt.costUsd === null ? "—" : `$${attempt.costUsd.toFixed(4)}`}</strong>
          </div>)}
        </div>
      </section>
    </> : !loading && !error ? <section className="activity-inspector-section"><h3>Overview</h3><dl>
      <div><dt>Entity</dt><dd>{event.entityId}</dd></div>
      <div><dt>Type</dt><dd>{humanizeActivity(event.entityType)}</dd></div>
      <div><dt>Event time</dt><dd>{dateValue(event.createdAt).toLocaleString()}</dd></div>
      <div><dt>Sequence</dt><dd>{event.sequence}</dd></div>
    </dl></section> : null}
  </aside>;
}
