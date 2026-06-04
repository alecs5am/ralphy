// Shared inline icons for the library redesign (ported from the prototype's
// components.jsx). Pure presentational SVGs — no client directive needed.

function Ic({ d, w = 16, vb = 16, fill = false, sw = 1.5 }: { d: string; w?: number; vb?: number; fill?: boolean; sw?: number }) {
  return (
    <svg width={w} height={w} viewBox={`0 0 ${vb} ${vb}`} fill="none" aria-hidden>
      <path
        d={d}
        stroke={fill ? "none" : "currentColor"}
        fill={fill ? "currentColor" : "none"}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
export const PlayIcon = ({ s = 16 }: { s?: number }) => <Ic d="M6 4l9 5-9 5V4Z" fill w={s} vb={18} />;
export const PauseIcon = ({ s = 16 }: { s?: number }) => <Ic d="M6 4h2.5v10H6zM9.5 4H12v10H9.5z" fill w={s} vb={18} />;
export const ChevDown = ({ s = 18 }: { s?: number }) => <Ic d="M4.5 6.5L9 11l4.5-4.5" w={s} vb={18} sw={1.6} />;
export const CloseIcon = ({ s = 18 }: { s?: number }) => <Ic d="M4 4l10 10M14 4L4 14" w={s} vb={18} sw={1.7} />;
export const CopyIcon = () => <Ic d="M3.5 1.5h7v9h-7zM2 4v7.5A1.5 1.5 0 0 0 3.5 13H9" w={12} vb={14} sw={1.4} />;
export const CheckIcon = () => <Ic d="M2.5 7.5L5.5 10.5L11.5 4" w={12} vb={14} sw={1.6} />;
export const RemixIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M3 3v4h4M13 13V9H9M12.5 5A5 5 0 0 0 4 4.5M3.5 11A5 5 0 0 0 12 11.5" w={s} vb={16} sw={1.5} />
);
export const PrevIcon = () => <Ic d="M11 4.5L6.5 9l4.5 4.5" w={18} vb={18} sw={1.7} />;
export const NextIcon = () => <Ic d="M7 4.5L11.5 9 7 13.5" w={18} vb={18} sw={1.7} />;
export const OpenIcon = ({ s = 13 }: { s?: number }) => <Ic d="M3 8h10M9 4l4 4-4 4" w={s} vb={16} sw={1.6} />;
export const PlusIcon = ({ s = 14 }: { s?: number }) => <Ic d="M8 3v10M3 8h10" w={s} vb={16} sw={1.7} />;
export const SwapIcon = ({ s = 14 }: { s?: number }) => <Ic d="M4 6h8l-2.2-2.2M12 10H4l2.2 2.2" w={s} vb={16} sw={1.5} />;
export const PinIcon = ({ s = 11 }: { s?: number }) => <Ic d="M8 2v5M8 7l-2 4h4l-2-4M8 11v3" w={s} vb={16} sw={1.4} />;
export const UploadIcon = ({ s = 16 }: { s?: number }) => <Ic d="M8 11V3M5 6l3-3 3 3M3 11v2.5h10V11" w={s} vb={16} sw={1.5} />;
export const SparkIcon = ({ s = 14 }: { s?: number }) => (
  <Ic d="M8 2l1.4 4.2L13.6 8 9.4 9.8 8 14l-1.4-4.2L2.4 8l4.2-1.8z" w={s} vb={16} sw={1.4} />
);

// ── Recipe-kind icons (#082) — one distinct glyph per recipeKind so a recipe
// chip / page reads its treatment class at a glance. Small inline SVGs, same
// stroked style as the set above. ──────────────────────────────────────────

/** ffmpeg — clapperboard / filtergraph. */
export const FfmpegIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M2 6h12v7.5H2zM2 6l1.5-3h2L4 6M6.5 3l-1.5 3M9.5 3L8 6M12.5 3L11 6" w={s} vb={16} sw={1.4} />
);
/** encode — compression gauge. */
export const EncodeIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M2.5 11a5.5 5.5 0 1 1 11 0M8 11l3-3" w={s} vb={16} sw={1.5} />
);
/** overlay — stacked layers. */
export const OverlayIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M8 2.5l5.5 3-5.5 3-5.5-3zM2.5 9l5.5 3 5.5-3M2.5 12l5.5 3 5.5-3" w={s} vb={16} sw={1.4} />
);
/** bake — merge arrows into one. */
export const BakeIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M3 2.5v3a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v3M6 11l-3 3-3-3M10 11l3 3 3-3" w={s} vb={16} sw={1.4} />
);
/** hyperframes — play in a frame (the live-runnable one). */
export const FramesIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M2.5 3.5h11v9h-11zM6.5 6l3.5 2.5L6.5 11z" w={s} vb={16} sw={1.4} />
);
/** prompt — quote / text spark. */
export const PromptIcon = ({ s = 13 }: { s?: number }) => (
  <Ic d="M3 4.5h7M3 8h10M3 11.5h6M13 9.5l.7 1.8L15.5 12l-1.8.7L13 14.5l-.7-1.8L10.5 12l1.8-.7z" w={s} vb={16} sw={1.3} />
);
