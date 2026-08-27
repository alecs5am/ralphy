/**
 * Connecting a provider: what is connected, what a connection needs, and the two ways to give it.
 *
 * Claude signs in through the harness and reports which method it used; the others take an API
 * key. Nothing here stores a credential -- the field hands it to the main process, which owns the
 * keychain, and the panel only ever learns whether it worked.
 */
import { useState, type FormEvent } from "react";
import { ArrowUp, Check, KeyRound, LoaderCircle, LogIn, Plug } from "lucide-react";

import type { AgentProviderStatus } from "@/shared/api/ipc";
import type { AgentChatController } from "@/features/agent-chat";
import { AgentFailure } from "@/features/agent-chat";

import {
  AgentProviderIcon,
  FIELD_INPUT,
  FIELD_RING,
  META,
  PILL,
  PRIMARY,
  PROVIDER_META,
  PROVIDER_ORDER,
  SPINNER,
} from "./agent-panel-chrome";

export function AgentConnection({ chat }: { chat: AgentChatController }) {
  const active = chat.activeChat;
  const status = chat.providers.find(({ id }) => id === active.provider);

  return (
    <div className="agent-connect flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-3.5">
      {/* The dialog keeps its own measure: it is a card the operator reads, not a band across the
          zone, and the chat is as wide as the window when the view panel is closed. */}
      <div className="agent-connect-dialog mx-auto flex w-full max-w-agent-connect-dialog flex-col gap-3 rounded-window bg-card">
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 flex-none place-items-center rounded-md bg-chat-field text-ink">
            <Plug size={15} strokeWidth={1.8} aria-hidden="true" />
          </span>
          {/* The dialog opens because the *chosen* provider is not connected, which is not the
              same as none being: saying "no provider connected" while another row reads CONNECTED
              is the panel contradicting itself. */}
          <h2 className="type-md font-normal text-ink">
            {chat.providers.some(({ connected }) => connected)
              ? `Connect ${PROVIDER_META[active.provider].label}`
              : "No provider connected"}
          </h2>
        </span>
        <p className="m-0 type-ui leading-copy text-secondary">
          Ralphy runs the chat through your own harness or key — nothing is proxied. Connect one
          provider and this chat picks it up immediately.
        </p>
        <div className="agent-connect-providers flex flex-col gap-0.75" role="radiogroup" aria-label="Agent provider">
          {PROVIDER_ORDER.map((provider) => {
            const row = chat.providers.find(({ id }) => id === provider);
            const chosen = provider === active.provider;
            return <button
              type="button"
              role="radio"
              aria-checked={chosen}
              className={`grid h-8.5 min-w-0 grid-cols-(--agent-provider-row-columns) items-center gap-2.5 rounded-tab px-2 text-left hover:bg-chat-field ${chosen ? "is-selected bg-chat-field" : "bg-transparent"}`}
              key={provider}
              onClick={() => chat.setProvider(provider)}
            >
              <AgentProviderIcon provider={provider} size={18} />
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate type-ui text-ink">{PROVIDER_META[provider].label}</span>
                <small className={`truncate ${META}`}>{PROVIDER_META[provider].account}</small>
              </span>
              {row?.connected
                ? <small className={META}>CONNECTED</small>
                : <span className={`${PILL} h-5.5 bg-chat-control px-2.25 type-xs text-ink`}>Connect</span>}
            </button>;
          })}
        </div>
        {chat.providersLoading && !status ? (
          <div className="agent-connect-loading flex min-h-8.5 items-center gap-2.25 type-sm text-secondary">
            <LoaderCircle size={16} className={SPINNER} />
            Checking provider
          </div>
        ) : active.provider === "claude" ? (
          <ClaudeConnectionControls chat={chat} status={status} />
        ) : active.provider === "codex" ? (
          <button
            className={`agent-connect-primary flex h-7.5 w-full items-center justify-center gap-1.75 rounded-full type-ui ${PRIMARY}`}
            type="button"
            disabled={!status?.binaryReady || chat.authAction !== null}
            onClick={() => void chat.login("codex")}
          >
            {chat.authAction === "codex" ? <LoaderCircle size={14} className={SPINNER} /> : <LogIn size={14} />}
            {status?.binaryReady ? "Sign in to Codex" : "Codex CLI not found"}
          </button>
        ) : (
          <AgentApiKeyControls chat={chat} provider="openrouter" status={status} />
        )}
        {/* The provider's own words, in the window the design gives a failure: a rejected key is
            reported, not diagnosed. */}
        {chat.connectionError && <AgentFailure title={`${PROVIDER_META[active.provider].label} could not be reached`} text={chat.connectionError} />}
      </div>
    </div>
  );
}

function ClaudeConnectionControls({
  chat,
  status,
}: {
  chat: AgentChatController;
  status: AgentProviderStatus | undefined;
}) {
  const method = chat.activeChat.claudeAuthMethod;
  return (
    <>
      <div className="agent-auth-tabs grid grid-cols-2 gap-0.75 rounded-full bg-chat-field p-0.75" role="group" aria-label="Claude authentication">
        <button
          type="button"
          className={`h-6.5 rounded-full bg-transparent type-sm text-secondary hover:text-ink aria-pressed:bg-card aria-pressed:text-ink ${method === "subscription" ? "is-active" : ""}`}
          aria-pressed={method === "subscription"}
          onClick={() => chat.setClaudeAuthMethod("subscription")}
        >
          Claude account
        </button>
        <button
          type="button"
          className={`h-6.5 rounded-full bg-transparent type-sm text-secondary hover:text-ink aria-pressed:bg-card aria-pressed:text-ink ${method === "api-key" ? "is-active" : ""}`}
          aria-pressed={method === "api-key"}
          onClick={() => chat.setClaudeAuthMethod("api-key")}
        >
          API key
        </button>
      </div>
      {method === "subscription" ? (
        <button
          className={`agent-connect-primary flex h-7.5 w-full items-center justify-center gap-1.75 rounded-full type-ui ${PRIMARY}`}
          type="button"
          disabled={!status?.binaryReady || chat.authAction !== null}
          onClick={() => void chat.login("claude")}
        >
          {chat.authAction === "claude" ? <LoaderCircle size={14} className={SPINNER} /> : <LogIn size={14} />}
          {status?.binaryReady ? "Sign in with Claude" : "Claude CLI not found"}
        </button>
      ) : (
        <AgentApiKeyControls chat={chat} provider="claude" status={status} />
      )}
    </>
  );
}

function AgentApiKeyControls({
  chat,
  provider,
  status,
}: {
  chat: AgentChatController;
  provider: "claude" | "openrouter";
  status: AgentProviderStatus | undefined;
}) {
  const [apiKey, setApiKey] = useState("");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    void chat.setApiKey(provider, apiKey).then((saved) => {
      if (saved) setApiKey("");
    });
  };
  if (status?.apiKeyConfigured) {
    return (
      <div className="agent-key-ready flex min-h-8.5 items-center gap-1.75 type-sm text-left text-ink">
        <Check size={14} />
        <span className="min-w-0 flex-1 text-secondary">{PROVIDER_META[provider].label} API key is ready</span>
        {!status.inheritedApiKey && (
          <button className="bg-transparent type-xs text-secondary hover:text-ink" type="button" onClick={() => void chat.clearApiKey(provider)}>Forget</button>
        )}
      </div>
    );
  }
  return (
    <form className="agent-key-form flex items-center gap-1" onSubmit={submit}>
      <label className={`flex h-7.5 min-w-0 flex-1 items-center gap-1.75 rounded-full bg-chat-field px-2.75 text-secondary ${FIELD_RING}`}>
        <KeyRound size={13} />
        <input
          className={`${FIELD_INPUT} font-code type-xs`}
          type="password"
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${PROVIDER_META[provider].label} API key`}
          placeholder={provider === "claude" ? "sk-ant-..." : "sk-or-v1-..."}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <button className={`grid size-7.5 flex-none place-items-center rounded-full ${PRIMARY}`} type="submit" disabled={!apiKey.trim() || chat.authAction !== null}>
        {chat.authAction === provider
          ? <LoaderCircle size={14} className={SPINNER} />
          : <ArrowUp size={14} strokeWidth={2} />}
      </button>
    </form>
  );
}
