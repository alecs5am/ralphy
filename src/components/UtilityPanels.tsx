import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  Image,
  KeyRound,
  ListChecks,
  LoaderCircle,
  LogIn,
  PanelRightClose,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import type {
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  ProjectSummary,
  WorkspaceSummary,
} from "../lib/ipc";
import type { AgentChatController } from "../chat/useAgentChat";
import { AgentFailure, AgentThread } from "./agent/AgentThread";
import { AgentMark } from "./ui/AgentMark";
import { AiBrandIcon } from "./AiBrandIcon";
import { InstrumentOverlay } from "../instrument/overlay-registry";

/**
 * Handoff 17's chat panel. The chat is a light surface by design -- a card inside the zone's
 * frame -- so nothing here paints the on-dark pair except the two things that stay inverted: the
 * operator's own bubble and a primary pill.
 *
 * The composer carries what the app can actually promise: permission mode, the model across every
 * connected provider, and send or stop. Three of the handoff's controls are not here because
 * nothing behind them exists yet -- the `@` entity picker (a tag serialises to `@kind:id`, and no
 * harness resolves one), the live context meter (no provider reports context used), and dictate.
 */

const PROVIDER_ORDER: AgentProvider[] = ["codex", "claude", "openrouter"];
const PROVIDER_META: Record<AgentProvider, { label: string; detail: string; account: string }> = {
  codex: { label: "Codex", detail: "ChatGPT account", account: "LOCAL HARNESS" },
  claude: { label: "Claude", detail: "Claude account or API key", account: "LOCAL HARNESS" },
  openrouter: { label: "OpenRouter", detail: "OpenRouter API key", account: "API KEY" },
};

/* The four cards an empty chat offers. They fill the composer rather than sending: a card is a
   starting point, and an operator gets to read a prompt before it leaves. */
const OPENERS = [
  { icon: Image, label: "Generate covers for a unit", prompt: "Generate cover options for a unit in this workspace." },
  { icon: ListChecks, label: "Work through the review queue", prompt: "Walk me through the review queue and what needs a decision." },
  { icon: Calendar, label: "Plan what ships this week", prompt: "Plan what should ship this week." },
  { icon: Search, label: "Find an asset in the library", prompt: "Find an asset in the library: " },
] as const;

/* A popover over the chat: a card one radius step tighter than the zone, with 6 of air. */
const POPOVER = "agent-popover absolute z-agent-popover rounded-menu bg-card p-1.5 text-secondary [corner-shape:squircle]";
const MENU_ROW = "flex w-full min-w-0 items-center rounded-tab bg-transparent text-left hover:bg-row-hover hover:text-ink aria-checked:bg-row-hover aria-checked:text-ink";
/* The composer's pills, and every other control the design draws as one: h26, a stadium on the
   chip step, one surface louder on hover. */
const PILL = "inline-flex h-6.5 min-w-0 flex-none items-center gap-1.75 rounded-full px-2.5 type-label";
const PILL_QUIET = `${PILL} bg-chat-control text-ink hover:bg-chat-control-hover aria-expanded:bg-chat-control-hover`;
/* A primary action anywhere in the chat is the inversion of the card. */
const PRIMARY = "bg-desk-primary text-desk-primary-ink hover:bg-instrument-hover";
/* The copy column of a two-line menu row. */
const ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.5";
/* A field well on the card, with the theme's own focus ring. */
const FIELD_RING = "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ink";
const FIELD_INPUT = "min-w-0 flex-1 border-0 bg-transparent text-ink outline-0";
const SPINNER = "is-spinning animate-spinner motion-reduce:animate-none";
/* The chrome's instruments stand on the zone's panel, not on the widget inside it, so their ink and
   their hover step off the panel: 24 circles, muted until hovered. A hover always steps off its own
   surface -- the same glyph inside the card would take the card's hover instead. */
const HEADER_GLYPH = "icon-button inline-grid size-6 flex-none place-items-center rounded-control p-0 text-muted hover:bg-chip hover:text-ink disabled:text-muted-decorative";
/* A mono meta run: a counter, a scope, an account line. */
/* A mono meta run: a counter, a scope, an account line. The design's muted grey is #9A9A96, which
   measures 2.6:1 on the card -- fine for a dot, not for a 9px run of text. Informational meta takes
   the secondary step, the same place in the hierarchy, and passes at 5:1 in both themes. */
const META = "font-code type-mono-xs tracking-mono text-secondary";

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

export function AgentChatPanel({
  chat,
  workspace,
  project,
  onClose,
  onOpenSettings,
}: {
  chat: AgentChatController;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  onClose(): void;
  onOpenSettings(): void;
}) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
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

  /* Fill the composer and put the caret at the end: what "edit & resend" and an opener card both
     do, and the one place this panel moves focus on the operator's behalf. */
  const fillComposer = (text: string): void => {
    setDraft(text);
    requestAnimationFrame(() => {
      const node = composerRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(text.length, text.length);
    });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
    /* ESC while the field has focus stops the run. It is the only escape this composer owns --
       there is no `@` menu above it to close first. */
    if (event.key === "Escape" && active.busy) {
      event.preventDefault();
      chat.stop();
    }
  };

  /* The line the agent is on: the newest tool call while one is running, otherwise the plain fact
     that it is working. Nothing here is invented -- a harness that reports no tool reports none. */
  const streamingTool = active.busy
    ? [...active.entries].reverse().find(({ kind }) => kind === "tool") ?? null
    : null;

  return (
    <motion.aside
      /* Chrome around a card, the same two layers the view panel and the sidebar stand on: a 2px
         run of panel around a widget one radius step in. tokens.css keys the squircle on this
         class, and `--blur` is `none`, so `.panel-blur` adds nothing. */
      className="utility-right-panel panel-blur flex min-h-0 min-w-0 flex-col overflow-hidden rounded-window bg-panel p-0.5 text-ink"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      {/* Handoff 16: the chat's header is the zone's chrome, standing in the frame above the card
          rather than buried inside it -- the same row the view panel's tab strip occupies, at the
          same 34. It reads provenance and holds instruments; it never switches content, which is
          why the chat has no tabs. Its ink follows the panel it stands on, not the card below. */}
      <header className="utility-panel-header agent-chat-header relative z-sticky flex h-8.5 flex-none items-center justify-between pr-2 pl-2.5 text-ink [-webkit-app-region:drag] [&_button]:[-webkit-app-region:no-drag]">
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

      <div className="utility-right-panel-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-frame bg-card">
      {!chat.connected ? (
        <AgentConnection chat={chat} />
      ) : (
        <>
          {running && running.id !== active.id && (
            <button
              className="agent-running-chat mx-3 mt-2 flex h-control-md flex-none items-center gap-1.75 rounded-full bg-chat-field px-3.5 type-xs text-secondary hover:text-ink"
              type="button"
              onClick={() => chat.selectChat(running.id)}
            >
              <AgentMark mode="working" size={13} className="text-ink" />
              <span className="min-w-0 flex-1 truncate text-left">{running.title}</span>
              <small className="text-ink">Running</small>
            </button>
          )}
          <div
            className="agent-chat-messages flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-4"
            ref={messagesRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              followOutput.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
            }}
          >
            {active.entries.length === 0
              ? <AgentEmptyChat
                chat={chat}
                workspace={workspace}
                project={project}
                onOpener={fillComposer}
              />
              : <AgentThread
                entries={active.entries}
                busy={active.busy}
                streamingTool={streamingTool}
                onEdit={fillComposer}
                onRerun={(text) => {
                  chat.send(text);
                  followOutput.current = true;
                }}
              />}
          </div>
          {/* The composer is a field on the card: one step off it, at the card's own radius, with
              the field above and the instruments below. */}
          <div className={`agent-composer relative mx-3 mb-3 flex flex-none flex-col gap-2.25 rounded-composer bg-chat-field p-2.75 ${FIELD_RING}`}>
            <textarea
              ref={composerRef}
              className="block min-h-11 w-full resize-none bg-transparent px-0.5 type-body leading-loose text-ink outline-0 placeholder:text-muted-decorative"
              rows={2}
              value={draft}
              aria-label="Message agent"
              placeholder={project ? `Ask about ${project.name}` : "Ask anything"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <div className="agent-composer-toolbar flex items-center gap-1.5">
              <AgentModeMenu value={active.permissionMode} onChange={chat.setPermissionMode} />
              <span className="min-w-0 flex-1" aria-hidden="true" />
              {active.provider === "claude" && <AgentAuthSource chat={chat} />}
              <AgentModelMenu chat={chat} onOpenSettings={onOpenSettings} />
              {active.busy
                ? <button
                  /* Stop is the one control that halts a run, so it is a pill with a word on it
                     rather than a glyph: the mark at work, the verb, and the square. */
                  className={`agent-stop inline-flex h-7 flex-none items-center gap-1.75 rounded-full pr-1 pl-2.5 type-sm ${PRIMARY}`}
                  type="button"
                  title="Stop (ESC)"
                  aria-label="Stop agent"
                  onClick={chat.stop}
                >
                  <AgentMark mode="working" size={14} />
                  Stop
                  <span className="grid size-5 flex-none place-items-center rounded-full bg-desk-primary-ink/16">
                    <i className="size-1.75 rounded-dot bg-desk-primary-ink" />
                  </span>
                </button>
                : <button
                  className={`agent-send grid size-7 flex-none place-items-center rounded-full ${draft.trim() && chat.state.runningChatId === null ? PRIMARY : "bg-chat-control text-muted-decorative"}`}
                  type="button"
                  disabled={!draft.trim() || chat.state.runningChatId !== null}
                  title={running ? `Waiting for ${running.title}` : "Send (↩)"}
                  aria-label="Send message"
                  onClick={submit}
                >
                  <ArrowUp size={13} strokeWidth={2} />
                </button>}
            </div>
          </div>
        </>
      )}
      </div>
    </motion.aside>
  );
}

/* An empty chat: the mark at rest, the question with the workspace in it, and four openers. The
   footer states the provenance a run would use, which is the one thing an empty chat knows. */
function AgentEmptyChat({
  chat,
  workspace,
  project,
  onOpener,
}: {
  chat: AgentChatController;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  onOpener(prompt: string): void;
}) {
  const active = chat.activeChat;
  const place = project?.name ?? workspace?.name ?? null;
  /* The block keeps its own measure however wide the zone is: with the view panel closed the chat
     takes the window, and four opener cards stretched across it stop being cards. */
  return <div className="agent-empty-chat mx-auto flex min-h-agent-empty w-full max-w-agent-empty-block flex-1 flex-col items-center justify-center gap-4 text-center">
    <span className="grid size-13 flex-none place-items-center rounded-full bg-chat-field">
      <AgentMark mode="idle" size={32} className="text-ink" />
    </span>
    <strong className="type-heading font-normal text-ink">
      {place
        ? <>What should we work on in <span className="underline decoration-unreviewed decoration-1 underline-offset-4">{place}</span>?</>
        : "What should we work on?"}
    </strong>
    <div className="agent-openers grid w-full grid-cols-2 gap-2">
      {OPENERS.map(({ icon: Icon, label, prompt }) => <button
        className="flex flex-col gap-3 rounded-lg bg-chat-field p-3 text-left hover:bg-chat-control"
        type="button"
        key={label}
        onClick={() => onOpener(prompt)}
      >
        <Icon size={16} strokeWidth={1.8} className="text-ink" aria-hidden="true" />
        <span className="type-ui leading-row text-ink">{label}</span>
      </button>)}
    </div>
    <small className={META}>
      {PROVIDER_META[active.provider].label.toLocaleUpperCase()} · {modelLabel(chat, active.provider, active.model).toLocaleUpperCase()}
    </small>
  </div>;
}

/* Claude is the one provider with two ways in, and once it is connected both ways the choice has
   nowhere else to live: the connect dialog only shows while nothing is connected. */
function AgentAuthSource({ chat }: { chat: AgentChatController }) {
  const active = chat.activeChat;
  const status = chat.providers.find(({ id }) => id === "claude");
  const subscription = active.claudeAuthMethod === "subscription";
  return <button
    className="agent-auth-source grid size-6.5 flex-none place-items-center rounded-full bg-chat-control text-secondary hover:bg-chat-control-hover hover:text-ink"
    type="button"
    title={subscription ? "Claude subscription" : "Anthropic API key"}
    aria-label={subscription ? "Claude subscription" : "Anthropic API key"}
    onClick={() => {
      const next = subscription ? "api-key" : "subscription";
      const available = next === "subscription" ? status?.accountConnected : status?.apiKeyConfigured;
      if (available) chat.setClaudeAuthMethod(next);
    }}
  >
    {subscription ? <LogIn size={12} /> : <KeyRound size={12} />}
  </button>;
}

function AgentChatMenu({ chat }: { chat: AgentChatController }) {
  const menu = useDismissableMenu();
  const active = chat.activeChat;
  const chats = [...chat.state.chats].sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    <div className="agent-chat-picker relative min-w-0 flex-1" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className="agent-chat-picker-trigger flex h-6.5 w-full min-w-0 items-center gap-2 rounded-control bg-transparent px-1.5 text-left hover:bg-chip aria-expanded:bg-chip"
        type="button"
        aria-haspopup="menu"
        aria-label="Recent chats"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((open) => !open)}
      >
        <AgentProviderIcon provider={active.provider} size={17} />
        {/* One line, not a stack: the chrome is 34 and the provenance reads across it -- the chat's
            name, then the provider and model as mono meta, which is what a 34 row can carry. */}
        <strong className="max-w-40 truncate type-ui font-normal text-ink">{active.title}</strong>
        <small className={`min-w-0 truncate ${META}`}>
          {PROVIDER_META[active.provider].label} · {modelLabel(chat, active.provider, active.model)}
        </small>
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <ChevronDown size={11} className="flex-none text-muted-decorative" />
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
                  <strong className="truncate type-sm font-normal">{conversation.title}</strong>
                  <small className={`truncate ${META}`}>{PROVIDER_META[conversation.provider].label} · {modelLabel(chat, conversation.provider, conversation.model)}</small>
                </span>
                {conversation.busy
                  ? <AgentMark mode="working" size={13} className="text-ink" />
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

/* One model control, not a provider pill beside a model pill: handoff 17 draws a single pill whose
   mark is the provider's, and a menu that lists every connected provider's models with that mark
   on each row. Picking a model from another provider is a provider switch, which is why the row
   sends both -- and why the reducer starts a new chat when the current one has already run. */
function AgentModelMenu({ chat, onOpenSettings }: { chat: AgentChatController; onOpenSettings(): void }) {
  const menu = useDismissableMenu();
  const [query, setQuery] = useState("");
  const active = chat.activeChat;
  const rows = PROVIDER_ORDER.flatMap((provider) => {
    const status = chat.providers.find(({ id }) => id === provider);
    if (!status?.connected) return [];
    return status.models.map((model) => ({ provider, ...model }));
  });
  /* The model in use always has a row, even when its provider reports no catalog. */
  const models = rows.some(({ provider, id }) => provider === active.provider && id === active.model)
    ? rows
    : [{ provider: active.provider, id: active.model, label: active.model, description: "Current model" }, ...rows];
  const needle = query.trim().toLocaleLowerCase();
  const visible = models.filter((model) => !needle || `${model.label} ${model.id} ${model.description}`
    .toLocaleLowerCase().includes(needle)).slice(0, 80);
  return (
    <div className="agent-menu relative min-w-0" ref={menu.ref}>
      <button
        ref={menu.trigger}
        className={`agent-menu-trigger agent-model-trigger ${PILL_QUIET} max-w-agent-model-trigger`}
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
        <AgentProviderIcon provider={active.provider} size={14} />
        <span className="truncate">{modelLabel(chat, active.provider, active.model)}</span>
        <ChevronDown size={11} className="flex-none text-muted-decorative" />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-model-menu" host="primitive-host" open label="Model" description="Choose an agent model" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-model-menu bottom-8 right-0 w-agent-model-menu max-w-(--agent-model-menu-fit)`} role="menu">
          {models.length > 8 && (
            <label className={`agent-model-search flex h-control-md items-center gap-1.75 mb-0.75 rounded-control bg-chat-field px-2 text-secondary ${FIELD_RING}`}>
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
            {visible.map((model) => {
              const current = model.provider === active.provider && model.id === active.model;
              return <button
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={`${MENU_ROW} min-h-10 gap-2 px-2 py-1.25 ${current ? "is-selected" : ""}`}
                key={`${model.provider}:${model.id}`}
                onClick={() => {
                  if (model.provider === active.provider) chat.setModel(model.id);
                  else chat.setProvider(model.provider, model.id);
                  menu.setOpen(false);
                }}
              >
                <AiBrandIcon className="shrink-0" provider={model.provider} model={model.id} size={15} />
                <span className={ROW_COPY}>
                  <strong className="truncate type-sm font-normal">{model.label}</strong>
                  <small className={`truncate ${META}`}>{PROVIDER_META[model.provider].label} · {model.description}</small>
                </span>
                {current && <Check size={12} />}
              </button>;
            })}
            {visible.length === 0 && <span className="agent-model-empty block px-2 py-3 type-sm text-center">No matching models</span>}
          </div>
          {/* The handoff's last row, and it opens the real screen rather than naming it. Its `⌘,`
              hint is not printed: the chord is user-rebindable and this panel does not read the
              binding table, so a printed one would go stale silently. */}
          <button
            className={`${MENU_ROW} h-8 gap-2.5 px-2 type-ui`}
            type="button"
            role="menuitem"
            onClick={() => {
              menu.setOpen(false);
              onOpenSettings();
            }}
          >
            <SlidersHorizontal size={15} strokeWidth={1.8} className="flex-none" />
            <span className="min-w-0 flex-1 truncate text-left">Provider settings</span>
          </button>
        </div>
        </InstrumentOverlay>
      )}
    </div>
  );
}

/* The app promises three modes, so the pill cycles three. The handoff's fourth, "Bypass
   permissions", is not one of them: no harness call in this app runs unsandboxed. */
const permissionLabels: Record<AgentPermissionMode, string> = {
  auto: "Ask before changes",
  plan: "Plan only",
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
        className={`agent-menu-trigger agent-mode-trigger ${PILL_QUIET}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Agent permissions"
        aria-label="Agent permissions"
        onClick={() => menu.setOpen((open) => !open)}
      >
        <ShieldCheck size={12} strokeWidth={1.9} className="flex-none text-secondary" />
        <span className="truncate">{permissionLabels[value]}</span>
        <ChevronDown size={11} className="flex-none text-muted-decorative" />
      </button>
      {menu.open && (
        <InstrumentOverlay id="agent-chat-mode-menu" host="primitive-host" open label="Agent permissions" description="Choose agent permissions" opener={menu.trigger.current} onOpenChange={(open) => { if (!open) menu.close(); }}>
        <div className={`${POPOVER} agent-mode-menu bottom-8 left-0 w-agent-mode-menu`} role="menu">
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

/* Handoff 17's "no provider connected" dialog. Ralphy runs the chat through the operator's own
   harness or key -- nothing is proxied -- so the dialog is a list of the ways in rather than a
   sign-up: one row per provider, its account line in mono, and the controls that row needs below
   it. Two of the handoff's footer pills are not here: this panel has no route into Settings and no
   local-model provider to offer. */
function AgentConnection({ chat }: { chat: AgentChatController }) {
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
