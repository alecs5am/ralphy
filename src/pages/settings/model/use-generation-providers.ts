import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { GENERATION_PROVIDERS_CHANGED_EVENT, type GenerationProviderStatus } from "../../../../shared/generation-studio";

type ProviderId = GenerationProviderStatus["id"];
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export function useGenerationProviders(enabled: boolean) {
  const [providers, setProviders] = useState<GenerationProviderStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const version = useRef(0), pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const request = ++version.current;
    setLoading(true); setError(null);
    try {
      const next = await bridge.loadGenerationProviders();
      if (request === version.current) setProviders(next);
    } catch (cause) { if (request === version.current) setError(message(cause)); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  useEffect(() => () => { version.current++; }, []);

  const update = async (provider: ProviderId, key?: string) => {
    if (pending.current) return false;
    pending.current = true;
    const request = ++version.current;
    setBusy(provider); setError(null); setNotice(null);
    try {
      const next = key === undefined
        ? await bridge.clearGenerationProviderKey(provider)
        : await bridge.setGenerationProviderKey(provider, key);
      window.dispatchEvent(new Event(GENERATION_PROVIDERS_CHANGED_EVENT));
      if (request === version.current) {
        setProviders(next);
        const saved = next.find((item) => item.id === provider);
        setNotice(key === undefined
          ? `${saved?.name ?? provider}: saved key removed.${saved?.inherited ? " An environment key remains available." : ""}`
          : `${saved?.name ?? provider}: key saved. Provider access has not been tested.`);
      }
      return true;
    } catch (cause) {
      if (request === version.current) setError(key ? message(cause).replaceAll(key, "[redacted]") : message(cause));
      return false;
    } finally {
      pending.current = false;
      if (request === version.current) setBusy(null);
    }
  };
  return { providers, loading, busy, error, notice, refresh, save: (provider: ProviderId, key: string) => update(provider, key), clear: (provider: ProviderId) => update(provider) };
}
