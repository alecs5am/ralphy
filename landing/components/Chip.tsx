import type { ReactNode } from "react";

/* Per-brand icon tint for inline currentColor SVGs. The <img>-loaded
 * brand SVGs already carry their authentic colours, so these only
 * affect inline SVGs. Default tint is the violet accent. Muted chips
 * override every icon back to mute and desaturate <img> icons. */
const BRAND_TINT: Record<string, string> = {
  el: "var(--color-ink)",
  kling: "#FF7A00",
  seedance: "var(--color-ink)",
  amazon: "#FF9900",
};

export function Chip({
  children,
  icon,
  brand,
  muted = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  brand?: string;
  muted?: boolean;
}) {
  const iconColor = muted ? "var(--color-mute)" : brand ? BRAND_TINT[brand] ?? "var(--color-vio)" : "var(--color-vio)";
  return (
    <span
      className={`inline-flex items-center gap-2.5 py-2.5 px-[18px] max-[700px]:py-[9px] max-[700px]:px-4 rounded-full font-mono text-[14px] max-[700px]:text-[13.5px] leading-[1.25] transition-[background,transform] duration-[160ms] ${
        muted ? "bg-transparent text-mute" : "bg-bg-2 text-ink-2"
      } ${icon ? "has-[img]:hover:-translate-y-px" : ""}`}
    >
      {icon && (
        <span
          className={`inline-flex items-center justify-center w-[22px] h-[22px] max-[700px]:w-5 max-[700px]:h-5 shrink-0 [&_svg]:w-[22px] [&_svg]:h-[22px] max-[700px]:[&_svg]:w-5 max-[700px]:[&_svg]:h-5 [&_svg]:block [&_img]:w-[22px] [&_img]:h-[22px] max-[700px]:[&_img]:w-5 max-[700px]:[&_img]:h-5 [&_img]:block ${
            muted ? "[&_img]:[filter:saturate(0)_opacity(0.55)]" : ""
          }`}
          style={{ color: iconColor }}
        >
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
