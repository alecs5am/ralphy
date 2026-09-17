import { useState } from "react";
import { bridge } from "../api/ipc";
import { Download, Upload } from "./icons";
import { PAGE_HEADER_BUTTON } from "./PageHeader";

export function WorkspaceArchiveAction({ workspaceId, onImported, onStatus }: { workspaceId?: string; onImported?(id: string): void; onStatus?(message: string, failed: boolean): void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const report = (text: string, failure = false) => { setMessage(text); setFailed(failure); onStatus?.(text, failure); };
  const run = async () => {
    if (busy) return;
    setBusy(true); setMessage(null); setFailed(false);
    try {
      if (workspaceId) {
        const result = await bridge.exportLibraryWorkspace(workspaceId);
        if (result) report(`Saved ${result.fileName}. Includes media, revisions, chats and editing drafts. Account credentials are excluded.`);
      } else {
        const result = await bridge.importLibraryWorkspace();
        if (result) { report("Workspace imported. Reconnect your accounts to use external services."); onImported?.(result.workspaceId); }
      }
    } catch (cause) {
      report(cause instanceof Error ? cause.message : "Workspace transfer failed. Try again.", true);
    } finally { setBusy(false); }
  };
  return <div className="flex min-w-0 flex-col gap-2">
    <button className={PAGE_HEADER_BUTTON} type="button" disabled={busy} onClick={() => void run()} title={workspaceId ? "Save media, chats and drafts. Archive limit: 1 GiB." : "Restore a workspace archive up to 1 GiB into this library"}>
      {workspaceId ? <Download size={14} /> : <Upload size={14} />}
      {busy ? workspaceId ? "Exporting…" : "Importing…" : workspaceId ? "Export workspace" : "Import workspace"}
    </button>
    {message && !onStatus && <p className="m-0 max-w-full type-xs leading-copy text-muted" role={failed ? "alert" : "status"}>{message}</p>}
  </div>;
}
