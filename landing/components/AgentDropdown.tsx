"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClaudeMark, CodexMark, CursorMark } from "./icons";

/* ──────────────────────────────────────────────────────────────────
   <AgentDropdown />

   An inline, paragraph-friendly dropdown that swaps the noun
   "agent" inside a sentence for a clickable, branded picker
   (Claude / Codex / Cursor). Sized to sit on a text baseline
   without breaking the reading rhythm.
   ────────────────────────────────────────────────────────────────── */

type AgentId = "claude" | "codex" | "cursor";

type AgentOption = {
  id: AgentId;
  label: string;
  icon: ReactNode;
};

const AGENTS: readonly AgentOption[] = [
  { id: "claude", label: "Claude Code", icon: <ClaudeMark /> },
  { id: "codex", label: "Codex", icon: <CodexMark /> },
  { id: "cursor", label: "Cursor", icon: <CursorMark /> },
] as const;

export function AgentDropdown({ defaultAgent = "claude" as AgentId } = {}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AgentId>(defaultAgent);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const current = AGENTS.find((a) => a.id === picked) ?? AGENTS[0];
  const initialDefault: AgentId = defaultAgent;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex align-baseline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "inline-flex translate-y-[1px] items-center gap-1.5 rounded-md border px-2 py-[3px] text-[13.5px] transition",
          open
            ? "border-[var(--color-cyan)]/60 bg-[rgb(61_216_255/0.12)] text-[var(--color-cyan-2)]"
            : "border-[var(--color-line-2)] bg-[rgb(10_18_32/0.55)] text-[var(--color-frost-2)] hover:border-[var(--color-cyan)]/50 hover:text-[var(--color-cyan)]",
        ].join(" ")}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span className={open ? "text-[var(--color-cyan-2)]" : "text-[var(--color-cyan)]"}>
          {current.icon}
        </span>
        <span>{current.label.toLowerCase()}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={"opacity-70 transition-transform " + (open ? "rotate-180" : "")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <span
          role="listbox"
          aria-label="Pick your agent"
          className="absolute left-0 top-[calc(100%+6px)] z-30 flex min-w-[180px] flex-col gap-0.5 rounded-xl border border-[var(--color-line-2)] bg-[rgb(6_10_18/0.96)] p-1.5 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.7)] backdrop-blur-md"
        >
          {AGENTS.map((a) => {
            const active = a.id === picked;
            const isDefault = a.id === initialDefault;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setPicked(a.id);
                  setOpen(false);
                }}
                className={[
                  "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] transition",
                  active
                    ? "bg-[rgb(61_216_255/0.1)] text-[var(--color-cyan-2)]"
                    : "text-[var(--color-frost-2)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-frost)]",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-2">
                  <span className={active ? "text-[var(--color-cyan)]" : "text-[var(--color-frost-2)]"}>
                    {a.icon}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {a.label.toLowerCase()}
                  </span>
                </span>
                {isDefault && (
                  <span
                    className={[
                      "text-[10px] uppercase tracking-[0.08em]",
                      active ? "text-[var(--color-cyan)]" : "text-[var(--color-mute)]",
                    ].join(" ")}
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    default
                  </span>
                )}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}
