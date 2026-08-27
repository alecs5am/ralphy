import { useEffect, useRef, useState } from "react";
import { ArrowUp, PanelRightClose, Plus } from "lucide-react";
import { motion } from "motion/react";
import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import type { AgentChatController } from "@/features/agent-chat";
import { AgentComposer, type AgentComposerHandle } from "@/features/agent-chat";
import { addAttachments, withAttachments, type Attachment } from "@/features/agent-chat";
import { AgentThread } from "@/features/agent-chat";
import { AgentMark } from "@/shared/ui/AgentMark";
import { WINDOW, WINDOW_BODY } from "@/shared/ui/Window";

import { AgentConnection } from "./agent-connection";
import {
  AgentAuthSource,
  AgentChatMenu,
  AgentContextLink,
  AgentModeMenu,
  AgentModelMenu,
} from "./agent-menus";
import { HEADER_GLYPH, META, modelLabel, OPENERS, PRIMARY, PROVIDER_META } from "./agent-panel-chrome";

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

export function AgentChatPanel({
  chat,
  workspace,
  project,
  onClose,
  onOpenSettings,
  onOpenContext,
}: {
  chat: AgentChatController;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  onClose(): void;
  onOpenSettings(page?: "agents"): void;
  onOpenContext(): void;
}) {
  const [draft, setDraft] = useState("");
  /* Attachments are the drag channel, so they live beside the draft rather than in the field: they
     are cleared with it, and they are what a message carries rather than what it says. */
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  /* The composer holds text and atomic tags, so the field is `contenteditable` and the panel keeps
     only what it needs: the serialised prompt, and a handle to fill or clear the field. */
  const composer = useRef<AgentComposerHandle>(null);
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
    const prompt = withAttachments(draft.trim(), attachments);
    if (!prompt || chat.state.runningChatId !== null || !chat.connected) return;
    chat.send(prompt);
    composer.current?.clear();
    setAttachments([]);
    followOutput.current = true;
  };

  /* Fill the composer and put the caret at the end: what "edit & resend" and an opener card both
     do, and the one place this panel moves focus on the operator's behalf. */
  const fillComposer = (text: string): void => {
    composer.current?.fill(text);
  };

  /* The line the agent is on: the newest tool call while one is running, otherwise the plain fact
     that it is working. Nothing here is invented -- a harness that reports no tool reports none. */
  /* A message can be nothing but attachments: dragging three files in and pressing send is a
     sentence. */
  const sendable = (draft.trim().length > 0 || attachments.length > 0) && chat.state.runningChatId === null;

  const streamingTool = active.busy
    ? [...active.entries].reverse().find(({ kind }) => kind === "tool") ?? null
    : null;

  return (
    <motion.aside
      /* Chrome around a card, the same two layers the view panel and the sidebar stand on: a 2px
         run of panel around a widget one radius step in. tokens.css keys the squircle on this
         class, and `--blur` is `none`, so `.panel-blur` adds nothing. */
      className={`utility-right-panel panel-blur ${WINDOW} text-ink`}
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

      <div className={`utility-right-panel-card ${WINDOW_BODY}`}>
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
          <AgentComposer
            handle={composer}
            workspace={workspace}
            project={project}
            placeholder={project ? `Ask about ${project.name} · type @ to attach` : "Ask anything · type @ to attach"}
            onChange={setDraft}
            onSubmit={submit}
            onEscape={() => { if (active.busy) chat.stop(); }}
            attachments={attachments}
            onAttach={(added) => setAttachments((current) => addAttachments(current, added))}
            onDetach={(index) => setAttachments((current) => current.filter((_, at) => at !== index))}
          >
            <div className="agent-composer-toolbar flex items-center gap-1.5">
              <AgentModeMenu value={active.permissionMode} onChange={chat.setPermissionMode} />
              <AgentContextLink onOpen={onOpenContext} />
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
                  className={`agent-send grid size-7 flex-none place-items-center rounded-full ${sendable ? PRIMARY : "bg-chat-control text-muted-decorative"}`}
                  type="button"
                  disabled={!sendable}
                  title={running ? `Waiting for ${running.title}` : "Send (↩)"}
                  aria-label="Send message"
                  onClick={submit}
                >
                  <ArrowUp size={13} strokeWidth={2} />
                </button>}
            </div>
          </AgentComposer>
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
    {/* The mark is the block. It used to sit at 32 inside a 52 plate, and the plate read as a frame
        around the animation rather than as a mount for it. */}
    <AgentMark mode="idle" size={52} className="text-ink" />
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
