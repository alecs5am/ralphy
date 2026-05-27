"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// Overlay shell for the intercepted skill route. Closes on backdrop click,
// the close button, or Escape — all via router.back() so the URL returns to
// /skills and the grid is restored underneath.
export function SkillModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center px-4 py-[clamp(1rem,4vh,3rem)] bg-black/[0.62] backdrop-blur-[4px] overflow-hidden animate-[skill-modal-fade_160ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      <div
        className="relative w-[min(960px,100%)] h-[min(86vh,880px)] flex flex-col bg-bg-1 rounded-2xl shadow-[0_24px_80px_rgb(0_0_0/0.55)] animate-[skill-modal-rise_200ms_cubic-bezier(0.22,1,0.36,1)]"
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
      >
        <button
          className="absolute top-[0.7rem] right-[0.7rem] z-[2] w-8 h-8 grid place-items-center rounded-[9px] bg-bg-2 text-ink-2 text-[0.9rem] transition-colors hover:bg-ink hover:text-bg"
          onClick={() => router.back()}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flex-1 min-h-0 flex flex-col p-[1.4rem_1.5rem_1.5rem] overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
