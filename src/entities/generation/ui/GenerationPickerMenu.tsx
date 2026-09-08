import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";
import { STUDIO_ICON } from "./generation-chrome";

export function GenerationPickerMenu({ kind, opener, query, onQuery, onClose, actions, filters, footer, children }: {
  kind: "model" | "voice"; opener: HTMLButtonElement | null; query: string;
  onQuery(value: string): void; onClose(): void;
  actions?: ReactNode; filters?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const title = kind === "voice" ? "Choose a voice" : "Choose generation model";
  const searchLabel = kind === "voice" ? "Search voices" : "Search generation models";
  return <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
    <InstrumentOverlay id={kind === "voice" ? "generation-voices" : "generation-models"} host="primitive-host" open label={title} description={searchLabel} opener={opener} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content className="generation-model-menu z-popover" data-picker={kind} onOpenAutoFocus={(event) => { event.preventDefault(); search.current?.focus(); }}>
        <Dialog.Title hidden>{title}</Dialog.Title><Dialog.Description hidden>{searchLabel} and choose one for your current generation.</Dialog.Description>
        <div className="generation-model-search">
          <div className="flex items-center gap-1">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-field bg-field px-3 text-muted"><Search size={14} className="shrink-0" /><input ref={search} type="search" aria-label={searchLabel} className="min-h-9 w-full min-w-0 border-0 bg-transparent py-2 type-sm text-ink placeholder:text-muted" placeholder={kind === "voice" ? "Find a voice…" : "Find a model…"} value={query} maxLength={256} onChange={(event) => onQuery(event.currentTarget.value)} onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const rows = list.current?.querySelectorAll<HTMLButtonElement>("button");
              (event.key === "ArrowDown" ? rows?.[0] : rows?.[rows.length - 1])?.focus();
            }} /></label>
            {actions}<Dialog.Close asChild><button type="button" className={STUDIO_ICON} aria-label={`Close ${kind} picker`}><X size={13} /></button></Dialog.Close>
          </div>
          {filters}
        </div>
        <div ref={list} className="generation-model-list" aria-label={kind === "voice" ? "Account voices" : "Generation models"} onKeyDown={(event) => {
          const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const index = rows.indexOf(event.target as HTMLButtonElement);
          if (index < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "ArrowUp" && index === 0) search.current?.focus();
          else rows[event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1)) % rows.length]?.focus();
        }}>{children}</div>
        {footer}
      </Dialog.Content>
    </InstrumentOverlay>
  </Dialog.Portal>;
}
