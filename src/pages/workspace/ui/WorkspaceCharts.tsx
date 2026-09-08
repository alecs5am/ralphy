import { useId, useState, type CSSProperties } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";

interface TrendPoint { label: string; value: number }
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const CELL = "p-2 font-normal text-left";

/** SVG patterns keep the dots at physical pixel size as the panel resizes. */
export function AccessibleTrendChart({ value }: { value: readonly TrendPoint[] }) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const active = Math.min(selected ?? value.length - 1, value.length - 1);
  const point = value[active];
  const peak = Math.max(...value.map((item) => item.value), 0);
  const max = Math.max(peak, 1);
  return <Window className="workspace-trend">
    <WindowTitlebar><ChartNoAxesCombined className="size-4 shrink-0 text-muted" aria-hidden="true" /><h3 className="m-0 flex-1 type-sm font-semibold">Views over time</h3><span className="font-code type-xs text-muted">Daily totals</span></WindowTitlebar>
    <WindowBody className="workspace-signal-body gap-2 p-3">
      {point ? <>
        <div className="workspace-signal-readout flex items-baseline gap-2"><strong className="font-display type-display tabular-nums leading-none" aria-live="polite" aria-atomic="true">{compact.format(point.value)}</strong><span className="font-code type-xs text-muted">{point.label}</span><span className="ml-auto font-code type-xs text-muted">MAX {compact.format(peak)}</span></div>
        <div className="workspace-signal-field">
          <svg width="100%" height="144" className="workspace-signal-svg" role="img" aria-label="Workspace performance trend">
            <title>Workspace performance trend</title><desc>Each column is one reporting period on a shared zero-based scale. Focus a period to inspect it, or open the exact values table.</desc>
            <defs>
              <pattern id={`${id}-grid`} width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="currentColor" /></pattern>
              {["normal", "active"].map((tone) => <g key={tone} className={`workspace-pattern-${tone}`}>
                <pattern id={`${id}-${tone}-dither`} width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="currentColor" /><circle cx="6" cy="6" r="1.4" fill="currentColor" opacity=".65" /></pattern>
                <pattern id={`${id}-${tone}-dense`} width="4" height="4" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="2" height="2" fill="currentColor" /></pattern>
              </g>)}
            </defs>
            <rect width="100%" height="144" fill={`url(#${id}-grid)`} className="workspace-signal-grid" />
            {value.map((item, index) => {
              const height = Math.max(0, item.value) / max * 120;
              const x = `${(index + .05) / value.length * 100}%`;
              const width = `${.9 / value.length * 100}%`;
              const tone = index === active ? "active" : "normal";
              return <g key={index} data-active={index === active} className="workspace-signal-column">
                <rect x={x} y={132 - height} width={width} data-value={item.value} height={height} fill={`url(#${id}-${tone}-dither)`} />
                <rect x={x} y={132 - height} width={width} height={Math.min(16, height)} fill={`url(#${id}-${tone}-dense)`} />
                {index === active && <><line x1={`${(index + .5) / value.length * 100}%`} x2={`${(index + .5) / value.length * 100}%`} y1="0" y2="144" stroke="currentColor" strokeDasharray="2 6" opacity=".35" /><rect x={`${(index + .5) / value.length * 100}%`} y={128 - height} width="7" height="7" fill="currentColor" transform="translate(-3.5 0)" /></>}
              </g>;
            })}
            <line x1="0" x2="100%" y1="132" y2="132" className="stroke-divider" />
          </svg>
          <div className="workspace-signal-targets" style={{ "--signal-count": value.length } as CSSProperties} role="group" aria-label="Inspect reporting period">
            {value.map((item, index) => <button key={index} type="button" className="workspace-signal-target" aria-label={`${item.label}: ${item.value.toLocaleString()} views`} aria-pressed={index === active} onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? value.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
              buttons?.[Math.max(0, Math.min(next, value.length - 1))]?.focus();
            }}><span>{item.label}</span></button>)}
          </div>
        </div>
      </> : <p className="m-0 py-3 type-sm text-muted">No trend samples</p>}
      <details className="workspace-exact-values type-xs text-muted"><summary className="cursor-pointer">View exact values</summary>
        <table className="w-full border-collapse font-code type-xs"><caption className="py-2 text-left">Workspace performance trend values</caption><thead><tr><th className={CELL} scope="col">Period</th><th className={CELL} scope="col">Value</th></tr></thead><tbody>{value.map((item, index) => <tr key={index}><th className={CELL} scope="row">{item.label}</th><td className={CELL}>{item.value.toLocaleString()}</td></tr>)}</tbody></table>
      </details>
    </WindowBody>
  </Window>;
}

/** One common scale and an exact clipped fill; small values never round up to a full segment. */
export function SegmentMeter({ value, max, label }: { value: number | null; max: number; label: string }) {
  const id = useId();
  return <svg viewBox="0 0 100 8" className="workspace-segment-meter" preserveAspectRatio="none" role="img" aria-label={`${label}: ${value === null ? "unavailable" : value.toLocaleString()}`}>
    <defs><pattern id={id} width="4" height="8" patternUnits="userSpaceOnUse"><rect width="2.5" height="8" fill="currentColor" /></pattern></defs>
    <rect width="100" height="8" fill={`url(#${id})`} className="workspace-meter-track" />
    {value !== null && <rect width={Math.min(100, Math.max(0, value) / Math.max(1, max) * 100)} height="8" fill={`url(#${id})`} />}
  </svg>;
}
