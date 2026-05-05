import type { CSSProperties } from "react";

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

const stroke = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const SearchIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const PanelIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="M9 4v16" />
  </svg>
);
export const PlusIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const XIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const ChevronIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const ArrowIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const GridIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="4" y="4" width="7" height="7" />
    <rect x="13" y="4" width="7" height="7" />
    <rect x="4" y="13" width="7" height="7" />
    <rect x="13" y="13" width="7" height="7" />
  </svg>
);
export const ListIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const CheckIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="m5 12 4 4 10-10" />
  </svg>
);
export const TerminalIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="m7 9 3 3-3 3M13 15h4" />
  </svg>
);
export const ProjectIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M3 7h18v12H3zM3 7l3-3h5l2 3" />
  </svg>
);
export const BrandIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18" />
  </svg>
);
export const PersonaIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <circle cx="12" cy="9" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </svg>
);
export const RefIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);
export const BatchIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);
export const TemplateIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="3" width="18" height="18" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);
export const ImageIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="3" width="18" height="18" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);
export const FilmIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
  </svg>
);
export const MusicIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
export const PlayIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
  </svg>
);
export const DownloadIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M12 4v12m-5-5 5 5 5-5M4 20h16" />
  </svg>
);
export const ExternalIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M14 4h6v6M10 14 20 4M19 13v7H4V5h7" />
  </svg>
);
export const InfoIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.01M12 11v5" />
  </svg>
);
export const SparklesIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M12 4v4m0 8v4m-8-8h4m8 0h4m-3-5-2 2m-6 6-2 2m0-10 2 2m6 6 2 2" />
  </svg>
);
export const WandIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="m4 20 12-12m0 0 3-3m-3 3 3 3M8 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
  </svg>
);
export const FileJsonIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="M14 3H6v18h12V8z" />
    <path d="M14 3v5h4M9 14a2 2 0 0 0 0 4M15 14a2 2 0 0 1 0 4" />
  </svg>
);
export const ChecksIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <path d="m3 12 4 4 7-7M9 16l4 4 8-8" />
  </svg>
);
export const SplitIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...stroke(size)} {...p}>
    <rect x="3" y="3" width="18" height="18" />
    <path d="M12 3v18" />
  </svg>
);

export const SECTION_ICONS = {
  projects: ProjectIcon,
  templates: TemplateIcon,
  brands: BrandIcon,
  personas: PersonaIcon,
  refs: RefIcon,
  batches: BatchIcon,
} as const;

export const TAB_ICONS = {
  project: ProjectIcon,
  brand: BrandIcon,
  persona: PersonaIcon,
  ref: RefIcon,
  refs: RefIcon,
  batch: BatchIcon,
  template: TemplateIcon,
  terminal: TerminalIcon,
} as const;
