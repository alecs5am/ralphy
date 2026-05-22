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
  return <div className="mdx-lede">{children}</div>;
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
  return <span className={`mdx-tag mdx-tag-${kind}`}>{children}</span>;
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
  return (
    <aside className={`mdx-callout mdx-callout-${kind}`}>
      <span className="mdx-callout-glyph" aria-hidden>
        {fallback}
      </span>
      <div className="mdx-callout-body">
        {title && <p className="mdx-callout-title">{title}</p>}
        <div className="mdx-callout-content">{children}</div>
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
    <a className="mdx-cta" href={href} target="_blank" rel="noopener">
      <div className="mdx-cta-text">
        <p className="mdx-cta-title">{title}</p>
        {caption && <p className="mdx-cta-caption">{caption}</p>}
      </div>
      <span className="mdx-cta-btn">
        {cta}
        <span className="mdx-cta-arrow" aria-hidden>
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
      caption={caption ?? (cmd ? <><code className="mdx-code">{cmd}</code></> : null)}
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
    <nav className="mdx-linklist">
      {head && <p className="mdx-linklist-head">{head}</p>}
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
      className="mdx-linklist-row"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
    >
      {num !== undefined && <span className="mdx-linklist-num">{num}</span>}
      <span className="mdx-linklist-title">{title}</span>
      {meta && <span className="mdx-linklist-meta">{meta}</span>}
      <span className="mdx-linklist-arrow" aria-hidden>
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
    <figure className="mdx-compare mdx-compare-cards">
      <div
        className="mdx-cmp-cards"
        style={{ "--cmp-cols": brands.length } as React.CSSProperties}
      >
        {brands.map((b, colIdx) => (
          <div
            key={b.name}
            className={`mdx-cmp-card ${b.accent ? "is-accent" : ""}`}
          >
            <div className="mdx-cmp-card-head">{b.name}</div>
            {rows.map((r) => (
              <div key={r.feature} className="mdx-cmp-card-row">
                <span className="mdx-cmp-card-lbl">{r.feature}</span>
                <span className="mdx-cmp-card-val">
                  <CompareCell v={r.values[colIdx]} accent={b.accent} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {caption && <figcaption className="mdx-compare-caption">{caption}</figcaption>}
    </figure>
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
    <figure className="mdx-compare mdx-compare-rows">
      <div className="mdx-cmp-scroll">
        <div
          className="mdx-cmp-grid"
          style={{
            gridTemplateColumns: `minmax(220px, 1.6fr) repeat(${brands.length}, minmax(110px, 1fr))`,
          }}
        >
          <div className="mdx-cmp-h" />
          {brands.map((b) => (
            <div
              key={b.name}
              className={`mdx-cmp-h ${b.accent ? "is-accent" : ""}`}
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
      {caption && <figcaption className="mdx-compare-caption">{caption}</figcaption>}
    </figure>
  );
}

function RowFragment({
  row,
  cols,
  stripe = false,
}: {
  row: CompareRow;
  cols: number;
  stripe?: boolean;
}) {
  const cls = stripe ? "mdx-cmp-c is-stripe" : "mdx-cmp-c";
  return (
    <>
      <div className={`${cls} mdx-cmp-c-feat`}>
        <span className="lbl">{row.feature}</span>
        {row.sub && <span className="sub">{row.sub}</span>}
      </div>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className={`${cls} mdx-cmp-c-val`}>
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
  if (v === true)
    return (
      <span className={`mdx-tick ${accent ? "on-accent" : ""}`}>✓</span>
    );
  if (v === false) return <span className="mdx-tick mdx-tick-no">✗</span>;
  if (v === undefined || v === "")
    return <span className="mdx-tick mdx-tick-na">—</span>;
  if (v === "partial")
    return <span className="mdx-cell-chip">partial</span>;
  if (v === "enterprise" || v === "add-on")
    return <span className="mdx-cell-chip">enterprise</span>;
  return <span className="mdx-cell-text">{v}</span>;
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
    <figure className="mdx-compare mdx-compare-rows mdx-pricing">
      <div className="mdx-cmp-scroll">
        <div
          className="mdx-cmp-grid"
          style={{
            gridTemplateColumns: `minmax(180px, 1fr) repeat(${
              cols.length - 1
            }, minmax(120px, 1fr))`,
          }}
        >
          {cols.map((c, i) => (
            <div
              key={c}
              className={`mdx-cmp-h ${i === 1 ? "is-accent" : ""}`}
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
      {caption && <figcaption className="mdx-compare-caption">{caption}</figcaption>}
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
  const stripeCls = stripe ? "is-stripe" : "";
  return (
    <>
      <div className={`mdx-cmp-c mdx-cmp-c-feat ${stripeCls}`}>
        <span className="lbl">{row.label}</span>
      </div>
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className={`mdx-cmp-c mdx-cmp-c-val mdx-cmp-c-text ${stripeCls} ${
            i === 0 || row.accent === i ? "is-accent" : ""
          }`}
        >
          {row.values[i] ?? "—"}
        </div>
      ))}
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
    <div className="mdx-pricehero">
      <div className="mdx-pricehero-l">
        {eyebrow && <p className="mdx-pricehero-eye">{eyebrow}</p>}
        <p className="mdx-pricehero-ttl">{title}</p>
        {caption && <p className="mdx-pricehero-sub">{caption}</p>}
      </div>
      <div className="mdx-pricehero-r">
        <p className="mdx-pricehero-big">
          {value}
          {unit && <small>{unit}</small>}
        </p>
        {note && <p className="mdx-pricehero-cap">{note}</p>}
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
    <blockquote className="mdx-pullquote">
      {/* div, not p — MDX wraps body text in its own <p>, so a <p> here
          would nest and trip React hydration. */}
      <div className="mdx-pullquote-text">{children}</div>
      {(name || role) && (
        <div className="mdx-pullquote-who">
          <span className="mdx-pullquote-avatar">{initials}</span>
          <div>
            {name && <div className="mdx-pullquote-name">{name}</div>}
            {role && <div className="mdx-pullquote-role">{role}</div>}
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
  return <div className="mdx-statrow">{children}</div>;
}
export function Stat({
  value,
  label,
}: {
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="mdx-stat">
      <span className="mdx-stat-value">{value}</span>
      <span className="mdx-stat-label">{label}</span>
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
    <div className="mdx-barstats">
      {items.map((it, i) => {
        const pct = Math.max(2, Math.round((it.amount / max) * 100));
        return (
          <div key={i} className="mdx-barstats-row">
            <span className="mdx-barstats-lbl">{it.label}</span>
            <span className={`mdx-barstats-bar ${it.accent ? "is-accent" : ""}`}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="mdx-barstats-v">{it.display ?? it.amount}</span>
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
  return <ol className="mdx-steps">{children}</ol>;
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
    <li className="mdx-step">
      <span className="mdx-step-num">{n ?? null}</span>
      <div className="mdx-step-body">
        <p className="mdx-step-ttl">{title}</p>
        <div className="mdx-step-text">{children}</div>
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
    <figure className="mdx-figure">
      {items && items.length > 0 ? (
        <div className="mdx-figure-gallery">
          {items.map((it, i) => (
            <span
              key={i}
              className={`mdx-figure-cell ${
                it.src ? "" : "mdx-figure-cell-empty"
              }`}
            >
              {it.src && <img src={it.src} alt={it.alt ?? ""} />}
              {it.label && <span className="mdx-figure-label">{it.label}</span>}
            </span>
          ))}
        </div>
      ) : src ? (
        <span className="mdx-figure-cell">
          <img src={src} alt={alt ?? ""} />
        </span>
      ) : (
        <span className="mdx-figure-cell mdx-figure-cell-empty" />
      )}
      {(fig || caption) && (
        <figcaption>
          {fig && <b>Fig {fig}</b>}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

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
    <div className="mdx-codeblock">
      {(filename || meta) && (
        <div className="mdx-codeblock-bar">
          {filename && (
            <span className="mdx-codeblock-tab">
              <span className="ic" aria-hidden>
                ›
              </span>
              {filename}
            </span>
          )}
          {(lang || meta) && (
            <span className="mdx-codeblock-meta">
              {lang}
              {lang && meta ? " · " : ""}
              {meta}
            </span>
          )}
        </div>
      )}
      <pre>
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
  return <div className="mdx-recs">{children}</div>;
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
    <div className="mdx-rec">
      <p className="mdx-rec-team">For {team}</p>
      {/* div, not p — children may be MDX-paragraph-wrapped. */}
      <div className="mdx-rec-body">
        <span className="mdx-rec-pick">{pick}</span>
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
    <div className="mdx-table-scroll">
      <table {...props} />
    </div>
  );
}
