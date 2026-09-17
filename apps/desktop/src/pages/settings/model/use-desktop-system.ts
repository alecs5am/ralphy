import { useCallback, useEffect, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import type { DesktopSystemInfo } from "../../../../shared/desktop-system";

export function useDesktopSystem() {
  const [info, setInfo] = useState<DesktopSystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setInfo(await bridge.getDesktopSystemInfo()); setError(null); }
    catch { setError("System checks could not finish. Try again."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { info, error, busy, refresh };
}
export function diskSize(bytes: number | null | undefined): string {
  if (bytes == null) return "Not measured";
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
