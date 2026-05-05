import type { CSSProperties, ReactNode } from "react";
import { ERA, MONO, SANS } from "./tokens";

type CornerKey = "tl" | "tr" | "bl" | "br";

export function Cross({
  corner = "tl",
  size = 8,
  color = ERA.ink,
  offset = 0,
  opacity = 1,
}: {
  corner?: CornerKey;
  size?: number;
  color?: string;
  offset?: number;
  opacity?: number;
}) {
  const o = -size / 2 + offset;
  const positions: Record<CornerKey, CSSProperties> = {
    tl: { top: o, left: o },
    tr: { top: o, right: o },
    bl: { bottom: o, left: o },
    br: { bottom: o, right: o },
  };
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        ...positions[corner],
        width: size,
        height: size,
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: "block" }}>
        <path d="M5 0v10M0 5h10" stroke={color} strokeWidth="1" />
      </svg>
    </span>
  );
}

export function Crosses({
  size = 8,
  color = ERA.ink,
  opacity = 1,
}: {
  size?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <>
      <Cross corner="tl" size={size} color={color} opacity={opacity} />
      <Cross corner="tr" size={size} color={color} opacity={opacity} />
      <Cross corner="bl" size={size} color={color} opacity={opacity} />
      <Cross corner="br" size={size} color={color} opacity={opacity} />
    </>
  );
}

const STATUS_MAP: Record<string, { c: string; l: string }> = {
  draft: { c: ERA.mute, l: "draft" },
  scenario: { c: ERA.warn, l: "scenario" },
  prompts: { c: ERA.warn, l: "prompts" },
  assets: { c: ERA.busy, l: "assets" },
  ready: { c: ERA.busy, l: "ready" },
  queued: { c: ERA.mute, l: "queued" },
  rendering: { c: ERA.busy, l: "rendering" },
  done: { c: ERA.ok, l: "done" },
  completed: { c: ERA.ok, l: "completed" },
  analyzed: { c: ERA.ok, l: "analyzed" },
  indexed: { c: ERA.ok, l: "indexed" },
  extracted: { c: ERA.ok, l: "extracted" },
  pending: { c: ERA.mute, l: "pending" },
  running: { c: ERA.busy, l: "running" },
  failed: { c: ERA.err, l: "failed" },
  error: { c: ERA.err, l: "error" },
};

export function StatusBadge({ status, dim }: { status?: string; dim?: boolean }) {
  const m = (status && STATUS_MAP[status]) || { c: ERA.mute, l: status || "—" };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px]"
      style={{ color: dim ? ERA.mute : ERA.ink, ...MONO }}
    >
      <span
        className="inline-block"
        style={{ width: 6, height: 6, background: m.c }}
      />
      <span>{m.l}</span>
    </span>
  );
}

export function NumTag({ index, total }: { index: number; total?: number }) {
  return (
    <span
      className="text-[10px]"
      style={{ color: ERA.mute, ...MONO }}
    >
      {String(index).padStart(2, "0")}
      {total != null && ` / ${String(total).padStart(2, "0")}`}
    </span>
  );
}

export function SectionHead({
  section,
  title,
  right,
}: {
  section: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div
      className="flex items-baseline justify-between mb-3 pb-2"
      style={{ borderBottom: `1px solid ${ERA.ink}` }}
    >
      <div className="flex items-baseline gap-3">
        <div
          className="text-[10px] uppercase tracking-[0.22em]"
          style={{ color: ERA.mute, ...MONO }}
        >
          {section}
        </div>
        <div className="text-[12px] font-medium">{title}</div>
      </div>
      {right && (
        <div className="text-[10px]" style={{ color: ERA.mute, ...MONO }}>
          {right}
        </div>
      )}
    </div>
  );
}

export function Cell({
  children,
  className = "",
  style = {},
  pad = true,
  crosses = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  pad?: boolean;
  crosses?: boolean;
}) {
  return (
    <div
      className={"relative bg-white " + className}
      style={{
        border: `1px solid ${ERA.rule}`,
        padding: pad ? 16 : 0,
        ...style,
      }}
    >
      {children}
      {crosses && <Crosses />}
    </div>
  );
}

export function CrossedGrid({
  children,
  cols = 4,
  className = "",
}: {
  children: ReactNode;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={"grid relative " + className}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        border: `1px solid ${ERA.rule}`,
      }}
    >
      {children}
    </div>
  );
}

type BtnKind = "primary" | "secondary" | "ghost" | "bare";
type BtnSize = "sm" | "md" | "lg";

export function Btn({
  children,
  kind = "ghost",
  size = "md",
  icon,
  iconRight,
  onClick,
  style = {},
  className = "",
  href,
  title,
}: {
  children?: ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
  href?: string;
  title?: string;
}) {
  const h = size === "sm" ? 26 : size === "lg" ? 38 : 32;
  const fs = size === "sm" ? 11 : 12;
  const styles: Record<BtnKind, CSSProperties> = {
    primary: { background: ERA.ink, color: "#FFF", border: `1px solid ${ERA.ink}` },
    secondary: { background: ERA.hover, color: ERA.ink, border: `1px solid ${ERA.rule}` },
    ghost: { background: "transparent", color: ERA.ink, border: `1px solid ${ERA.rule}` },
    bare: { background: "transparent", color: ERA.sub, border: "none" },
  };
  const inner = (
    <>
      {icon && <span style={{ display: "flex" }}>{icon}</span>}
      {children}
      {iconRight && <span style={{ display: "flex" }}>{iconRight}</span>}
    </>
  );
  const css: CSSProperties = {
    height: h,
    fontSize: fs,
    ...SANS,
    ...styles[kind],
    ...style,
  };
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        className={"inline-flex items-center gap-2 px-3 " + className}
        style={css}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={"inline-flex items-center gap-2 px-3 " + className}
      style={css}
    >
      {inner}
    </button>
  );
}

export function Chip({
  children,
  solid = false,
  size = "md",
}: {
  children: ReactNode;
  solid?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className="inline-flex items-center px-2"
      style={{
        height: size === "sm" ? 20 : 24,
        fontSize: size === "sm" ? 10 : 11,
        border: solid ? "none" : `1px solid ${ERA.ink}`,
        background: solid ? ERA.ink : "transparent",
        color: solid ? "#FFF" : ERA.ink,
      }}
    >
      {children}
    </span>
  );
}

export function Spec({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <tr style={{ borderTop: `1px solid ${ERA.rule}` }}>
      <td
        className="py-1.5 pr-4 text-[11px]"
        style={{ color: ERA.mute, ...MONO }}
      >
        {k}
      </td>
      <td
        className="py-1.5 text-right text-[11px]"
        style={{ color: ERA.ink, ...MONO }}
      >
        {v}
      </td>
    </tr>
  );
}

export function Empty({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className="relative flex flex-col items-center justify-center py-16 text-center"
      style={{ border: `1px solid ${ERA.rule}` }}
    >
      <Crosses />
      {icon && <div className="mb-3" style={{ color: ERA.mute }}>{icon}</div>}
      <div className="text-[12px]" style={{ color: ERA.sub }}>{children}</div>
    </div>
  );
}

export function PlaceholderImg({
  palette,
  label,
  ratio = "4/5",
  className = "",
  textTone = "dark",
  src,
}: {
  palette: string[];
  label?: string | null;
  ratio?: string;
  className?: string;
  textTone?: "dark" | "light";
  src?: string | null;
}) {
  if (src) {
    return (
      <div
        className={"relative overflow-hidden " + className}
        style={{ aspectRatio: ratio === "auto" ? undefined : ratio, background: ERA.panel }}
      >
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        {label && (
          <div
            className="absolute left-0 right-0 bottom-0 px-2 py-1 text-[10px]"
            style={{
              color: textTone === "light" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)",
              background: textTone === "light" ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {label}
          </div>
        )}
      </div>
    );
  }
  const [a = "#E5E5E5", b = "#9A9A9A", c = "#1A1A1A"] = palette;
  const stripeColor =
    textTone === "light" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
  return (
    <div
      className={"relative overflow-hidden " + className}
      style={{
        aspectRatio: ratio === "auto" ? undefined : ratio,
        background: `linear-gradient(135deg, ${a} 0%, ${b} 60%, ${c} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${stripeColor} 0 1px, transparent 1px 14px)`,
        }}
      />
      {label && (
        <div
          className="absolute left-0 right-0 bottom-0 px-2 py-1 text-[10px]"
          style={{
            color: textTone === "light" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export { ERA, MONO, SANS, DISPLAY } from "./tokens";
