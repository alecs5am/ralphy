import type { ChatItem } from "../screens/Workspace";

/**
 * Live project view — in Electron a file watcher on workspace/projects/<id>/
 * drives this. Here it reflects chat progress so the design is checkable.
 * Geometry over decoration: numbered plates for beats, state dots, asset tiles.
 */
const BEATS = [
  { id: "01", label: "Hook", sub: "cold-open, 0–2s" },
  { id: "02", label: "Reveal", sub: "product in frame" },
  { id: "03", label: "Detail", sub: "macro / texture" },
  { id: "04", label: "CTA", sub: "call to action" },
];

export function ProjectPanel({ items }: { items: ChatItem[] }) {
  const generated = items.filter((i) => i.kind === "tool" && i.tool && !i.tool.running && i.tool.summary.includes("generate")).length;
  const cost = items.reduce((s, i) => s + (i.kind === "tool" && i.tool?.estCostUsd && !i.tool.running ? i.tool.estCostUsd : 0), 0);

  return (
    <div className="panel">
      <span className="eyebrow"><i className="dot" /> PROJECT</span>

      <div className="panel-section">
        <h4>Storyboard</h4>
        {BEATS.map((b, i) => (
          <div className={`beat${i === 0 && generated > 0 ? " done" : ""}`} key={b.id}>
            <span className="plate">{b.id}</span>
            <span className="label">{b.label}<small>{b.sub}</small></span>
          </div>
        ))}
      </div>

      <div className="panel-section">
        <h4>Assets</h4>
        <div className="asset-grid">
          {BEATS.map((b, i) => (
            <div className="asset" key={b.id}>{i === 0 && generated > 0 ? "scene-01" : "—"}</div>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h4>Status</h4>
        <div className="state-row"><span className="ind ok" /> Scenario drafted</div>
        <div className="state-row"><span className={`ind ${generated > 0 ? "ok" : ""}`} /> Hook image {generated > 0 ? "ready" : "pending"}</div>
        <div className="state-row"><span className="ind warn" /> Render not started</div>
        <div className="state-row" style={{ marginTop: 8, color: "var(--ink-2)" }}>
          <span className="ind" style={{ background: "var(--vio)" }} /> Spent this session: <b style={{ color: "var(--vio)" }}>${cost.toFixed(2)}</b>
        </div>
      </div>
    </div>
  );
}
