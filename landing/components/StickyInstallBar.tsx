"use client";

import { useEffect, useState } from "react";
import { StarIcon, TerminalMark } from "./icons";
import { site } from "@/lib/site";

/* ──────────────────────────────────────────────────────────────────
   <StickyInstallBar />

   A floating, ever-present bar pinned to the bottom of the viewport.
   Carries the install command (with copy-to-clipboard) and the
   primary "Star on GitHub" CTA so they're always one click away,
   no matter how far down the user has scrolled.

   Reveals once the visitor scrolls past the hero, and slides back
   out near the very bottom so it never overlaps the page footer.
   ────────────────────────────────────────────────────────────────── */

export function StickyInstallBar() {
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distFromBottom = docH - (y + winH);

      const show = y > winH * 0.6 && distFromBottom > 140;
      setVisible(show);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied("idle"), 1600);
    }
  };

  return (
    <div
      aria-hidden={!visible}
      className={[
        "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-5 sm:px-5",
        "transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      ].join(" ")}
    >
      <div
        className={[
          "flex w-full max-w-[760px] items-center gap-2 rounded-2xl border border-[var(--color-line-2)] bg-[rgb(6_10_18/0.82)] p-1.5 pl-2 backdrop-blur-xl",
          "shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7),_0_0_0_1px_rgb(61_216_255/0.06)_inset]",
          visible ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
      >
        {/* Terminal pill — the curl command itself */}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy install command"
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[rgb(4_7_12/0.8)] px-3 py-2 text-left transition hover:border-[var(--color-cyan)]/40"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[rgb(61_216_255/0.1)] text-[var(--color-cyan)]">
            <TerminalMark className="h-3.5 w-3.5" />
          </span>
          <span
            className="truncate text-[12.5px] text-[var(--color-frost)] sm:text-[13px]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="text-[var(--color-cyan)]">$ </span>
            <span className="hidden sm:inline">curl -fsSL </span>
            <span className="sm:hidden">curl </span>
            <span className="text-[var(--color-frost-2)]">
              <span className="hidden md:inline">
                https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh
              </span>
              <span className="hidden sm:inline md:hidden">
                …/alecs5am/ralphy/install.sh
              </span>
              <span className="sm:hidden">…/install.sh</span>
            </span>
            <span> | sh</span>
          </span>
          <span
            className={[
              "ml-auto hidden shrink-0 rounded-md px-1.5 py-[3px] text-[10.5px] uppercase tracking-[0.06em] transition sm:inline-flex",
              copied === "copied"
                ? "bg-[var(--color-cyan)] text-[var(--color-ink)]"
                : "border border-[var(--color-line)] text-[var(--color-mute)] group-hover:text-[var(--color-cyan)]",
            ].join(" ")}
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {copied === "copied" ? "copied ✓" : copied === "error" ? "press ⌘C" : "copy"}
          </span>
        </button>

        {/* Star CTA */}
        <a
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-cyan)] px-3 py-2 text-[13px] text-[var(--color-ink)] transition hover:brightness-110 sm:px-4"
          href={site.repo}
          target="_blank"
          rel="noopener"
          style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
        >
          <StarIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Star</span>
          <span
            className="hidden rounded-md bg-[rgb(0_0_0/0.18)] px-1.5 py-[2px] text-[11px] sm:inline-flex"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {site.stars}
          </span>
        </a>
      </div>
    </div>
  );
}
