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
