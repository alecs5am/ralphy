import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { action, FIELD_WIDE, Plate, Row, Section } from "./rows";

type Snapshot = Awaited<ReturnType<typeof bridge.loadCalendar>>;

export function PostizConnection({ workspace }: { workspace?: { id: string; name: string } | null }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    if (!workspace) return;
    const request = ++version.current;
    setBusy(true); setError(null);
    try {
      const day = new Date(); day.setHours(0, 0, 0, 0);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const result = await bridge.loadCalendar(workspace.id, { from: day.toISOString(), to: next.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (request === version.current) setSnapshot(result);
    } catch { if (request === version.current) setError("Could not load Postiz connection. Try refreshing."); }
    finally { if (request === version.current) setBusy(false); }
  }, [workspace?.id]);
  useEffect(() => { void refresh(); return () => { version.current++; }; }, [refresh]);

  if (!workspace) return <Section title="PUBLISHING"><Plate><Row title="Postiz" description="Open a workspace to manage its publishing accounts. Each workspace has its own connection." /></Plate></Section>;
  const connected = snapshot?.postiz.available;
  const accounts = snapshot?.accounts.filter((account) => !account.disconnected) ?? [];
  return <Section title="PUBLISHING · WORKSPACE">
    <Plate><Row title={`Postiz · ${workspace.name}`} description={snapshot ? `${connected ? "Key connected" : "Not connected"} · ${accounts.length} available publishing accounts. Used by Calendar in this workspace.` : "Loading connection…"}>
      <button className={action()} type="button" disabled={busy} onClick={() => { void refresh(); }}>Refresh</button>
    </Row></Plate>
    {accounts.length > 0 && <Plate>{accounts.map((account) => <Row key={account.id} title={account.handle} description={account.platform} />)}</Plate>}
    <form className="flex flex-col gap-3 rounded-inner bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      if (busy || !key.trim()) return;
      const request = ++version.current;
      setBusy(true); setError(null); setNotice(null);
      void bridge.connectCalendar(workspace.id, key.trim()).then(async (result) => {
        if (request !== version.current) return;
        setKey("");
        setNotice(`Postiz authenticated. ${result.imported} accounts connected${result.skipped ? `; ${result.skipped} unsupported or disabled accounts skipped` : ""}. No posts were published.`);
        await refresh();
      }).catch(() => { if (request === version.current) setError("Postiz could not connect. Check the API key and network, then refresh or retry."); })
        .finally(() => { if (request === version.current) setBusy(false); });
    }}>
      <label className="type-ui text-ink" htmlFor="postiz-api-key">{connected ? "Replacement Postiz API key" : "Postiz API key"}</label>
      <input id="postiz-api-key" className={`${FIELD_WIDE} min-w-0 w-full flex-none`} type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={key} onChange={(event) => setKey(event.currentTarget.value)} minLength={8} maxLength={4096} required disabled={busy} />
      <p className="m-0 type-label leading-row text-muted">Checks access and imports available social accounts. The key is encrypted in this workspace; connecting never publishes content.</p>
      <button type="submit" className={`${action({ tone: "primary" })} self-start`} disabled={busy || !key.trim()}>{busy ? "Working…" : connected ? "Reconnect Postiz" : "Connect Postiz"}</button>
    </form>
    {notice && <p className="m-0 type-label leading-row text-muted" role="status">{notice}</p>}
    {error && <p className="m-0 type-label leading-row text-alert" role="alert">{error}</p>}
  </Section>;
}
