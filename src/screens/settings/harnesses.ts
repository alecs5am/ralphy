import { useCallback, useEffect, useState } from "react";

import type { AgentProvider, AgentProviderStatus } from "../../../electron/media/types";
import { bridge } from "../../lib/ipc";
import type { StatusTone } from "./rows";

/**
 * Adapter from the agent bridge contract to the settings row model. Everything shown here
 * is reported by the bridge: where the contract is silent the row says so instead of
 * inventing a friendly-sounding capability.
 */
export interface HarnessRow {
  id: AgentProvider;
  name: string;
  source: string;
  status: string;
  auth: string;
  capabilities: string;
  model: string;
  detail: string;
  tone: StatusTone;
  action: string;
  installed: boolean;
  connected: boolean;
  models: readonly { value: string; label: string; meta?: string }[];
  /** The bridge only accepts a stored key for the providers it can authenticate. */
  credential: "api-key" | "provider-login" | "none";
}

const CREDENTIAL: Record<AgentProvider, HarnessRow["credential"]> = {
  claude: "api-key",
  openrouter: "api-key",
  codex: "provider-login",
};

export function harnessRow(status: AgentProviderStatus): HarnessRow {
  const tone: StatusTone = !status.binaryReady ? "off" : status.connected ? "ok" : "warn";
  const label = !status.binaryReady
    ? "NOT INSTALLED"
    : status.connected ? "CONNECTED" : status.apiKeyConfigured || status.accountConnected ? "MISCONFIGURED" : "NEEDS LOGIN";
  const auth = status.accountConnected
    ? "PROVIDER LOGIN"
    : status.apiKeyConfigured ? (status.inheritedApiKey ? "ENVIRONMENT" : "KEYCHAIN") : "NO CREDENTIAL";
  return {
    id: status.id,
    name: status.label,
    source: `${status.id.toLocaleUpperCase()} · BRIDGE ADAPTER`,
    status: label,
    auth,
    capabilities: status.models.length ? `${status.models.length} MODELS REPORTED` : "NO MODELS REPORTED",
    model: status.defaultModel || "—",
    detail: status.detail,
    tone,
    // The action names what is actually missing: a binary, a login, or a stored key.
    action: !status.binaryReady
      ? "Install"
      : status.connected ? "Manage" : CREDENTIAL[status.id] === "api-key" ? "Add key" : "Sign in",
    installed: status.binaryReady,
    connected: status.connected,
    models: status.models.map(({ id, label: name, description }) => ({ value: id, label: name, meta: description })),
    credential: CREDENTIAL[status.id],
  };
}

export type HarnessLoadState = "loading" | "ready" | "unavailable";

export interface HarnessController {
  state: HarnessLoadState;
  rows: readonly HarnessRow[];
  refresh(): Promise<void>;
  signIn(id: AgentProvider): Promise<void>;
  saveKey(id: AgentProvider, key: string): Promise<void>;
  clearKey(id: AgentProvider): Promise<void>;
}

export function useHarnesses(): HarnessController {
  const [state, setState] = useState<HarnessLoadState>("loading");
  const [rows, setRows] = useState<readonly HarnessRow[]>([]);

  const apply = useCallback((statuses: AgentProviderStatus[]) => {
    setRows(statuses.map(harnessRow));
    setState("ready");
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await bridge.getAgentProviders());
    } catch {
      setState("unavailable");
    }
  }, [apply]);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    state,
    rows,
    refresh,
    signIn: async (id) => {
      // Only the two providers with their own login flow are offered a sign-in control.
      if (id === "openrouter") return;
      apply(await bridge.loginAgentProvider(id));
    },
    saveKey: async (id, key) => {
      if (id === "codex") throw new Error("Codex authenticates through its own provider login.");
      apply(await bridge.setAgentApiKey(id, key));
    },
    clearKey: async (id) => {
      if (id === "codex") return;
      apply(await bridge.clearAgentApiKey(id));
    },
  };
}
