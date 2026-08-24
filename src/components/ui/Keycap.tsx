import type { ReactNode } from "react";

/**
 * Handoff 15's socket keycap: one component for every keyboard chord the app prints.
 *
 * The key sits recessed in its surface. Depth is two flat tone steps -- a socket one step below
 * the surface, a face one step above the socket -- and asymmetric padding on the socket, more
 * above the face than below it. Pressing swaps the padding, so the face travels 2px down inside
 * an unchanged bounding box and nothing reflows. No shadow, no gradient, no border, no inset
 * highlight, in any theme: the rejected variant in the handoff is exactly that.
 *
 * The typographic fix is the reason this is a component and not a class string. `⌘ ⇧ ⌥ ⌃` do not
 * exist in AWS Diatype Mono, so a single mono span made the browser substitute a system font
 * mid-string and size, weight and baseline all shifted -- which is what made the old caps look
 * broken. Each glyph is its own span here, and a modifier symbol takes the system stack at half a
 * step down while letters and punctuation stay mono. Weight is 400 throughout: bold made the cap
 * louder than the command it labels.
 */

/** What the cap stands on. The tones come from the surface, not from the theme. */
export type KeycapTone = "surface" | "on-dark" | "on-light";
/** 20 for menus, rows, buttons and fields; 26 for the shortcut recorder. */
export type KeycapSize = "control" | "recorder";

const MODIFIERS = new Set(["⌘", "⇧", "⌥", "⌃", "↩", "⌫", "⌦", "⎋", "⇥", "←", "→", "↑", "↓"]);

/* Socket and face geometry per size. The handoff's formulas resolve to these two pairs: socket
   round(h * .3) + 2, face round(h * .3), face height h - 5, face min-width = socket height, and
   horizontal padding round(h * .34) for a shared socket. */
const SIZES = {
  control: { socket: "h-5 rounded-chip", face: "h-3.75 min-w-5 rounded-key-face px-1.75", glyph: "type-label", symbol: "type-xs" },
  recorder: { socket: "h-6.5 rounded-field", face: "h-5.25 min-w-6.5 rounded-chip px-2.25", glyph: "type-base", symbol: "type-ui" },
} as const;

/* `loud` is rule 4: the cap normally sits a step quieter than its row's text and catches up to
   primary in a selected, hovered or recording row. The light family is already at primary, so its
   loud ink is the same key. */
const TONES = {
  surface: { socket: "bg-keycap-socket", face: "bg-keycap-face", ink: "text-keycap-ink", loud: "text-keycap-ink-pressed" },
  "on-dark": { socket: "bg-keycap-dark-socket", face: "bg-keycap-dark-face", ink: "text-keycap-dark-ink", loud: "text-keycap-dark-ink-loud" },
  "on-light": { socket: "bg-keycap-light-socket", face: "bg-keycap-light-face", ink: "text-keycap-light-ink", loud: "text-keycap-light-ink" },
} as const;

/* The one place colour appears in this component. Red is never selection and never hover. */
const CONFLICT_SOCKET = "bg-alert/13";
const CONFLICT_INK = "text-alert";

export interface KeycapProps {
  /** The chord's glyphs in macOS order, as `chordTokens` prints them. */
  tokens: readonly string[];
  tone?: KeycapTone;
  size?: KeycapSize;
  /** A physical key held, or the pointer down on this cap. Only the recorder drives this. */
  pressed?: boolean;
  /** The row this cap sits in is selected, hovered, or recording, so the ink reaches primary. */
  loud?: boolean;
  conflict?: boolean;
  /** One socket per key instead of one per chord: the recorder and teaching surfaces. */
  split?: boolean;
  className?: string;
}

function Glyphs({ tokens, size }: { tokens: readonly string[]; size: KeycapSize }) {
  const step = SIZES[size];
  return <>
    {tokens.map((token, index) => <span
      className={MODIFIERS.has(token) ? `font-glyph ${step.symbol} leading-none` : `font-code ${step.glyph} tracking-code leading-none`}
      key={`${token}-${index}`}
    >{token}</span>)}
  </>;
}

function Socket({ tone, size, pressed, loud, conflict, className, children }: {
  tone: KeycapTone;
  size: KeycapSize;
  pressed: boolean;
  loud: boolean;
  conflict: boolean;
  className?: string;
  children: ReactNode;
}) {
  const step = SIZES[size];
  const paint = TONES[tone];
  return <span
    /* The padding is the depth. Swapping it on press is what moves the face without moving the
       cap, so a row of caps never jumps while one of them is held. `transition-all` rather than the
       handoff's `padding, background`: a two-property list has no named utility, and the arbitrary
       count in this repo is a ratchet that only goes down. Nothing else on this element changes
       except the width when the chord itself does, and at 90ms that reads as the cap growing. */
    /* Nudged down by one. The recess is asymmetric -- 1.5 above the face, 3.5 below -- so the face
       sits a pixel above the socket's own box centre, and centring the socket in a row put the key
       a pixel above the label beside it. A transform rather than a margin: the socket's box is what
       the row lays out, and the face is what the eye reads. */
    className={`keycap-socket inline-flex translate-y-px flex-none items-start px-keycap-lift ${step.socket} ${
      pressed ? "pt-keycap-drop pb-keycap-lift" : "pt-keycap-lift pb-keycap-drop"} ${
      conflict ? CONFLICT_SOCKET : paint.socket} transition-all duration-fast ease-instrument ${className ?? ""}`}
  >
    <span className={`keycap-face inline-flex flex-none items-center justify-center gap-0.75 ${step.face} ${
      conflict ? CONFLICT_SOCKET : pressed ? "bg-keycap-face-pressed" : paint.face} ${
      conflict ? CONFLICT_INK : pressed || loud ? paint.loud : paint.ink}`}
    >{children}</span>
  </span>;
}

export function Keycap({ tokens, tone = "surface", size = "control", pressed = false, loud = false, conflict = false, split = false, className }: KeycapProps) {
  /* Not set: an empty socket and face, wider than a single key so the row still has something to
     click. Never the word "None", and never a dashed outline -- the system has no borders. */
  if (!tokens.length) return <Socket tone={tone} size={size} pressed={false} loud={loud} conflict={conflict} className={className}>
    <span className={size === "recorder" ? "w-9" : "w-6"} aria-hidden="true" />
  </Socket>;

  /* One socket per key is the hardware reading: stronger, and noisier in a dense list. It is the
     recorder's shape, where the chord is being assembled key by key. */
  if (split) return <span className={`keycap-split inline-flex flex-none items-center gap-0.75 ${className ?? ""}`}>
    {tokens.map((token, index) => <Socket tone={tone} size={size} pressed={pressed} loud={loud} conflict={conflict} key={`${token}-${index}`}>
      <Glyphs tokens={[token]} size={size} />
    </Socket>)}
  </span>;

  return <Socket tone={tone} size={size} pressed={pressed} loud={loud} conflict={conflict} className={className}>
    <Glyphs tokens={tokens} size={size} />
  </Socket>;
}
