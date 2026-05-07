import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/* ──────────────────────────────────────────────────────────────────────
   <Block />  — the spine of the page.
   Every numbered chapter (/01, /02, /03 …) renders through this.
   It enforces one visual language: small mono /NN label on the left,
   serif heading + paragraph + content on the right, separated by a
   thin divider. Sections feel like one continuous narrative rather
   than a collection of unrelated cards.
   ────────────────────────────────────────────────────────────────────── */

export function Block({
  n,
  title,
  lede,
  children,
  id,
  noTopBorder = false,
}: {
  /** Numbered label, e.g. "01" or "02". Renders as "/01". */
  n: string;
  /** Serif headline. */
  title: ReactNode;
  /** Optional supporting paragraph (can include inline UI tags). */
  lede?: ReactNode;
  /** The chapter body — chip rows, mini tiles, terminal blocks, gallery, etc. */
  children?: ReactNode;
  /** Optional anchor for in-page nav. */
  id?: string;
  /** Skip the top divider when this is the first block in a sequence. */
  noTopBorder?: boolean;
}) {
  return (
    <Reveal>
      <article
        id={id}
        className={[
          "grid grid-cols-1 gap-x-10 gap-y-6 py-12 md:grid-cols-[140px_1fr] md:py-14",
          noTopBorder ? "" : "border-t border-[var(--color-line)]",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <span
            className="text-[14px] text-[var(--color-cyan)]"
            style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.06em" }}
          >
            /{n}
          </span>
        </div>
        <div className="flex flex-col gap-5">
          <h2
            className="max-w-[24ch] text-[clamp(26px,3.4vw,40px)] leading-[1.1] text-[var(--color-frost)]"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
          >
            {title}
          </h2>
          {lede && (
            <p className="max-w-[680px] text-[15.5px] leading-[1.6] text-[var(--color-mute)]">
              {lede}
            </p>
          )}
          {children && <div className="mt-1">{children}</div>}
        </div>
      </article>
    </Reveal>
  );
}

/* ─────────────────────────── Inline utilities ─────────────────────────── */

/** Inline "code-ish" tag inside paragraphs.  Adds a thin chip around words. */
export function Inline({
  children,
  cyan = false,
  strike = false,
}: {
  children: ReactNode;
  cyan?: boolean;
  strike?: boolean;
}) {
  return (
    <span
      className={[
        "rounded-md border px-1.5 py-[1px] text-[13.5px]",
        cyan
          ? "border-[var(--color-cyan)]/40 bg-[rgb(61_216_255/0.1)] text-[var(--color-cyan)]"
          : "border-[var(--color-line)] bg-[rgb(10_18_32/0.5)] text-[var(--color-frost-2)]",
        strike ? "line-through opacity-70" : "",
      ].join(" ")}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </span>
  );
}

/** Mono-style code chip used for filenames / commands. */
export function Mono({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-md border border-[var(--color-line)] bg-[rgb(10_18_32/0.5)] px-1.5 py-[1px] text-[13px] text-[var(--color-cyan-2)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </span>
  );
}

/** A row of inline chips, optionally with a leading label.  */
export function ChipRow({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span
          className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)]"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A pill chip used inside a ChipRow. */
export function Chip({
  icon,
  label,
  muted = false,
}: {
  icon?: ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px]",
        muted
          ? "border-[var(--color-line)] bg-transparent text-[var(--color-mute)]"
          : "border-[var(--color-line-2)] bg-[rgb(10_18_32/0.55)] text-[var(--color-frost-2)]",
      ].join(" ")}
    >
      {icon && (
        <span className={muted ? "text-[var(--color-mute)]" : "text-[var(--color-cyan)]"}>
          {icon}
        </span>
      )}
      <span style={{ fontFamily: "var(--font-mono)" }}>{label}</span>
    </span>
  );
}
