import { useRef, type ReactNode } from "react";
import { X, type AppIcon } from "@/shared/ui/icons";
import { STUDIO_ICON } from "@/entities/generation";

export function GenerationOptions({ label, title, icon: Icon, summary, compact, open, onOpenChange, children }: {
  label: string; title: string; icon: AppIcon; summary?: string; compact?: boolean;
  open: boolean; onOpenChange(open: boolean): void; children: ReactNode;
}) {
  const trigger = useRef<HTMLElement>(null);
  const close = () => { onOpenChange(false); trigger.current?.focus(); };
  return <details className="generation-options" open={open} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <summary ref={trigger} aria-label={label} title={label} onClick={(event) => { event.preventDefault(); onOpenChange(!open); }}><Icon size={15} /><span className={compact ? "sr-only" : undefined}>{title}</span>{summary && <small>{summary}</small>}</summary>
    <div className="generation-options-panel">
      <div className="flex items-center justify-between gap-2"><strong className="type-sm font-medium">{title}</strong><button className={STUDIO_ICON} type="button" aria-label={`Close ${label.toLocaleLowerCase()}`} onClick={close}><X size={13} /></button></div>
      {children}
    </div>
  </details>;
}
