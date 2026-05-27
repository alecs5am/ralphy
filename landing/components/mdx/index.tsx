/* MDX component library — Ralphy blog
 *
 * Drop-in replacement for landing/components/mdx/index.tsx.
 * Pairs with mdx.css (replaces the existing MDX section in
 * landing/app/globals.css — see HANDOFF.md).
 *
 * Design rules (BRAND_DESIGN.md):
 *   • No visible borders. Depth via bg-step contrast only.
 *   • Binary radii: 0 / 14–22px (cards) / 999px (pills).
 *   • Big type, generous space. Single orange accent.
 *   • No drop shadows on UI plates.
 *
 * Variant picks (locked from MDX Article Components.html):
 *   01 Tags         · C — sharp uppercase chip
 *   02 Inline links · D — mono chip, command-style
 *   03 Inline code  · A — mono on bg-2 plate
 *   04 Code blocks  · B — filename tab top
 *   05 Callouts     · D — big glyph plate
 *   06 CTA banner   · B — full-bleed orange plate
 *   07 Link cards   · D — listing of related links
 *   08 Compare      · B default (column cards), A on `layout="rows"` for large tables
 *   09 Pricing      · A (striped rows) + PriceHero (D, single figure)
 *   10 FAQ          · A with native single-open accordion (<details name="">)
 *   11 Pull quote   · D — author plate, avatar slot
 *   12 Stat strips  · A (three-up plates) + BarStats (D, bar comparison)
 *   13 Steps        · B — vertical timeline
 *   14 Figures      · A (caption below) with optional gallery (D)
 */

import type { HTMLAttributes, ReactNode } from "react";

import { FAQ, FaqItem } from "./Faq";
import { CodeTabs, CodeTab } from "./CodeTabs";

/* ─────────────────────────────────────────────────────────────────
   Lede — opening paragraph.
   Renders as <div> (not <p>) because MDX auto-wraps the inner text
   in a <p>; nesting <p><p>…</p></p> trips React's hydration check.
   ───────────────────────────────────────────────────────────────── */
export function Lede({ children }: { children: ReactNode }) {
  return (
    <div className="text-[22px] leading-[1.5] text-ink m-0 mb-10 max-w-[64ch] font-normal [&>p]:m-0 [&>p]:font-[inherit] [&>p]:text-inherit [&>p]:tracking-[inherit]">
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Tag (variant C) — sharp uppercase chip for product names,
   model ids, env vars. `kind`:
     • neutral (default) — white plate, black text
     • accent            — Ralphy-orange plate, black text
     • warn              — amber plate
   ───────────────────────────────────────────────────────────────── */
export function Tag({
  children,
  kind = "neutral",
}: {
  children: ReactNode;
  kind?: "neutral" | "accent" | "warn";
}) {
  const tone =
    kind === "accent"
      ? "bg-vio text-bg"
      : kind === "warn"
        ? "bg-warn text-bg"
        : "bg-ink text-bg";
  return (
    <span
      className={`inline-block px-[7px] pt-px pb-0.5 rounded-[3px] font-display font-bold text-[0.72em] tracking-[0.08em] uppercase align-[2px] leading-[1.4] whitespace-nowrap ${tone}`}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Callout (variant D) — big glyph plate. `kind` drives the glyph
   square color: good / warn / danger / info.
   ───────────────────────────────────────────────────────────────── */
export function Callout({
  kind = "info",
  glyph,
  title,
  children,
}: {
  kind?: "info" | "good" | "warn" | "danger";
  /** Override the default character in the glyph square. */
  glyph?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
}) {
  const fallback =
    glyph ??
    (kind === "warn" ? "!" : kind === "danger" ? "×" : kind === "good" ? "✦" : "i");
  const glyphBg =
    kind === "good"
      ? "bg-vio"
      : kind === "warn"
        ? "bg-warn"
        : kind === "danger"
          ? "bg-[#E89094]"
          : "bg-ink";
  return (
    <aside className="grid grid-cols-[78px_minmax(0,1fr)] gap-6 items-center bg-bg-1 rounded-[18px] px-7 py-[26px] my-8">
      <span
        className={`w-[78px] h-[78px] rounded-[14px] grid place-items-center font-display font-bold text-[38px] leading-none text-bg ${glyphBg}`}
        aria-hidden
      >
        {fallback}
      </span>
      <div>
        {title && (
          <p className="font-display font-bold text-[18px] tracking-[-0.005em] uppercase text-ink m-0 mb-1.5">
            {title}
          </p>
        )}
        <div className="text-ink-3 text-[16px] leading-[1.5] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:m-0">
          {children}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Cta (variant B) — full-bleed orange CTA plate. Replaces the old
   InstallCard. `cmd` is optional — if you pass it, the right-side
   button becomes a copy-to-clipboard pill.
   ───────────────────────────────────────────────────────────────── */
export function Cta({
  title,
  caption,
  href = "https://github.com/alecs5am/ralphy",
  cta = "Get Ralphy",
}: {
  title: ReactNode;
  caption?: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <a
      className="mdx-cta group grid grid-cols-[minmax(0,1fr)_auto] gap-7 items-center bg-vio text-bg rounded-[22px] px-9 py-8 my-10 no-underline transition-transform duration-200 hover:-translate-y-0.5"
      href={href}
      target="_blank"
      rel="noopener"
    >
      <div>
        <p className="font-display font-bold text-[30px] tracking-[-0.02em] leading-none uppercase m-0 mb-2 text-bg">
          {title}
        </p>
        {caption && (
          <p className="m-0 text-[rgb(10_10_11/0.7)] text-[15px] max-w-[44ch] leading-[1.5] [&_code]:bg-[rgb(10_10_11/0.16)] [&_code]:text-bg">
            {caption}
          </p>
        )}
      </div>
      <span className="inline-flex items-center gap-2.5 bg-bg text-ink px-[22px] py-3.5 rounded-full font-sans font-semibold text-sm whitespace-nowrap">
        {cta}
        <span
          className="text-vio font-mono transition-transform duration-200 group-hover:translate-x-1"
          aria-hidden
        >
          →
        </span>
      </span>
    </a>
  );
}

/* Back-compat alias — existing MDX files still importing InstallCard
   keep working. Maps to the new orange CTA. */
export function InstallCard({
  title,
  cmd,
  caption,
  href,
}: {
  title?: string;
  cmd?: string;
  caption?: ReactNode;
  href?: string;
}) {
  return (
    <Cta
      title={title ?? "Ship reels with Ralphy"}
      caption={
        caption ??
        (cmd ? (
          <code className="font-mono text-[0.88em] px-[7px] py-0.5 rounded">{cmd}</code>
        ) : null)
      }
      href={href}
      cta="Install"
    />
  );
}

/* ─────────────────────────────────────────────────────────────────
   LinkList (variant D) — replaces the standalone LinkCard. Use for
   "Keep reading", related articles, repo+docs lists. Items pass via
   children: <LinkListItem href title meta />.

   The old <LinkCard /> still works (it's kept as a single-row card
   sized to match the listing rows).
   ───────────────────────────────────────────────────────────────── */
export function LinkList({
  head,
  children,
}: {
  head?: ReactNode;
  children: ReactNode;
}) {
  return (
    <nav className="block bg-bg-1 rounded-[16px] py-2 my-8 [&_.mdx-linklist-row+.mdx-linklist-row]:shadow-[inset_0_1px_0_var(--color-line)]">
      {head && (
        <p className="px-[22px] pt-3.5 pb-2 font-mono text-[11.5px] tracking-[0.16em] uppercase text-mute m-0">
          {head}
        </p>
      )}
      {children}
    </nav>
  );
}

export function LinkListItem({
  href,
  num,
  title,
  meta,
}: {
  href: string;
  num?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      className="mdx-linklist-row group flex items-center gap-4 px-[22px] py-4 text-ink no-underline hover:bg-bg-2"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
    >
      {num !== undefined && (
        <span className="font-mono text-[13px] text-mute w-[26px] text-right shrink-0">
          {num}
        </span>
      )}
      <span className="flex-1 text-[16px] leading-[1.4]">{title}</span>
      {meta && (
        <span className="font-mono text-xs text-mute shrink-0">{meta}</span>
      )}
      <span
        className="text-vio font-mono shrink-0 transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden
      >
        →
      </span>
    </a>
  );
}

/* Back-compat single LinkCard — renders one LinkListItem in a
   single-row LinkList. Existing MDX keeps working. */
export function LinkCard({
  href,
  title,
  subtitle,
  kicker,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <LinkList head={kicker}>
      <LinkListItem href={href} title={title} meta={subtitle} />
    </LinkList>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ComparisonTable — vendor × feature matrix.
     • layout="cards"   (default, variant B) — one column per vendor
     • layout="rows"    (variant A)          — striped rows; use this
                                                when rows > ~6 or
                                                features are dense.
   ───────────────────────────────────────────────────────────────── */
type CompareValue = boolean | string;
type CompareRow = { feature: string; sub?: string; values: CompareValue[] };

export function ComparisonTable({
  brands,
  rows,
  caption,
  layout = "cards",
}: {
  brands: { name: string; accent?: boolean }[];
  rows: CompareRow[];
  caption?: ReactNode;
  layout?: "cards" | "rows";
}) {
  return layout === "cards" ? (
    <CompareCards brands={brands} rows={rows} caption={caption} />
  ) : (
    <CompareRows brands={brands} rows={rows} caption={caption} />
  );
}

function CompareCards({
  brands,
  rows,
  caption,
}: {
  brands: { name: string; accent?: boolean }[];
  rows: CompareRow[];
  caption?: ReactNode;
}) {
  return (
    <figure className="my-9">
      <div
        className="grid gap-3.5 [grid-template-columns:repeat(var(--cmp-cols,3),minmax(0,1fr))]"
        style={{ "--cmp-cols": brands.length } as React.CSSProperties}
      >
        {brands.map((b, colIdx) => (
          <div
            key={b.name}
            className={`rounded-[18px] px-[22px] pt-[22px] pb-3.5 grid gap-2 ${
              b.accent ? "bg-vio text-bg" : "bg-bg-1"
            }`}
          >
            <div
              className={`font-display font-bold text-[20px] uppercase tracking-[-0.01em] mb-2 ${
                b.accent ? "text-bg" : "text-ink"
              }`}
            >
              {b.name}
            </div>
            {rows.map((r, ri) => (
              <div
                key={r.feature}
                className={`grid grid-cols-[1fr_auto] items-baseline gap-3 py-2.5 text-sm ${
                  ri === rows.length - 1
                    ? ""
                    : b.accent
                      ? "shadow-[inset_0_-1px_0_rgb(10_10_11/0.18)]"
                      : "shadow-[inset_0_-1px_0_var(--color-line)]"
                }`}
              >
                <span className={b.accent ? "text-[rgb(10_10_11/0.62)]" : "text-ink-3"}>
                  {r.feature}
                </span>
                <span className="font-mono text-ink-2 text-[13px]">
                  <CompareCell v={r.values[colIdx]} accent={b.accent} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {caption && <CompareCaption>{caption}</CompareCaption>}
    </figure>
  );
}

function CompareCaption({ children }: { children: ReactNode }) {
  return (
    <figcaption className="mt-3.5 font-mono text-[12.5px] text-mute text-center leading-[1.5]">
      {children}
    </figcaption>
  );
}

function CompareRows({
  brands,
  rows,
  caption,
}: {
  brands: { name: string; accent?: boolean }[];
  rows: CompareRow[];
  caption?: ReactNode;
}) {
  return (
    <figure className="my-9">
      <div className="overflow-x-auto rounded-[14px]">
        <div
          className="rounded-[14px] overflow-hidden grid text-[15px] min-w-max"
          style={{
            gridTemplateColumns: `minmax(220px, 1.6fr) repeat(${brands.length}, minmax(110px, 1fr))`,
          }}
        >
          <div className={`${HEAD_CELL} text-left`} />
          {brands.map((b) => (
            <div
              key={b.name}
              className={`${HEAD_CELL} text-center ${b.accent ? "text-vio" : ""}`}
            >
              {b.name}
            </div>
          ))}
          {rows.map((r, i) => (
            <RowFragment
              key={r.feature}
              row={r}
              cols={brands.length}
              stripe={i % 2 === 1}
            />
          ))}
        </div>
      </div>
      {caption && <CompareCaption>{caption}</CompareCaption>}
    </figure>
  );
}

const HEAD_CELL =
  "bg-bg-1 text-mute font-mono text-xs tracking-[0.14em] uppercase px-[18px] py-3.5";

function RowFragment({
  row,
  cols,
  stripe = false,
}: {
  row: CompareRow;
  cols: number;
  stripe?: boolean;
}) {
  const cell = `px-[18px] py-4 text-ink-2 ${stripe ? "bg-bg-2" : "bg-bg-1"}`;
  return (
    <>
      <div className={cell}>
        <span className="block text-ink font-medium">{row.feature}</span>
        {row.sub && (
          <span className="block text-mute text-[13px] mt-0.5">{row.sub}</span>
        )}
      </div>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className={`${cell} text-center`}>
          <CompareCell v={row.values[i]} />
        </div>
      ))}
    </>
  );
}

function CompareCell({
  v,
  accent = false,
}: {
  v: CompareValue | undefined;
  accent?: boolean;
}) {
  const tick = "font-mono text-[16px] font-bold";
  const chip =
    "inline-flex items-center px-[9px] py-0.5 rounded-full bg-bg-3 text-ink-3 font-mono text-xs";
  if (v === true)
    return <span className={`${tick} ${accent ? "text-bg" : "text-vio"}`}>✓</span>;
  if (v === false)
    return <span className={`${tick} text-mute-2 font-normal`}>✗</span>;
  if (v === undefined || v === "")
    return <span className={`${tick} text-mute-2 font-normal`}>—</span>;
  if (v === "partial") return <span className={chip}>partial</span>;
  if (v === "enterprise" || v === "add-on")
    return <span className={chip}>enterprise</span>;
  return <span className="font-mono text-sm text-ink-2">{v}</span>;
}

/* ─────────────────────────────────────────────────────────────────
   PricingTable (variant A) — striped pricing rows. Same API as
   before.
   ───────────────────────────────────────────────────────────────── */
export function PricingTable({
  cols,
  rows,
  caption,
}: {
  cols: string[];
  rows: { label: string; values: string[]; accent?: number }[];
  caption?: ReactNode;
}) {
  return (
    <figure className="my-9">
      <div className="overflow-x-auto rounded-[14px]">
        <div
          className="rounded-[14px] overflow-hidden grid text-[15px] min-w-max"
          style={{
            gridTemplateColumns: `minmax(180px, 1fr) repeat(${
              cols.length - 1
            }, minmax(120px, 1fr))`,
          }}
        >
          {cols.map((c, i) => (
            <div
              key={c}
              className={`${HEAD_CELL} ${i === 0 ? "text-left" : "text-center"} ${
                i === 1 ? "text-vio" : ""
              }`}
            >
              {c}
            </div>
          ))}
          {rows.map((r, ri) => (
            <PriceRow
              key={ri}
              row={r}
              cols={cols.length - 1}
              stripe={ri % 2 === 1}
            />
          ))}
        </div>
      </div>
      {caption && <CompareCaption>{caption}</CompareCaption>}
    </figure>
  );
}

function PriceRow({
  row,
  cols,
  stripe = false,
}: {
  row: { label: string; values: string[]; accent?: number };
  cols: number;
  stripe?: boolean;
}) {
  const bg = stripe ? "bg-bg-2" : "bg-bg-1";
  return (
    <>
      <div className={`px-[18px] py-4 text-ink-2 ${bg}`}>
        <span className="block text-ink font-medium">{row.label}</span>
      </div>
      {Array.from({ length: cols }).map((_, i) => {
        const isAccent = i === 0 || row.accent === i;
        return (
          <div
            key={i}
            className={`px-[18px] py-4 font-mono text-sm text-center ${bg} ${
              isAccent ? "text-vio font-bold" : "text-ink-2"
            }`}
          >
            {row.values[i] ?? "—"}
          </div>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PriceHero (variant D) — single hero pricing figure. Use to anchor
   the article's bottom-line claim ($X/reel, $0 platform fee, etc).
   ───────────────────────────────────────────────────────────────── */
export function PriceHero({
  eyebrow,
  title,
  caption,
  value,
  unit,
  note,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="bg-bg-1 rounded-[22px] px-9 py-8 my-10 grid grid-cols-[minmax(0,1fr)_auto] gap-9 items-center">
      <div>
        {eyebrow && (
          <p className="font-mono text-[11.5px] tracking-[0.16em] uppercase text-vio m-0 mb-2.5">
            {eyebrow}
          </p>
        )}
        <p className="font-display font-bold text-[28px] uppercase tracking-[-0.02em] m-0 text-ink leading-[1.04]">
          {title}
        </p>
        {caption && (
          <p className="text-ink-3 text-[15px] mt-2 mb-0 max-w-[38ch] leading-[1.5]">
            {caption}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="font-display font-bold text-[clamp(56px,8vw,88px)] tracking-[-0.04em] leading-[0.9] text-vio m-0">
          {value}
          {unit && (
            <small className="text-sm text-mute font-mono font-normal tracking-normal ml-1">
              {unit}
            </small>
          )}
        </p>
        {note && (
          <p className="text-mute text-[13px] mt-1.5 mb-0 font-mono">{note}</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   FAQ (variant A, single-open accordion)
   Uses HTML5 <details name=""> for exclusive accordion behavior —
   supported in all evergreen browsers as of 2024. No JS needed.
   Pass a `group` prop to FAQ if you have multiple FAQ blocks on
   one page that should accordion independently.
   ───────────────────────────────────────────────────────────────── */
/* FAQ / FaqItem live in a client component (Faq.tsx) because they
   animate height on open/close via framer-motion. CodeTabs / CodeTab
   are also client (Faq + CodeTabs are imported at the top of this
   file and re-exported through `mdxComponents` below). */
export { FAQ, FaqItem, CodeTabs, CodeTab };

/* ─────────────────────────────────────────────────────────────────
   PullQuote (variant D) — author plate. `avatar` is optional; if
   omitted we initialize from `name`.
   ───────────────────────────────────────────────────────────────── */
export function PullQuote({
  children,
  name,
  role,
  avatar,
}: {
  children: ReactNode;
  name?: string;
  role?: ReactNode;
  /** Override the auto-generated avatar initials. */
  avatar?: ReactNode;
}) {
  const initials =
    avatar ??
    (name
      ? name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("")
      : "");
  return (
    <blockquote className="my-10 px-7 py-[26px] bg-bg-1 rounded-[18px] grid grid-cols-[minmax(0,1fr)_240px] gap-7 items-center not-italic font-normal">
      {/* div, not p — MDX wraps body text in its own <p>, so a <p> here
          would nest and trip React hydration. */}
      <div className="m-0 text-[19px] leading-[1.5] text-ink-2 italic [&_p]:m-0 [&_p]:text-[19px] [&_p]:leading-[1.5] [&_p]:text-ink-2 [&_p]:italic">
        {children}
      </div>
      {(name || role) && (
        <div className="grid grid-cols-[48px_1fr] gap-3.5 items-center">
          <span className="w-12 h-12 rounded-full bg-vio text-bg grid place-items-center font-display font-bold text-[15px]">
            {initials}
          </span>
          <div>
            {name && (
              <div className="text-sm text-ink font-semibold">{name}</div>
            )}
            {role && (
              <div className="text-[12.5px] text-mute font-mono mt-0.5">
                {role}
              </div>
            )}
          </div>
        </div>
      )}
    </blockquote>
  );
}

/* ─────────────────────────────────────────────────────────────────
   StatRow / Stat (variant A) — three-up plates. Unchanged API.
   ───────────────────────────────────────────────────────────────── */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3.5 my-8">{children}</div>
  );
}
export function Stat({
  value,
  label,
}: {
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="bg-bg-1 rounded-[18px] px-6 py-[26px]">
      <span className="block font-display font-bold text-[48px] leading-[0.95] tracking-[-0.025em] text-vio mb-2">
        {value}
      </span>
      <span className="text-[13.5px] text-ink-3 leading-[1.4]">{label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   BarStats (variant D) — horizontal bar comparison. Pass items
   already sorted (visual order matches input order). Bar widths
   are computed relative to the largest item.
   ───────────────────────────────────────────────────────────────── */
type BarItem = {
  label: ReactNode;
  /** Numeric for bar width math. Pass 0 to render an empty bar. */
  amount: number;
  /** Display string (e.g. "$2.40", "38s"). Defaults to amount. */
  display?: ReactNode;
  accent?: boolean;
};

export function BarStats({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  return (
    <div className="bg-bg-1 rounded-[18px] px-7 py-[26px] my-8 grid gap-[18px]">
      {items.map((it, i) => {
        const pct = Math.max(2, Math.round((it.amount / max) * 100));
        return (
          <div
            key={i}
            className="grid grid-cols-[minmax(160px,220px)_1fr_72px] gap-5 items-center"
          >
            <span className="font-mono text-xs tracking-[0.12em] uppercase text-mute [&_b]:text-ink [&_b]:font-medium">
              {it.label}
            </span>
            <span className="h-2 bg-bg-3 rounded-full overflow-hidden relative">
              <i
                className={`block h-full rounded-full ${
                  it.accent ? "bg-vio" : "bg-ink-2"
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="font-display font-bold text-[18px] text-ink text-right tracking-[-0.01em]">
              {it.display ?? it.amount}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Steps (variant B) — vertical timeline. Wrap N <Step> children.
   ───────────────────────────────────────────────────────────────── */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="list-none my-8 pl-2 grid gap-7 [counter-reset:step]">
      {children}
    </ol>
  );
}

export function Step({
  n,
  title,
  children,
}: {
  /** Render as "01", "02" etc. If omitted, falls back to the DOM index via CSS counter. */
  n?: ReactNode;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-[22px] items-start relative [counter-increment:step] [&:not(:last-child)]:after:content-[''] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:left-[27px] [&:not(:last-child)]:after:top-[60px] [&:not(:last-child)]:after:-bottom-8 [&:not(:last-child)]:after:w-0.5 [&:not(:last-child)]:after:bg-bg-3">
      <span className="w-14 h-14 rounded-full bg-bg-1 text-vio font-display font-bold text-[22px] grid place-items-center tracking-[-0.02em] empty:before:[content:counter(step,decimal-leading-zero)]">
        {n ?? null}
      </span>
      <div>
        <p className="font-display font-bold text-[18px] uppercase tracking-[-0.005em] text-ink my-1.5">
          {title}
        </p>
        <div className="text-ink-3 text-[15.5px] leading-[1.6] max-w-[64ch] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:my-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Figure (variant A + optional D gallery)
   Single-image:  <Figure src caption fig />
   Gallery:       <Figure caption fig items={[{src,label}, ...]} />
                  Items render as a 2-up grid above the caption.
   ───────────────────────────────────────────────────────────────── */
type FigureItem = { src?: string; alt?: string; label?: ReactNode };

export function Figure({
  src,
  alt,
  caption,
  fig,
  items,
}: {
  src?: string;
  alt?: string;
  /** Caption text — rendered below in mono. */
  caption?: ReactNode;
  /** Figure number like "01" — shown bold before the caption. */
  fig?: ReactNode;
  /** Gallery mode: 2-up image grid above the caption. */
  items?: FigureItem[];
}) {
  return (
    <figure className="my-8">
      {items && items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5">
          {items.map((it, i) => (
            <span
              key={i}
              className={`${FIG_CELL} aspect-[4/5] ${it.src ? "" : FIG_EMPTY}`}
            >
              {it.src && (
                <img
                  src={it.src}
                  alt={it.alt ?? ""}
                  className="w-full h-full object-cover block"
                />
              )}
              {it.label && (
                <span className="absolute left-3.5 bottom-3.5 px-2.5 py-1 bg-bg text-ink font-mono text-[11.5px] tracking-[0.08em] rounded">
                  {it.label}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : src ? (
        <span className={`${FIG_CELL} aspect-video`}>
          <img
            src={src}
            alt={alt ?? ""}
            className="w-full h-full object-cover block"
          />
        </span>
      ) : (
        <span className={`${FIG_CELL} aspect-video ${FIG_EMPTY}`} />
      )}
      {(fig || caption) && (
        <figcaption className="mt-3.5 font-mono text-[13px] text-mute leading-[1.5]">
          {fig && <b className="text-ink-2 font-medium mr-2">Fig {fig}</b>}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const FIG_CELL =
  "block bg-bg-1 rounded-[16px] overflow-hidden relative";
const FIG_EMPTY =
  "after:content-['Image_missing'] after:absolute after:inset-0 after:grid after:place-items-center after:font-mono after:text-xs after:text-mute after:tracking-[0.14em] after:uppercase";

/* ─────────────────────────────────────────────────────────────────
   CodeBlock (variant B) — filename tab on top. Use when you have a
   real filename to surface. Bare ```js/ts code fences in MDX render
   through the default `pre` styling (also variant B, no tab).
   ───────────────────────────────────────────────────────────────── */
export function CodeBlock({
  filename,
  lang,
  meta,
  children,
}: {
  filename?: ReactNode;
  lang?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="my-8">
      {(filename || meta) && (
        <div className="flex items-stretch font-mono text-[12.5px]">
          {filename && (
            <span className="bg-bg-2 text-ink pl-4 pr-3.5 py-[9px] rounded-t-[10px] inline-flex items-center gap-2">
              <span className="text-vio" aria-hidden>
                ›
              </span>
              {filename}
            </span>
          )}
          {(lang || meta) && (
            <span className="ml-auto text-mute px-3.5 py-[9px] self-center">
              {lang}
              {lang && meta ? " · " : ""}
              {meta}
            </span>
          )}
        </div>
      )}
      <pre className="m-0 bg-bg-2 text-ink rounded-tr-[14px] rounded-b-[14px] px-[26px] py-[22px] font-mono text-sm leading-[1.7] overflow-x-auto whitespace-pre [&_code]:font-[inherit] [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none [&_code]:text-[length:inherit] [&_code]:text-inherit">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   TeamRecs / TeamRec — unchanged. Kept for back-compat with the
   ralphy-vs-higgsfield article.
   ───────────────────────────────────────────────────────────────── */
export function TeamRecs({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-1 rounded-[16px] px-6 py-2 my-8 [&>:last-child]:shadow-none">
      {children}
    </div>
  );
}
export function TeamRec({
  team,
  pick,
  children,
}: {
  team: string;
  pick: string;
  children: ReactNode;
}) {
  return (
    <div className="py-[18px] shadow-[inset_0_-1px_0_var(--color-line)]">
      <p className="font-mono text-[11.5px] tracking-[0.16em] uppercase text-vio m-0 mb-1.5">
        For {team}
      </p>
      {/* div, not p — children may be MDX-paragraph-wrapped. */}
      <div className="m-0 text-ink-3 text-[15.5px] leading-[1.55] not-italic [&_p]:m-0 [&_p]:text-ink-3 [&_p]:text-[15.5px] [&_p]:leading-[1.55]">
        <span className="text-ink font-semibold">{pick}</span>
        {" — "}
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Component map — passed into <MDXRemote components={...} />.
   ───────────────────────────────────────────────────────────────── */
export const mdxComponents = {
  // Article-flow
  Lede,
  Tag,
  Callout,

  // CTAs / links
  Cta,
  InstallCard,
  LinkList,
  LinkListItem,
  LinkCard,

  // Tables
  ComparisonTable,
  PricingTable,
  PriceHero,

  // Long-form blocks
  FAQ,
  FaqItem,
  PullQuote,
  StatRow,
  Stat,
  BarStats,
  Steps,
  Step,
  Figure,
  CodeBlock,
  CodeTabs,
  CodeTab,

  // Legacy
  TeamRecs,
  TeamRec,

  // Markdown overrides — wrap native tables in a horizontal scroller so
  // wide matrices don't overflow the prose column on narrow viewports.
  table: ScrollTable,
};

function ScrollTable(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="my-8 overflow-x-auto rounded-[14px]">
      <table {...props} />
    </div>
  );
}
