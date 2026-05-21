import type { SVGProps } from "react";

type IconFn = (p?: SVGProps<SVGSVGElement>) => React.JSX.Element;

const monogram = (letter: string): IconFn => (p = {}) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" opacity="0.18" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontFamily="JetBrains Mono, monospace"
      fontWeight="700"
      fontSize="11"
      fill="currentColor"
    >
      {letter}
    </text>
  </svg>
);

/* Brand-mark icons we ship as static SVGs in /public/brands/.
   These come pre-coloured (e.g. YouTube red, Meta blue, Instagram
   gradient) so we render them via <img>; tinting via currentColor
   doesn't apply. Source: svgl.app (MIT). */
const brandImg = (file: string, alt: string): IconFn => () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={`/brands/${file}`}
    alt={alt}
    width={22}
    height={22}
    style={{ display: "block" }}
    decoding="async"
    loading="lazy"
  />
);

export const I: Record<string, IconFn> = {
  mcp: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M12 8.4L7.5 15.6M12 8.4L16.5 15.6M8 18h8" />
    </svg>
  ),
  cli: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 9l3 3-3 3" />
      <path d="M13 15h6" />
    </svg>
  ),
  skill: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  star: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  ),
  arrowR: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  arrowD: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  ),
  term: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h5" />
    </svg>
  ),
  spark: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" />
    </svg>
  ),
  bolt: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  check: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  vid: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M22 8l-6 4 6 4z" />
    </svg>
  ),
  loop: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  ),
  up: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  ),
  trend: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M22 7l-9.5 9.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  ),
  copy: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  clone: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="13" height="13" rx="2" />
      <rect x="8" y="8" width="13" height="13" rx="2" />
    </svg>
  ),
  heart: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M12 21s-7-4.35-9.5-9.04C.96 8.78 2.43 5 6 5c2.07 0 3.5 1.18 4.5 2.5C11.5 6.18 12.93 5 15 5c3.57 0 5.04 3.78 3.5 6.96C19 16.65 12 21 12 21z" />
    </svg>
  ),
  cmt: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  share: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <path d="M16 6l-4-4-4 4M12 2v15" />
    </svg>
  ),
  play: (p = {}) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...p}>
      <path d="M5 3l16 9-16 9z" />
    </svg>
  ),
  close: (p = {}) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  chevL: (p = {}) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  chevR: (p = {}) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  github: (p = {}) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...p}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.72-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0112 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49C19.14 20.58 22 16.76 22 12.26 22 6.58 17.52 2 12 2z" />
    </svg>
  ),
  discord: (p = {}) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...p}>
      <path d="M20.32 4.37A17 17 0 0016.06 3l-.2.41a13 13 0 014 2 14 14 0 00-7.86-1.79A14 14 0 004.14 5.4a13 13 0 014-2L7.94 3a17 17 0 00-4.26 1.37C.97 8.74.27 13 .62 17.21a17 17 0 005.21 2.65l1.2-1.66a11 11 0 01-1.87-.9c.16-.11.32-.23.47-.36a12 12 0 0010.86 0c.15.13.31.25.47.36-.6.36-1.22.66-1.87.9l1.2 1.66a17 17 0 005.21-2.65c.45-4.9-.72-9.13-2.78-12.84zM8.52 14.73c-1.03 0-1.88-.94-1.88-2.1 0-1.16.83-2.1 1.88-2.1 1.05 0 1.9.94 1.88 2.1 0 1.16-.83 2.1-1.88 2.1zm6.96 0c-1.03 0-1.88-.94-1.88-2.1 0-1.16.83-2.1 1.88-2.1 1.05 0 1.9.94 1.88 2.1 0 1.16-.83 2.1-1.88 2.1z" />
    </svg>
  ),
  x: (p = {}) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  book: (p = {}) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  claude: (props = {}) => (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <rect width="24" height="24" rx="6" fill="#F4ECE4" />
      <g transform="translate(2.4 2.4) scale(0.0742)">
        <path
          fill="#D97757"
          d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
        />
      </g>
    </svg>
  ),
  cursor: (props = {}) => (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <rect width="24" height="24" rx="6" fill="#F4ECE4" />
      <g transform="translate(4 4) scale(0.0343)">
        <path
          fill="#0A0A0B"
          d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
        />
      </g>
    </svg>
  ),
  codex: (props = {}) => (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <rect width="24" height="24" rx="6" fill="#0A0A0B" />
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
      />
    </svg>
  ),
  or: brandImg("openrouter.svg", "OpenRouter"),
  vc: brandImg("vercel.svg", "Vercel"),
  el: monogram("11"),
  rm: brandImg("remotion.svg", "Remotion"),
  gemini: brandImg("gemini.svg", "Gemini"),
  kling: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...p}>
      <path fill="currentColor" d="M5.412 13.775A23.193 23.193 0 017.41 9.32c3.17-5.492 7.795-8.757 10.33-7.294C12.038-1.266 4.598.944 1.122 6.964A13.378 13.378 0 00.085 9.22c-.259.739.092 1.534.77 1.926l4.557 2.63z" />
      <path fill="currentColor" d="M18.588 10.164a23.188 23.188 0 01-1.999 4.455c-3.17 5.492-7.795 8.758-10.33 7.294 5.703 3.293 13.143 1.082 16.619-4.938a13.392 13.392 0 001.037-2.255c.259-.738-.092-1.534-.77-1.925l-4.557-2.63z" />
      <path fill="currentColor" d="M16.59 14.62c3.17-5.492 3.686-11.13 1.15-12.594C15.207.563 10.582 3.83 7.41 9.32c2.074-3.59 5.809-5.315 8.344-3.852 2.534 1.464 2.908 5.56.835 9.151z" />
      <path fill="currentColor" d="M7.41 9.32c-3.17 5.492-3.686 11.13-1.15 12.593 2.534 1.464 7.159-1.802 10.33-7.294-2.074 3.591-5.809 5.316-8.344 3.852-2.534-1.463-2.908-5.56-.835-9.15z" />
    </svg>
  ),
  seedance: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...p}>
      <path fill="currentColor" d="M14.944 18.587l-1.704-.445V10.01l1.824-.462c1-.254 1.84-.461 1.88-.453.032 0 .056 2.235.056 4.972v4.973l-.176-.008c-.104 0-.952-.207-1.88-.446z" />
      <path fill="currentColor" d="M7 16.542c0-2.736.024-4.98.064-4.98.032-.008.872.2 1.88.454l1.816.461-.016 4.05-.024 4.049-1.632.422c-.896.23-1.736.445-1.856.469L7 21.523v-4.98z" />
      <path fill="currentColor" d="M19.24 12.477c0-9.03.008-9.515.144-9.475.072.024.784.207 1.576.406.792.207 1.576.405 1.744.445l.296.08-.016 8.56-.024 8.568-1.624.414c-.888.23-1.728.437-1.856.47l-.24.055v-9.523z" />
      <path fill="currentColor" d="M1 12.509c0-4.678.024-8.505.064-8.505.032 0 .872.207 1.872.454l1.824.461v7.582c0 4.16-.016 7.574-.032 7.574-.024 0-.872.215-1.88.47L1 21.013v-8.505z" />
    </svg>
  ),
  tt: brandImg("tiktok.svg", "TikTok"),
  rl: brandImg("instagram.svg", "Instagram Reels"),
  yt: brandImg("youtube.svg", "YouTube"),
  x_brand: brandImg("x.svg", "X"),
  meta: brandImg("meta.svg", "Meta"),
  amazon: (p = {}) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M14.048 14.693a6.1 6.1 0 0 1-2.051 1.338a5.5 5.5 0 0 1-2.194.186a3 3 0 0 1-2.194-1.162a3.98 3.98 0 0 1 .066-4.531c1.448-1.821 3.85-1.722 5.836-2.04v-1.02a1.448 1.448 0 0 0-1.854-1.34c-.933.154-1.24.626-1.525 1.47c-.088.21-.263.231-.472.187c-.603 0-1.206-.098-1.81-.175c-.285 0-.647-.165-.526-.527c.124-.542.364-1.05.702-1.492a4.56 4.56 0 0 1 3.379-1.722a5.62 5.62 0 0 1 4.3.943a3.83 3.83 0 0 1 1.02 3.204v4.059a2.62 2.62 0 0 0 .592 1.667c.156.16.276.35.352.56a.38.38 0 0 1-.11.384c-.549.46-1.097.932-1.646 1.382a.504.504 0 0 1-.757 0a4.9 4.9 0 0 1-1.108-1.371m-.493-4.388c-1.35.076-3.182.263-3.291 1.974c-.06.475.056.956.329 1.35a1.48 1.48 0 0 0 2.194-.11c.888-.878.779-2.15.724-3.27zm-1.536 9.928A15.04 15.04 0 0 1 2.146 16.6c-.154-.098-.253-.493.055-.384a20.14 20.14 0 0 0 14.92 1.91c.997-.187 1.919-.703 2.895-.878c.867.395-1.24 1.228-1.525 1.448a15.9 15.9 0 0 1-6.472 1.536" />
      <path d="M19.994 16.58c-.592 0-1.042.054-1.59.12c0 0-.121 0-.121-.055c.208-.811 2.808-.998 3.488-.636c.384.208.176.746.143 1.097a4 4 0 0 1-1.207 2.194c-.197.22-.406 0-.263-.208a6.3 6.3 0 0 0 .592-2.063c.044-.493-.735-.395-1.728-.45" />
    </svg>
  ),
};
