import { useEffect, useRef } from "react";
import { Search, X } from "./icons";

/**
 * The browser's find bar, for a surface that has a list to search.
 *
 * A search field that lives in a toolbar is paid for on every screen the operator is not
 * searching: it takes the widest control in the row and it is empty almost always. Cmd+F is
 * where everyone already reaches, so the field appears when asked for and leaves when dismissed.
 */
export function FindBar({ value, label, placeholder, count, onChange, onClose }: {
  value: string; label: string; placeholder: string; count?: number; onChange(value: string): void; onClose(): void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.select?.(); }, []);
  return <div className="find-bar absolute right-2 top-2 z-popover flex items-center gap-1.5 rounded-control bg-card p-1.5" role="search">
    <Search size={14} className="ml-1 flex-none text-muted" aria-hidden="true" />
    <input
      ref={field}
      className="w-56 min-w-0 border-0 bg-transparent type-base text-ink placeholder:text-muted"
      type="text"
      maxLength={256}
      autoFocus
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onInput={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
    />
    {count !== undefined && <span className="flex-none px-1 font-code type-mono-xs text-muted">{count}</span>}
    <button className="grid size-6 flex-none place-items-center rounded-control text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" type="button" aria-label="Close find" onClick={onClose}><X size={14} aria-hidden="true" /></button>
  </div>;
}

/**
 * Cmd+F (Ctrl+F on Windows) opens the find bar of whatever surface is mounted.
 *
 * Bound to the window because the shortcut is global, and scoped by the surface that installs
 * it: only one find-capable surface is on screen at a time, so the one that mounted the hook is
 * the one the operator meant. A field already has its own find behaviour, so it keeps the key.
 */
export function useFindShortcut(onOpen: () => void): void {
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
