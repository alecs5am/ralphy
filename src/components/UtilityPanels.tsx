import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  LogIn,
  PanelRightClose,
  Plus,
  Search,
  SendHorizontal,
  ShieldCheck,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import type {
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  ProjectSummary,
  WorkspaceSummary,
} from "../lib/ipc";
import type {
  AgentChatController,
  AgentChatEntry,
} from "../chat/useAgentChat";
import { AiBrandIcon } from "./AiBrandIcon";
import { MarkdownView } from "./MarkdownView";
import { InstrumentOverlay } from "../instrument/overlay-registry";

const TerminalWorkspace = lazy(() =>
  import("./terminal/TerminalWorkspace").then((module) => ({
    default: module.TerminalWorkspace,
  })));

const PROVIDER_ORDER: AgentProvider[] = ["codex", "claude", "openrouter"];
const PROVIDER_META: Record<AgentProvider, { label: string; detail: string }> = {
  codex: { label: "Codex", detail: "ChatGPT account" },
  claude: { label: "Claude", detail: "Claude account or API key" },
  openrouter: { label: "OpenRouter", detail: "OpenRouter API key" },
};

function AgentProviderIcon({
  provider,
  size = 18,
}: {
  provider: AgentProvider;
  size?: number;
}) {
  return (
    <AiBrandIcon
      className={`agent-provider-icon is-${provider}`}
      provider={provider}
      size={size}
    />
  );
}

function useDismissableMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeAndRestore = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) closeAndRestore();
    };
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") closeAndRestore();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  return { open, setOpen, ref, trigger, close: closeAndRestore };
}

function modelLabel(chat: AgentChatController, provider: AgentProvider, model: string): string {
  return chat.providers
    .find(({ id }) => id === provider)
    ?.models.find(({ id }) => id === model)
    ?.label ?? model;
}

export function AgentChatPanel({
  chat,
  workspace,
  project,
  onClose,
}: {
  chat: AgentChatController;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  onClose(): void;
}) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const active = chat.activeChat;
  const running = chat.state.chats.find(({ id }) => id === chat.state.runningChatId) ?? null;

  useEffect(() => {
    if (!followOutput.current) return;
    const frame = requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [active.entries]);

  const submit = (): void => {
    const prompt = draft.trim();
    if (!prompt || chat.state.runningChatId !== null || !chat.connected) return;
    chat.send(prompt);
    setDraft("");
    followOutput.current = true;
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <motion.aside
      className="utility-right-panel panel-blur"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      <header className="utility-panel-header agent-chat-header">
        <AgentChatMenu chat={chat} />
        <span className="agent-header-actions">
          <button
            className="icon-button"
            type="button"
            title="New chat"
            aria-label="New chat"
            disabled={active.entries.length === 0}
            onClick={chat.newChat}
          >
            <Plus size={15} strokeWidth={1.5} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Close right panel"
            aria-label="Close right panel"
            onClick={onClose}
          >
            <PanelRightClose size={15} strokeWidth={1.5} />
          </button>
        </span>
      </header>
      {!chat.connected ? (
        <AgentConnection chat={chat} />
      ) : (
        <>
          {running && running.id !== active.id && (
            <button
              className="agent-running-chat"
              type="button"
              onClick={() => chat.selectChat(running.id)}
            >
              <LoaderCircle size={12} className="is-spinning" />
              <span>{running.title}</span>
              <small>Running</small>
            </button>
          )}
          <div
            className="agent-chat-messages"
            ref={messagesRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              followOutput.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
            }}
          >
            {active.entries.length === 0 && (
              <div className="agent-empty-chat">
                <AgentProviderIcon provider={active.provider} size={34} />
                <strong>What should we work on?</strong>
                <span>{project?.name ?? workspace?.name ?? "Ralphy library"}</span>
              </div>
            )}
            {active.entries.map((entry) => (
              <AgentEntry entry={entry} provider={active.provider} key={entry.id} />
            ))}
            {active.busy && active.entries.at(-1)?.kind !== "assistant" && (
              <div className="agent-working" aria-label={`${PROVIDER_META[active.provider].label} is working`}>
                <LoaderCircle size={13} className="is-spinning" />
                Working
              </div>
            )}
          </div>
          <div className="agent-composer">
            <textarea
              rows={2}
              value={draft}
              aria-label="Message agent"
              placeholder={project ? `Ask about ${project.name}` : "Ask Ralphy Agent"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <div className="agent-composer-toolbar">
              <span className="agent-composer-options">
                <AgentProviderMenu chat={chat} />
                <AgentModelMenu chat={chat} />
                <AgentModeMenu value={active.permissionMode} onChange={chat.setPermissionMode} />
                {active.provider === "claude" && (
                  <button
                    className="agent-auth-source"
                    type="button"
                    title={active.claudeAuthMethod === "subscription" ? "Claude subscription" : "Anthropic API key"}
                    onClick={() => {
                      const next = active.claudeAuthMethod === "subscription" ? "api-key" : "subscription";
                      const status = chat.providers.find(({ id }) => id === "claude");
                      const available = next === "subscription"
                        ? status?.accountConnected
                        : status?.apiKeyConfigured;
                      if (available) chat.setClaudeAuthMethod(next);
                    }}
                  >
                    {active.claudeAuthMethod === "subscription" ? <LogIn size={12} /> : <KeyRound size={12} />}
                  </button>
                )}
              </span>
              <button
                className={`agent-send${active.busy ? " is-stop" : ""}`}
                type="button"
                disabled={!active.busy && (!draft.trim() || chat.state.runningChatId !== null)}
                title={active.busy ? "Stop" : running ? `Waiting for ${running.title}` : "Send"}
                aria-label={active.busy ? "Stop agent" : "Send message"}
                onClick={active.busy ? chat.stop : submit}
              >
                {active.busy
                  ? <Square size={12} fill="currentColor" />
                  : <SendHorizontal size={14} />}
              </button>
            </div>
          </div>
        </>
      )}
    </motion.aside>
  );
}

function AgentChatMenu({ chat }: { chat: AgentChatController }) {
  const menu = useDismissableMenu();
  const active = chat.activeChat;
  const chats = [...chat.state.chats].sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    <div className="agent-chat-picker" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-chat-picker-trigger"
        type="button"
        aria-haspopup="menu"
        aria-label="Recent chats"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((open) => !open)}
      >
        <AgentProviderIcon provider={active.provider} size={19} />
        <span>
          <strong>{active.title}</strong>
          <small>{PROVIDER_META[active.provider].label} · {modelLabel(chat, active.provider, active.model)}</small>
        </span>
        <ChevronDown size={12} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-recent-menu" host="primitive-host" open label="Recent chats" description="Choose a recent chat" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className="agent-popover agent-chat-menu" role="menu">
          <button
            className="agent-menu-command"
            type="button"
            role="menuitem"
            onClick={() => {
              chat.newChat();
              menu.setOpen(false);
            }}
          >
            <Plus size={13} />
            New chat
          </button>
          <div className="agent-chat-list">
            {chats.map((conversation) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={conversation.id === active.id}
                className={conversation.id === active.id ? "is-selected" : ""}
                key={conversation.id}
                onClick={() => {
                  chat.selectChat(conversation.id);
                  menu.setOpen(false);
                }}
              >
                <AgentProviderIcon provider={conversation.provider} size={16} />
                <span>
                  <strong>{conversation.title}</strong>
                  <small>{PROVIDER_META[conversation.provider].label} · {modelLabel(chat, conversation.provider, conversation.model)}</small>
                </span>
                {conversation.busy
                  ? <LoaderCircle size={12} className="is-spinning" />
                  : conversation.id === active.id ? <Check size={12} /> : null}
              </button>
            ))}
          </div>
        </div>
        </InstrumentOverlay>
      )}
    </div>
  );
}

function AgentProviderMenu({
  chat,
  opensDown = false,
}: {
  chat: AgentChatController;
  opensDown?: boolean;
}) {
  const menu = useDismissableMenu();
  const active = chat.activeChat;
  return (
    <div className="agent-menu" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Provider"
        aria-label="Provider"
        onClick={() => menu.setOpen((open) => !open)}
      >
        <AgentProviderIcon provider={active.provider} size={12} />
        <span>{PROVIDER_META[active.provider].label}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-provider-menu" host="primitive-host" open label="Provider" description="Choose an agent provider" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`agent-popover agent-provider-menu${opensDown ? " opens-down" : ""}`} role="menu">
          {PROVIDER_ORDER.map((provider) => {
            const status = chat.providers.find(({ id }) => id === provider);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active.provider === provider}
                className={active.provider === provider ? "is-selected" : ""}
                key={provider}
                onClick={() => {
                  chat.setProvider(provider);
                  menu.setOpen(false);
                }}
              >
                <AgentProviderIcon provider={provider} size={15} />
                <span>
                  <strong>{PROVIDER_META[provider].label}</strong>
                  <small>{status?.detail ?? PROVIDER_META[provider].detail}</small>
                </span>
                <i className={status?.connected ? "is-connected" : ""} />
              </button>
            );
          })}
        </div>
        </InstrumentOverlay>
      )}
    </div>
  );
}

function AgentModelMenu({
  chat,
  opensDown = false,
}: {
  chat: AgentChatController;
  opensDown?: boolean;
}) {
  const menu = useDismissableMenu();
  const [query, setQuery] = useState("");
  const active = chat.activeChat;
  const provider = chat.providers.find(({ id }) => id === active.provider);
  const models = provider?.models.some(({ id }) => id === active.model)
    ? provider.models
    : [{ id: active.model, label: active.model, description: "Current model" }, ...(provider?.models ?? [])];
  const needle = query.trim().toLocaleLowerCase();
  const visible = models.filter((model) => !needle || `${model.label} ${model.id} ${model.description}`
    .toLocaleLowerCase().includes(needle)).slice(0, 80);
  return (
    <div className="agent-menu" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-menu-trigger agent-model-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Model"
        aria-label="Model"
        onClick={() => {
          setQuery("");
          menu.setOpen((open) => !open);
        }}
      >
        <span>{modelLabel(chat, active.provider, active.model)}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-model-menu" host="primitive-host" open label="Model" description="Choose an agent model" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`agent-popover agent-model-menu${opensDown ? " opens-down" : ""}`} role="menu">
          {models.length > 8 && (
            <label className="agent-model-search">
              <Search size={12} />
              <input
                autoFocus
                value={query}
                aria-label="Search models"
                placeholder="Search models"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          <div className="agent-model-list">
            {visible.map((model) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active.model === model.id}
                className={active.model === model.id ? "is-selected" : ""}
                key={model.id}
                onClick={() => {
                  chat.setModel(model.id);
                  menu.setOpen(false);
                }}
              >
                <AiBrandIcon provider={active.provider} model={model.id} size={15} />
                <span>
                  <strong>{model.label}</strong>
                  <small>{model.description}</small>
                </span>
                {active.model === model.id && <Check size={12} />}
              </button>
            ))}
            {visible.length === 0 && <span className="agent-model-empty">No matching models</span>}
          </div>
        </div>
        </InstrumentOverlay>
      )}
    </div>
  );
}

const permissionLabels: Record<AgentPermissionMode, string> = {
  auto: "Auto",
  plan: "Plan",
  full: "Full access",
};

function AgentModeMenu({
  value,
  onChange,
}: {
  value: AgentPermissionMode;
  onChange(mode: AgentPermissionMode): void;
}) {
  const menu = useDismissableMenu();
  return (
    <div className="agent-menu" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-menu-trigger agent-mode-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Agent permissions"
        aria-label="Agent permissions"
        onClick={() => menu.setOpen((open) => !open)}
      >
        <ShieldCheck size={12} />
        <span>{permissionLabels[value]}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-mode-menu" host="primitive-host" open label="Agent permissions" description="Choose agent permissions" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className="agent-popover agent-mode-menu" role="menu">
          {(["auto", "plan", "full"] as const).map((mode) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              className={value === mode ? "is-selected" : ""}
              key={mode}
              onClick={() => {
                onChange(mode);
                menu.setOpen(false);
              }}
            >
              <span>{permissionLabels[mode]}</span>
              {value === mode && <Check size={12} />}
            </button>
          ))}
        </div>
        </InstrumentOverlay>
      )}
    </div>
  );
}

function AgentConnection({ chat }: { chat: AgentChatController }) {
  const active = chat.activeChat;
  const status = chat.providers.find(({ id }) => id === active.provider);
  const meta = PROVIDER_META[active.provider];

  return (
    <div className="agent-connect">
      <AgentProviderIcon provider={active.provider} size={46} />
      <h2>Connect {meta.label}</h2>
      <p>{status?.detail ?? meta.detail}</p>
      <div className="agent-connect-pickers">
        <AgentProviderMenu chat={chat} opensDown />
        <AgentModelMenu chat={chat} opensDown />
      </div>
      {chat.providersLoading && !status ? (
        <div className="agent-connect-loading">
          <LoaderCircle size={16} className="is-spinning" />
          Checking provider
        </div>
      ) : active.provider === "claude" ? (
        <ClaudeConnectionControls chat={chat} status={status} />
      ) : active.provider === "codex" ? (
        <button
          className="agent-connect-primary"
          type="button"
          disabled={!status?.binaryReady || chat.authAction !== null}
          onClick={() => void chat.login("codex")}
        >
          {chat.authAction === "codex" ? <LoaderCircle size={14} className="is-spinning" /> : <LogIn size={14} />}
          {status?.binaryReady ? "Sign in to Codex" : "Codex CLI not found"}
        </button>
      ) : (
        <AgentApiKeyControls chat={chat} provider="openrouter" status={status} />
      )}
      {chat.connectionError && (
        <div className="agent-connect-error" role="alert">
          <CircleAlert size={13} />
          <span>{chat.connectionError}</span>
        </div>
      )}
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
      <div className="agent-auth-tabs" role="group" aria-label="Claude authentication">
        <button
          type="button"
          className={method === "subscription" ? "is-active" : ""}
          aria-pressed={method === "subscription"}
          onClick={() => chat.setClaudeAuthMethod("subscription")}
        >
          Claude account
        </button>
        <button
          type="button"
          className={method === "api-key" ? "is-active" : ""}
          aria-pressed={method === "api-key"}
          onClick={() => chat.setClaudeAuthMethod("api-key")}
        >
          API key
        </button>
      </div>
      {method === "subscription" ? (
        <button
          className="agent-connect-primary"
          type="button"
          disabled={!status?.binaryReady || chat.authAction !== null}
          onClick={() => void chat.login("claude")}
        >
          {chat.authAction === "claude" ? <LoaderCircle size={14} className="is-spinning" /> : <LogIn size={14} />}
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
      <div className="agent-key-ready">
        <Check size={14} />
        <span>{PROVIDER_META[provider].label} API key is ready</span>
        {!status.inheritedApiKey && (
          <button type="button" onClick={() => void chat.clearApiKey(provider)}>Forget</button>
        )}
      </div>
    );
  }
  return (
    <form className="agent-key-form" onSubmit={submit}>
      <label>
        <KeyRound size={13} />
        <input
          type="password"
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${PROVIDER_META[provider].label} API key`}
          placeholder={provider === "claude" ? "sk-ant-..." : "sk-or-v1-..."}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!apiKey.trim() || chat.authAction !== null}>
        {chat.authAction === provider
          ? <LoaderCircle size={14} className="is-spinning" />
          : <SendHorizontal size={14} />}
      </button>
    </form>
  );
}

function AgentEntry({
  entry,
  provider,
}: {
  entry: AgentChatEntry;
  provider: AgentProvider;
}) {
  if (entry.kind === "tool" && entry.tool) {
    const Icon = entry.tool.status === "running"
      ? LoaderCircle
      : entry.tool.status === "complete" ? Check : X;
    return (
      <div className={`agent-tool-row is-${entry.tool.status}`}>
        <Icon size={13} className={entry.tool.status === "running" ? "is-spinning" : ""} />
        <Wrench size={12} />
        <strong>{entry.tool.name}</strong>
        {entry.tool.summary && <code title={entry.tool.summary}>{entry.tool.summary}</code>}
      </div>
    );
  }
  if (entry.kind === "user") {
    return <div className="agent-message is-user"><p>{entry.text}</p></div>;
  }
  if (entry.kind === "error") {
    return (
      <div className="agent-message is-error" role="alert">
        <CircleAlert size={14} />
        <p>{entry.text}</p>
      </div>
    );
  }
  return (
    <div className="agent-message is-assistant">
      <AgentProviderIcon provider={provider} size={20} />
      <MarkdownView markdown={entry.text ?? ""} />
    </div>
  );
}

export function BottomPanel({
  height,
  visible,
  rootPath,
}: {
  height: number;
  visible: boolean;
  rootPath: string | null;
}) {
  const [terminalActivated, setTerminalActivated] = useState(visible);
  useEffect(() => {
    if (visible) setTerminalActivated(true);
  }, [visible]);
  return (
    <motion.section
      className={`bottom-panel${visible ? " is-visible" : ""}`}
      initial={false}
      animate={{ height: visible ? height : 0, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}
      aria-hidden={!visible}
    >
      {terminalActivated && (
        <Suspense
          fallback={<div className="terminal-loading">Starting terminal...</div>}
        >
          <TerminalWorkspace visible={visible} rootPath={rootPath} />
        </Suspense>
      )}
    </motion.section>
  );
}
