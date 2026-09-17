import { useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { useDesktopSystem, diskSize } from "../model/use-desktop-system";
import type { SettingsContext } from "../model/context";
import { action, Plate, Row, Section, Status } from "./rows";

export function StoragePage({ ctx: _ctx }: { ctx: SettingsContext }) {
  const { info, error, busy, refresh } = useDesktopSystem();
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const clear = async () => {
    setClearing(true); setResult(null);
    try {
      const result = await bridge.clearDesktopCache();
      setResult(`${diskSize(Math.max(0, result.beforeBytes - result.afterBytes))} reclaimed`);
      await refresh();
    } catch { setResult("Cache could not be cleared. Try again."); }
    finally { setClearing(false); }
  };
  return <>
    <Section title="LIBRARY"><Plate>
      <Row title="Library folder" description={info?.libraryPath ?? "Reading library location…"}><button className={action()} disabled={!info?.libraryPath} onClick={() => void bridge.revealDesktopFolder("library").catch(() => setResult("Folder could not be opened."))}>Show in Finder</button></Row>
      <Row title="Storage access" description={info?.libraryError ?? "Checks that a temporary file can be created and removed."}><Status tone={info?.libraryWritable ? "ok" : "warn"}>{busy ? "CHECKING" : info?.libraryWritable ? "WRITABLE" : "CHECK REQUIRED"}</Status></Row>
      <Row title="Available disk space"><Status>{diskSize(info?.availableBytes)}</Status></Row>
    </Plate></Section>
    <Section title="CACHE"><Plate>
      <Row title="Browser cache" description="Cached web responses. Clearing this does not remove your generated media, chats, credentials or editing drafts." id="storage.cache"><Status>{diskSize(info?.cacheBytes)}</Status><button className={action()} disabled={clearing || busy} onClick={() => void clear()}>{clearing ? "Clearing…" : "Clear cache"}</button></Row>
    </Plate></Section>
    {(error || result) && <p role="status" className="type-sm text-muted">{error ?? result}</p>}
    <button className={`${action()} self-start`} disabled={busy || clearing} onClick={() => void refresh()}>Refresh storage</button>
  </>;
}
