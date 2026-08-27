/**
 * The composer's four menus: which chat, which model, which permission mode, and where the
 * account behind the answer came from.
 *
 * Each one is a popover over its own pill, dismissed the same way, and each states only what the
 * app can actually promise -- a provider with no connected account offers no model, and a mode the
 * harness does not implement is not offered at all.
 */
import { useState } from "react";
import {
  Check,
  ChevronDown,
  KeyRound,
  Layers,
  LogIn,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import type { AgentPermissionMode } from "@/shared/api/ipc";
import type { AgentChatController } from "@/features/agent-chat";
import { AgentMark } from "@/shared/ui/AgentMark";
import { AiBrandIcon } from "@/shared/ui/AiBrandIcon";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";

import {
  AgentProviderIcon,
  META,
  FIELD_INPUT,
  FIELD_RING,
  MENU_ROW,
  modelLabel,
  PILL_QUIET,
  POPOVER,
  PROVIDER_META,
  PROVIDER_ORDER,
  ROW_COPY,
  useDismissableMenu,
} from "./agent-panel-chrome";

export function AgentAuthSource({ chat }: { chat: AgentChatController }) {
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

export function AgentChatMenu({ chat }: { chat: AgentChatController }) {
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
export function AgentModelMenu({ chat, onOpenSettings }: { chat: AgentChatController; onOpenSettings(page?: "agents"): void }) {
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
            /* Named, not bare: the row is about harnesses, so it lands on the harness page rather
               than wherever Settings was last left. */
            onClick={() => {
              menu.setOpen(false);
              onOpenSettings("agents");
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
export const permissionLabels: Record<AgentPermissionMode, string> = {
  auto: "Ask before changes",
  plan: "Plan only",
  full: "Full access",
};

/**
 * What this chat can reach. The operator asked the honest version of the question -- which files
 * are in context, where the system prompt starts, and what the harness may pull in as it works --
 * and the answer is read where it is true, in main, rather than described here.
 */
/**
 * The composer's way into the Context page. It used to be a popover listing file paths, which the
 * context handoff rejected: a list of paths answers "which files" and none of the questions the
 * operator actually has -- what is it, is it there, when does it load, and what can I do about it.
 * Those live on a page with room for them, so the composer keeps the link and nothing else.
 */
export function AgentContextLink({ onOpen }: { onOpen(): void }) {
  return (
    <button
      className={`agent-context-trigger ${PILL_QUIET}`}
      type="button"
      title="What this chat carries before it reads your message"
      aria-label="Open Context"
      onClick={onOpen}
    >
      <Layers size={12} strokeWidth={1.9} className="flex-none text-secondary" />
      <span className="truncate">Context</span>
    </button>
  );
}

export function AgentModeMenu({
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
