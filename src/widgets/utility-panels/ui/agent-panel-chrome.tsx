/**
 * The chat panel's own vocabulary: the pills, the popovers, the rows, and the two helpers every
 * menu in it needs.
 *
 * The chat is a light surface by design -- a card inside the zone's frame -- so nothing here
 * paints the on-dark pair except the two things that stay inverted: the operator's own bubble and
 * a primary pill. Naming these once is what keeps a fourth menu from inventing a fifth pill.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, Image, ListChecks, Search } from "lucide-react";

import type { AgentProvider } from "@/shared/api/ipc";
import type { AgentChatController } from "@/features/agent-chat";
import { AiBrandIcon } from "@/shared/ui/AiBrandIcon";

export const PROVIDER_ORDER: AgentProvider[] = ["codex", "claude", "openrouter"];
export const PROVIDER_META: Record<AgentProvider, { label: string; detail: string; account: string }> = {
  codex: { label: "Codex", detail: "ChatGPT account", account: "LOCAL HARNESS" },
  claude: { label: "Claude", detail: "Claude account or API key", account: "LOCAL HARNESS" },
  openrouter: { label: "OpenRouter", detail: "OpenRouter API key", account: "API KEY" },
};

/* The four cards an empty chat offers. They fill the composer rather than sending: a card is a
   starting point, and an operator gets to read a prompt before it leaves. */
export const OPENERS = [
  { icon: Image, label: "Generate covers for a unit", prompt: "Generate cover options for a unit in this workspace." },
  { icon: ListChecks, label: "Work through the review queue", prompt: "Walk me through the review queue and what needs a decision." },
  { icon: Calendar, label: "Plan what ships this week", prompt: "Plan what should ship this week." },
  { icon: Search, label: "Find an asset in the library", prompt: "Find an asset in the library: " },
] as const;

/* A popover over the chat: a card one radius step tighter than the zone, with 6 of air. */
export const POPOVER = "agent-popover absolute z-agent-popover rounded-menu bg-card p-1.5 text-secondary [corner-shape:squircle]";
export const MENU_ROW = "flex w-full min-w-0 items-center rounded-tab bg-transparent text-left hover:bg-row-hover hover:text-ink aria-checked:bg-row-hover aria-checked:text-ink";
/* The composer's pills, and every other control the design draws as one: h26, a stadium on the
   chip step, one surface louder on hover. */
export const PILL = "inline-flex h-6.5 min-w-0 flex-none items-center gap-1.75 rounded-full px-2.5 type-label";
export const PILL_QUIET = `${PILL} bg-chat-control text-ink hover:bg-chat-control-hover aria-expanded:bg-chat-control-hover`;
/* A primary action anywhere in the chat is the inversion of the card. */
export const PRIMARY = "bg-brand text-brand-ink hover:opacity-88";
/* The copy column of a two-line menu row. */
export const ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.5";
/* A field well on the card, with the theme's own focus ring. */
export const FIELD_RING = "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ink";
export const FIELD_INPUT = "min-w-0 flex-1 border-0 bg-transparent text-ink outline-0";
export const SPINNER = "is-spinning animate-spinner motion-reduce:animate-none";
/* The chrome's instruments stand on the zone's panel, not on the widget inside it, so their ink and
   their hover step off the panel: 24 circles, muted until hovered. A hover always steps off its own
   surface -- the same glyph inside the card would take the card's hover instead. */
export const HEADER_GLYPH = "icon-button inline-grid size-6 flex-none place-items-center rounded-control p-0 text-muted hover:bg-chip hover:text-ink disabled:text-muted-decorative";
/* A mono meta run: a counter, a scope, an account line. */
/* A mono meta run: a counter, a scope, an account line. The design's muted grey is #9A9A96, which
   measures 2.6:1 on the card -- fine for a dot, not for a 9px run of text. Informational meta takes
   the secondary step, the same place in the hierarchy, and passes at 5:1 in both themes. */
export const META = "font-code type-mono-xs tracking-mono text-secondary";

export function AgentProviderIcon({
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

export function useDismissableMenu() {
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

export function modelLabel(chat: AgentChatController, provider: AgentProvider, model: string): string {
  return chat.providers
    .find(({ id }) => id === provider)
    ?.models.find(({ id }) => id === model)
    ?.label ?? model;
}
