import type { PermissionRequest } from "../lib/ipc";

/**
 * Confirm-with-cost gate. Fires before any paid or destructive tool
 * (ralphy generate / render). Maps to the stream-json can_use_tool request
 * the main process forwards. Approval is per-call, never blanket.
 */
export function PermissionModal({ req, onResolve }: { req: PermissionRequest; onResolve: (allow: boolean) => void }) {
  return (
    <div className="scrim">
      <div className="modal">
        <span className="eyebrow"><i className="dot" /> PERMISSION</span>
        <h3>Run a paid step?</h3>
        <div className="cmd">{req.command}</div>
        {req.estCostUsd != null && (
          <div className="cost">Estimated cost: <b>${req.estCostUsd.toFixed(2)}</b> from your Agent SDK credit.</div>
        )}
        <div className="actions">
          <button className="btn" onClick={() => onResolve(false)}>Not now</button>
          <button className="btn btn-vio" onClick={() => onResolve(true)}>Approve</button>
        </div>
      </div>
    </div>
  );
}
