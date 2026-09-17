import { useState } from "react";
import { bridge } from "../api/ipc";
import { Plus } from "./icons";
import { PAGE_HEADER_PRIMARY } from "./PageHeader";

/** Small inline creation flow shared by startup and workspace project lists. */
export function CreateLibraryEntry({ workspaceId, onCreated }: { workspaceId?: string; onCreated?(id: string): void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = workspaceId ? "project" : "workspace";
  if (!editing) return <button className={PAGE_HEADER_PRIMARY} onClick={() => setEditing(true)}><Plus size={14} />New {noun}</button>;
  return <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={(event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    const request = workspaceId ? bridge.createLibraryProject(workspaceId, name.trim()) : bridge.createLibraryWorkspace(name.trim());
    void request.then((id) => { setEditing(false); setName(""); onCreated?.(id); }).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : `Could not create ${noun}.`);
    }).finally(() => setBusy(false));
  }}>
    <input className="min-w-0 rounded-control bg-field px-3 py-2 type-sm text-ink focus-visible:outline-ink" aria-label={`${noun} name`} placeholder={`Name your ${noun}`} maxLength={120} value={name} required autoFocus disabled={busy} onChange={(event) => setName(event.target.value)} />
    <button className={PAGE_HEADER_PRIMARY} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create"}</button>
    <button type="button" className="rounded-control px-3 py-2 type-sm text-muted hover:bg-surface-hover" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
    {error && <p className="w-full type-sm text-danger" role="alert">{error}</p>}
  </form>;
}
