import {
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

const PROVIDER_ORDER: AgentProvider[] = ["codex", "claude", "openrouter"];
const PROVIDER_META: Record<AgentProvider, { label: string; detail: string }> = {
  codex: { label: "Codex", detail: "ChatGPT account" },
  claude: { label: "Claude", detail: "Claude account or API key" },
  openrouter: { label: "OpenRouter", detail: "OpenRouter API key" },
};

/* The rail is a black widget in both themes and it renders outside `.app-mode-work`, so every
   ink below is the on-dark family and every surface is theme-invariant. Two shapes recur often
   enough to be named once; both carry geometry, behaviour and -- where a state changes the
   plate -- the ink that plate needs, because a surface change without its ink is the defect
   this migration keeps finding. Position is never in a shared base: each menu states its own
   box, so no element ever ends up with two utilities for `left`. */
const POPOVER = "agent-popover absolute z-agent-popover rounded-menu bg-instrument p-1.5 text-on-instrument-muted [corner-shape:squircle]";
const MENU_ROW = "flex w-full min-w-0 items-center rounded-control bg-transparent text-left hover:bg-ghost-hover hover:text-on-instrument aria-checked:bg-ghost-hover aria-checked:text-on-instrument";
/* A pill in the composer toolbar, and the same shape reused as the connect flow's auth toggle. */
const MENU_TRIGGER = "inline-flex h-control-sm min-w-0 items-center gap-1.25 rounded-control px-1.75 type-xs";
const MENU_TRIGGER_GHOST = `${MENU_TRIGGER} bg-transparent text-on-instrument-muted hover:bg-ghost-hover hover:text-on-instrument aria-expanded:bg-ghost-hover aria-expanded:text-on-instrument`;
/* The copy column of a two-line menu row, and its two lines. */
const ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.5";
/* A primary action on the rail is the inversion of the rail. Disabled drops to a ghost pair. */
const PRIMARY = "bg-on-instrument text-instrument disabled:bg-ghost-hover disabled:text-on-instrument-muted";
/* Every connect control shares one column measure. */
const CONNECT_COLUMN = "w-full max-w-agent-connect-column";
/* A field well on the rail, with the ring a black widget needs: `--control-focus` would be the
   theme ink, which is black on black in the light theme. */
const FIELD_RING = "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-on-instrument";
const FIELD_INPUT = "min-w-0 flex-1 border-0 bg-transparent text-on-instrument outline-0";
const SPINNER = "is-spinning animate-spinner motion-reduce:animate-none";
/* The rail header's two glyph controls. They used to be a bare `.icon-button`, whose surface and
   ink came from the legacy `--fg-2` / `--hover` pair in 01-unowned.css; the rail is a black
   widget in both themes, so the on-dark pair is stated here instead. */
const HEADER_GLYPH = "icon-button inline-grid size-7 flex-none place-items-center rounded-control p-0 text-on-instrument-muted hover:bg-ghost-hover hover:text-on-instrument disabled:text-on-instrument-muted-decorative";

function AgentProviderIcon({
  provider,
  size = 18,
  className = "",
}: {
  provider: AgentProvider;
  size?: number;
  className?: string;
}) {
  return (
    <AiBrandIcon
      className={`agent-provider-icon is-${provider} shrink-0 ${className}`}
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

/* Where a provider or model menu is mounted. In the composer toolbar it opens upward from a
   ghost pill; in the connect flow it opens downward from a filled pill that fills half of a
   two-up well. The two skins differ in surface *and* ink, so they travel as one switch rather
   than as a caller override on a shared base. */
type MenuLayout = "toolbar" | "pickers";

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

  const stopping = active.busy;

  return (
    <motion.aside
      /* Chat is a widget on the desk: one flat #141414 plate, R24, no border. tokens.css keys
         the squircle on this class, and `--blur` is `none`, so `.panel-blur` adds nothing. */
      className="utility-right-panel panel-blur flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel bg-instrument text-on-instrument"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      <header className="utility-panel-header agent-chat-header relative z-sticky flex h-agent-header flex-none items-center justify-between pr-2.5 pl-2 text-on-instrument-muted">
        <AgentChatMenu chat={chat} />
        <span className="agent-header-actions flex items-center gap-0.5">
          <button
            className={HEADER_GLYPH}
            type="button"
            title="New chat"
            aria-label="New chat"
            disabled={active.entries.length === 0}
            onClick={chat.newChat}
          >
            <Plus size={15} strokeWidth={1.5} />
          </button>
          <button
            className={HEADER_GLYPH}
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
              className="agent-running-chat mx-3 flex h-control-md flex-none items-center gap-1.75 rounded-control bg-instrument-sunken px-3.5 type-xs text-on-instrument-muted hover:text-on-instrument"
              type="button"
              onClick={() => chat.selectChat(running.id)}
            >
              <LoaderCircle size={12} className={SPINNER} />
              <span className="min-w-0 flex-1 truncate text-left">{running.title}</span>
              <small className="text-on-instrument">Running</small>
            </button>
          )}
          <div
            className="agent-chat-messages flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pt-4 pb-5.5"
            ref={messagesRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              followOutput.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
            }}
          >
            {active.entries.length === 0 && (
              <div className="agent-empty-chat flex min-h-agent-empty flex-1 flex-col items-center justify-center gap-1.75 p-6 text-center text-on-instrument-muted">
                <AgentProviderIcon provider={active.provider} size={34} className="mb-1.75 opacity-70" />
                <strong className="type-lg text-on-instrument">What should we work on?</strong>
                <span className="max-w-agent-empty-copy type-sm leading-row">{project?.name ?? workspace?.name ?? "Ralphy library"}</span>
              </div>
            )}
            {active.entries.map((entry) => (
              <AgentEntry entry={entry} provider={active.provider} key={entry.id} />
            ))}
            {active.busy && active.entries.at(-1)?.kind !== "assistant" && (
              <div className="agent-working flex min-w-0 items-center gap-1.75 pl-agent-tool-indent type-sm text-on-instrument-muted" aria-label={`${PROVIDER_META[active.provider].label} is working`}>
                <LoaderCircle size={13} className={`${SPINNER} flex-none`} />
                Working
              </div>
            )}
          </div>
          <div className={`agent-composer relative mx-3 mb-3 flex-none rounded-composer bg-ghost p-2 ${FIELD_RING}`}>
            <textarea
              className="block min-h-14.5 w-full resize-none bg-transparent p-1 text-on-instrument outline-0 placeholder:text-on-instrument-muted"
              rows={2}
              value={draft}
              aria-label="Message agent"
              placeholder={project ? `Ask about ${project.name}` : "Ask Ralphy Agent"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <div className="agent-composer-toolbar flex items-center justify-between gap-2 pt-1">
              <span className="agent-composer-options flex min-w-0 items-center gap-0.75">
                <AgentProviderMenu chat={chat} />
                <AgentModelMenu chat={chat} />
                <AgentModeMenu value={active.permissionMode} onChange={chat.setPermissionMode} />
                {active.provider === "claude" && (
                  <button
                    className={`agent-auth-source ${MENU_TRIGGER_GHOST}`}
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
              {/* Send is the inversion of the rail; Stop is a ghost that keeps primary ink, because
                  the one control that halts a run has to stay legible. */}
              <button
                className={`agent-send grid size-7 flex-none place-items-center rounded-full ${stopping ? "is-stop bg-ghost-hover text-on-instrument" : PRIMARY}`}
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
    <div className="agent-chat-picker relative min-w-0 flex-1" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-chat-picker-trigger flex h-10 w-full min-w-0 items-center gap-2.25 rounded-control bg-transparent px-2 text-left hover:bg-ghost-hover aria-expanded:bg-ghost-hover"
        type="button"
        aria-haspopup="menu"
        aria-label="Recent chats"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((open) => !open)}
      >
        <AgentProviderIcon provider={active.provider} size={19} />
        <span className={ROW_COPY}>
          <strong className="truncate type-base text-on-instrument">{active.title}</strong>
          <small className="truncate type-xs text-on-instrument-muted">{PROVIDER_META[active.provider].label} · {modelLabel(chat, active.provider, active.model)}</small>
        </span>
        <ChevronDown size={12} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-recent-menu" host="primitive-host" open label="Recent chats" description="Choose a recent chat" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-chat-menu top-11 left-0 w-agent-chat-menu max-w-(--agent-chat-menu-fit)`} role="menu">
          <button
            className={`agent-menu-command ${MENU_ROW} h-control-md gap-2.25 px-2.25 type-sm`}
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
          <div className="agent-chat-list max-h-agent-menu-list overflow-y-auto">
            {chats.map((conversation) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={conversation.id === active.id}
                className={`${MENU_ROW} min-h-10.75 gap-2.25 px-2 py-1.25 ${conversation.id === active.id ? "is-selected" : ""}`}
                key={conversation.id}
                onClick={() => {
                  chat.selectChat(conversation.id);
                  menu.setOpen(false);
                }}
              >
                <AgentProviderIcon provider={conversation.provider} size={16} />
                <span className={ROW_COPY}>
                  <strong className="truncate type-sm">{conversation.title}</strong>
                  <small className="truncate type-xs">{PROVIDER_META[conversation.provider].label} · {modelLabel(chat, conversation.provider, conversation.model)}</small>
                </span>
                {conversation.busy
                  ? <LoaderCircle size={12} className={SPINNER} />
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
  layout = "toolbar",
}: {
  chat: AgentChatController;
  layout?: MenuLayout;
}) {
  const menu = useDismissableMenu();
  const active = chat.activeChat;
  const pickers = layout === "pickers";
  return (
    <div className={`agent-menu relative min-w-0 ${pickers ? "flex-1" : ""}`} ref={menu.ref}>
      <button
        ref={menu.trigger}
        className={pickers
          ? `agent-menu-trigger ${MENU_TRIGGER} w-full justify-center bg-track-on-instrument text-on-instrument`
          : `agent-menu-trigger ${MENU_TRIGGER_GHOST}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Provider"
        aria-label="Provider"
        onClick={() => menu.setOpen((open) => !open)}
      >
        <AgentProviderIcon provider={active.provider} size={12} />
        <span className="truncate">{PROVIDER_META[active.provider].label}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-provider-menu" host="primitive-host" open label="Provider" description="Choose an agent provider" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-provider-menu left-0 w-agent-provider-menu ${pickers ? "top-8" : "bottom-8"}`} role="menu">
          {PROVIDER_ORDER.map((provider) => {
            const status = chat.providers.find(({ id }) => id === provider);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active.provider === provider}
                className={`${MENU_ROW} min-h-10.5 gap-2 px-2 py-1.25 ${active.provider === provider ? "is-selected" : ""}`}
                key={provider}
                onClick={() => {
                  chat.setProvider(provider);
                  menu.setOpen(false);
                }}
              >
                <AgentProviderIcon provider={provider} size={15} />
                <span className={ROW_COPY}>
                  <strong className="truncate type-sm">{PROVIDER_META[provider].label}</strong>
                  <small className="truncate type-xs">{status?.detail ?? PROVIDER_META[provider].detail}</small>
                </span>
                {/* A connection dot carries no text, so it takes the decorative ink step: at the
                    readable step the two states were #A4A4A0 against #F2F2F0 and indistinguishable. */}
                <i className={`size-1.25 flex-none rounded-full ${status?.connected ? "bg-on-instrument is-connected" : "bg-on-instrument-muted-decorative"}`} />
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
  layout = "toolbar",
}: {
  chat: AgentChatController;
  layout?: MenuLayout;
}) {
  const menu = useDismissableMenu();
  const [query, setQuery] = useState("");
  const active = chat.activeChat;
  const pickers = layout === "pickers";
  const provider = chat.providers.find(({ id }) => id === active.provider);
  const models = provider?.models.some(({ id }) => id === active.model)
    ? provider.models
    : [{ id: active.model, label: active.model, description: "Current model" }, ...(provider?.models ?? [])];
  const needle = query.trim().toLocaleLowerCase();
  const visible = models.filter((model) => !needle || `${model.label} ${model.id} ${model.description}`
    .toLocaleLowerCase().includes(needle)).slice(0, 80);
  return (
    <div className={`agent-menu relative min-w-0 ${pickers ? "flex-1" : ""}`} ref={menu.ref}>
      <button
        ref={menu.trigger}
        className={pickers
          ? `agent-menu-trigger agent-model-trigger ${MENU_TRIGGER} w-full justify-center bg-track-on-instrument text-on-instrument`
          : `agent-menu-trigger agent-model-trigger ${MENU_TRIGGER_GHOST} max-w-agent-model-trigger`}
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
        <span className="truncate">{modelLabel(chat, active.provider, active.model)}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-model-menu" host="primitive-host" open label="Model" description="Choose an agent model" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-model-menu w-agent-model-menu max-w-(--agent-model-menu-fit) ${pickers ? "top-8 right-0" : "bottom-8 -left-19"}`} role="menu">
          {models.length > 8 && (
            <label className={`agent-model-search flex h-control-md items-center gap-1.75 mb-0.75 rounded-control bg-ghost px-2 text-on-instrument-muted ${FIELD_RING}`}>
              <Search size={12} />
              <input
                className={`${FIELD_INPUT} type-sm`}
                autoFocus
                value={query}
                aria-label="Search models"
                placeholder="Search models"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          <div className="agent-model-list max-h-agent-menu-list overflow-y-auto">
            {visible.map((model) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active.model === model.id}
                className={`${MENU_ROW} min-h-10 gap-2 px-2 py-1.25 ${active.model === model.id ? "is-selected" : ""}`}
                key={model.id}
                onClick={() => {
                  chat.setModel(model.id);
                  menu.setOpen(false);
                }}
              >
                <AiBrandIcon className="shrink-0 opacity-85" provider={active.provider} model={model.id} size={15} />
                <span className={ROW_COPY}>
                  <strong className="truncate type-sm">{model.label}</strong>
                  <small className="truncate type-xs">{model.description}</small>
                </span>
                {active.model === model.id && <Check size={12} />}
              </button>
            ))}
            {visible.length === 0 && <span className="agent-model-empty block px-2 py-3 type-sm text-center">No matching models</span>}
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
    <div className="agent-menu relative min-w-0" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className={`agent-menu-trigger agent-mode-trigger ${MENU_TRIGGER_GHOST}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Agent permissions"
        aria-label="Agent permissions"
        onClick={() => menu.setOpen((open) => !open)}
      >
        <ShieldCheck size={12} />
        <span className="truncate">{permissionLabels[value]}</span>
        <ChevronDown size={10} />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-mode-menu" host="primitive-host" open label="Agent permissions" description="Choose agent permissions" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-mode-menu bottom-8 right-0 w-agent-mode-menu`} role="menu">
          {(["auto", "plan", "full"] as const).map((mode) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              className={`${MENU_ROW} h-7 justify-between gap-2 px-2 type-sm ${value === mode ? "is-selected" : ""}`}
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
    <div className="agent-connect flex min-h-0 flex-1 flex-col items-center justify-center px-5.5 py-7 text-center">
      <AgentProviderIcon provider={active.provider} size={46} className="mb-4" />
      <h2 className="type-xl text-on-instrument">Connect {meta.label}</h2>
      <p className="mt-1.75 max-w-agent-connect-copy type-sm leading-row text-on-instrument-muted">{status?.detail ?? meta.detail}</p>
      <div className={`agent-connect-pickers ${CONNECT_COLUMN} mt-5 mb-2.5 flex items-center justify-center gap-0.75 rounded-control bg-ghost p-0.75`}>
        <AgentProviderMenu chat={chat} layout="pickers" />
        <AgentModelMenu chat={chat} layout="pickers" />
      </div>
      {chat.providersLoading && !status ? (
        <div className="agent-connect-loading flex min-h-8.5 items-center gap-2.25 type-sm text-on-instrument-muted">
          <LoaderCircle size={16} className={SPINNER} />
          Checking provider
        </div>
      ) : active.provider === "claude" ? (
        <ClaudeConnectionControls chat={chat} status={status} />
      ) : active.provider === "codex" ? (
        <button
          className={`agent-connect-primary ${CONNECT_COLUMN} flex h-control-lg items-center justify-center gap-1.75 rounded-control type-sm ${PRIMARY}`}
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
      {chat.connectionError && (
        <div className={`agent-connect-error ${CONNECT_COLUMN} mt-3 flex items-start gap-1.75 type-xs leading-row text-left text-alert-bright`} role="alert">
          <CircleAlert size={13} className="mt-px flex-none" />
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
      <div className={`agent-auth-tabs ${CONNECT_COLUMN} mb-2.5 grid grid-cols-2 gap-0.75 rounded-control bg-ghost p-0.75`} role="group" aria-label="Claude authentication">
        <button
          type="button"
          className={`h-control-md rounded-control bg-transparent type-sm text-on-instrument-muted hover:text-on-instrument aria-pressed:bg-track-on-instrument aria-pressed:text-on-instrument ${method === "subscription" ? "is-active" : ""}`}
          aria-pressed={method === "subscription"}
          onClick={() => chat.setClaudeAuthMethod("subscription")}
        >
          Claude account
        </button>
        <button
          type="button"
          className={`h-control-md rounded-control bg-transparent type-sm text-on-instrument-muted hover:text-on-instrument aria-pressed:bg-track-on-instrument aria-pressed:text-on-instrument ${method === "api-key" ? "is-active" : ""}`}
          aria-pressed={method === "api-key"}
          onClick={() => chat.setClaudeAuthMethod("api-key")}
        >
          API key
        </button>
      </div>
      {method === "subscription" ? (
        <button
          className={`agent-connect-primary ${CONNECT_COLUMN} flex h-control-lg items-center justify-center gap-1.75 rounded-control type-sm ${PRIMARY}`}
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
      <div className={`agent-key-ready ${CONNECT_COLUMN} flex min-h-8.5 items-center gap-1.75 type-sm text-left text-on-instrument`}>
        <Check size={14} />
        <span className="min-w-0 flex-1 text-on-instrument-muted">{PROVIDER_META[provider].label} API key is ready</span>
        {!status.inheritedApiKey && (
          <button className="bg-transparent type-xs text-on-instrument-muted hover:text-on-instrument" type="button" onClick={() => void chat.clearApiKey(provider)}>Forget</button>
        )}
      </div>
    );
  }
  return (
    <form className={`agent-key-form ${CONNECT_COLUMN} flex items-center gap-1`} onSubmit={submit}>
      <label className={`flex h-control-lg min-w-0 flex-1 items-center gap-1.75 rounded-control bg-ghost px-2.25 text-on-instrument-muted ${FIELD_RING}`}>
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
      <button className={`grid size-8.5 flex-none place-items-center rounded-full ${PRIMARY}`} type="submit" disabled={!apiKey.trim() || chat.authAction !== null}>
        {chat.authAction === provider
          ? <LoaderCircle size={14} className={SPINNER} />
          : <SendHorizontal size={14} />}
      </button>
    </form>
  );
}

/* A tool line's status glyph: complete is primary ink, running drops to the muted step, failed
   is the one place the rail uses the alarm hue. */
const TOOL_STATUS: Record<string, string> = {
  complete: "text-on-instrument",
  running: "text-on-instrument-muted",
  failed: "text-alert-bright",
};

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
    const statusInk = TOOL_STATUS[entry.tool.status] ?? "text-on-instrument";
    const statusSpin = entry.tool.status === "running" ? SPINNER : "";
    return (
      <div className={`agent-tool-row is-${entry.tool.status} flex min-w-0 items-center gap-1.75 pl-agent-tool-indent type-sm text-on-instrument-muted`}>
        <Icon size={13} className={`flex-none ${statusInk} ${statusSpin}`} />
        <Wrench size={12} className="flex-none" />
        <strong>{entry.tool.name}</strong>
        {entry.tool.summary && <code className="min-w-0 truncate font-code type-xs" title={entry.tool.summary}>{entry.tool.summary}</code>}
      </div>
    );
  }
  if (entry.kind === "user") {
    return <div className="agent-message is-user block max-w-(--agent-bubble-measure) self-end rounded-cell bg-ghost-hover px-2.75 py-2.25 text-on-instrument"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p></div>;
  }
  if (entry.kind === "error") {
    return (
      <div className="agent-message is-error flex items-start gap-2 text-alert-bright" role="alert">
        <CircleAlert size={14} className="mt-0.5 flex-none" />
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p>
      </div>
    );
  }
  return (
    <div className="agent-message is-assistant grid grid-cols-(--agent-message-columns) items-start gap-2.25">
      <AgentProviderIcon provider={provider} size={20} />
      {/* The chat rail is a black widget, so the rendered document takes the on-dark pair. */}
      <MarkdownView markdown={entry.text ?? ""} tone="instrument" />
    </div>
  );
}
