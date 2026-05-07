import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import {
  ArrowDownIcon,
  StarIcon,
  ClaudeMark,
  CursorMark,
  CodexMark,
  OpenRouterMark,
  VercelMark,
  ElevenMark,
  RemotionMark,
  TerminalMark,
  SparkMark,
} from "./icons";
import { site } from "@/lib/site";

/* ────────────────────────────────────────────────────────────
   Hero — single, centered, text-first.

   No phone, no stats strip — just the promise, two CTAs, a
   row of "lives inside" agent chips, and a thin "powered by"
   rail. The product gets to be the bold sentence.
   ──────────────────────────────────────────────────────────── */

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden pb-16 pt-12 sm:pt-20 lg:pb-24 lg:pt-28"
    >
      {/* Soft cyan wash so the section reads as one cohesive surface */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 520px at 80% 20%, rgb(74 123 255 / 0.12), transparent 70%), radial-gradient(700px 480px at 0% 60%, rgb(61 216 255 / 0.08), transparent 70%)",
        }}
      />

      {/* ─────────────── CENTERED HEADLINE COLUMN ─────────────── */}
      <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-7 px-7 text-center">
        <Reveal>
          <span className="eyebrow">
            <span className="pulse-dot" />
            open-source · v2 · for creators
          </span>
        </Reveal>

        <Reveal delay={1}>
          <h1 className="display mx-auto max-w-[20ch] text-balance text-[clamp(44px,6.6vw,84px)]">
            Give your coding agent <em>video superpowers.</em>
          </h1>
        </Reveal>

        <Reveal delay={2}>
          <p className="mx-auto max-w-[640px] text-balance text-[clamp(16px,1.35vw,18.5px)] leading-[1.55] text-[var(--color-frost-2)]">
            Ralphy turns Claude, Cursor, or Codex into a one-prompt video
            studio. Ship UGC ads, TikToks, and product clips from the same
            terminal you already code in — no editor, no plug-ins, no third
            subscription.
          </p>
        </Reveal>

        <Reveal delay={3}>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a className="btn btn-primary" href={site.repo} target="_blank" rel="noopener">
              <StarIcon />
              Star on GitHub
              <span className="star-count">{site.stars}</span>
            </a>
            <a className="btn btn-ghost" href="#install">
              <span className="text-[12.5px]" style={{ fontFamily: "var(--font-mono)" }}>
                $ install
              </span>
              <ArrowDownIcon />
            </a>
          </div>
        </Reveal>

        <Reveal delay={4}>
          <div className="flex flex-col items-center gap-2.5">
            <span
              className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)]"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              lives inside ↳
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              <Chip icon={<ClaudeMark />} label="Claude Code" />
              <Chip icon={<CursorMark />} label="Cursor" />
              <Chip icon={<CodexMark />} label="Codex" />
              <Chip icon={<TerminalMark />} label="any agent CLI" muted />
            </div>
          </div>
        </Reveal>
      </div>

      {/* ─────────────── BOTTOM CHIP RAIL — powered by ─────────────── */}
      <Reveal delay={4}>
        <div className="relative z-10 mx-auto mt-16 max-w-[1240px] border-t border-[var(--color-line)] px-7 pt-8 lg:mt-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <span
              className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              powered by ↳
            </span>
            <div className="flex flex-wrap gap-2">
              <Chip icon={<OpenRouterMark />} label="OpenRouter" />
              <Chip icon={<VercelMark />} label="Vercel AI Gateway" />
              <Chip icon={<ElevenMark />} label="ElevenLabs" />
              <Chip icon={<RemotionMark />} label="Remotion" />
              <Chip icon={<SparkMark />} label="gemini-3-pro" muted />
              <Chip icon={<SparkMark />} label="kling-v3" muted />
              <Chip icon={<SparkMark />} label="seedance-2.0" muted />
              <Chip icon={<SparkMark />} label="gpt-image-2" muted />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────── tiny chip primitive used only inside Hero ───────── */

function Chip({
  icon,
  label,
  muted = false,
}: {
  icon: ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px]",
        muted
          ? "border-[var(--color-line)] bg-[rgb(10_18_32/0.4)] text-[var(--color-mute)]"
          : "border-[var(--color-line-2)] bg-[rgb(10_18_32/0.6)] text-[var(--color-frost-2)]",
      ].join(" ")}
    >
      <span className={muted ? "text-[var(--color-mute)]" : "text-[var(--color-cyan)]"}>{icon}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{label}</span>
    </span>
  );
}
