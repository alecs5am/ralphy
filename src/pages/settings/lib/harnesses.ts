import { useCallback, useEffect, useState } from "react";

import type { AgentProvider, AgentProviderStatus } from "../../../../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import type { StatusTone } from "../ui/rows";

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
  /** Whether the bridge stores a key for this provider. */
  apiKey: boolean;
  /** Whether the provider runs its own login flow. Claude has both and offering only the key
      hid Claude Code behind an Anthropic billing account the operator may not have. */
  login: boolean;
}

const CREDENTIAL: Record<AgentProvider, { apiKey: boolean; login: boolean }> = {
  claude: { apiKey: true, login: true },
  openrouter: { apiKey: true, login: false },
  codex: { apiKey: false, login: true },
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
    // The action names what is actually missing: a binary, a login, or a stored key. A provider
    // with both offers the login, because a subscription is the account most operators hold.
    action: !status.binaryReady
      ? "Install"
      : status.connected ? "Manage" : CREDENTIAL[status.id].login ? "Sign in" : "Add key",
    installed: status.binaryReady,
    connected: status.connected,
    models: status.models.map(({ id, label: name, description }) => ({ value: id, label: name, meta: description })),
    ...CREDENTIAL[status.id],
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
    // The literal comparisons are the bridge's own narrowing: each channel accepts only the
    // providers it can serve, so the guard has to name them rather than read the table above.
    signIn: async (id) => {
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
