import type { CSSProperties } from "react";

/**
 * Handoff 17's agent mark: one 7x7 LED panel wherever the agent appears, with state carried by
 * which cells burn and how the light runs. The cells never move -- a two-arm spiral of light
 * turns around a bright core, so the figure reads as a whirlpool rather than as a spinner.
 *
 * Colour is always `currentColor`: the inverted mark on a dark pill and the red failed mark are
 * the same component under a different ink. The animation is per-cell inline style because every
 * cell needs its own delay, and a `--delay` custom property per cell would be the same value in
 * a longer form.
 */

export type AgentMarkMode = "idle" | "working" | "waiting" | "failed" | "static";

/* Cell centres on the 24-unit grid: seven cells of 2.35 with the same gap, centred. */
const CELLS = [0, 1, 2, 3, 4, 5, 6];
const origin = (index: number): number => 1.675 + index * 3.05;

/* Idle turns once every 3.4s and work once every 1.3s. These are the mark's own physics rather
   than the UI's motion scale, which names hover, state change and panel -- none of which is a
   continuous rotation. */
const DURATION = { idle: 3.4, working: 1.3 } as const;

function paint(row: number, column: number, mode: AgentMarkMode): CSSProperties {
  const dx = origin(column) + 1.175 - 12;
  const dy = origin(row) + 1.175 - 12;
  const radius = Math.hypot(dx, dy) / 13.1;
  const angle = Math.atan2(dy, dx);
  /* The frozen spiral. It is also every animated cell's *declared* opacity, so a cell whose
     animation is switched off under `prefers-reduced-motion` lands on the static mode the
     handoff asks for rather than on a flat dim grid -- and while the animation runs its own
     keyframes set opacity from 0%, so the live mark is unchanged. */
  const band = ((((angle + radius * 5.2) % Math.PI) + Math.PI) % Math.PI) / Math.PI;
  const still = radius < 0.18 ? 1
    : radius > 0.82 ? 0.14
      : band < 0.5 ? Math.max(0.5, 0.95 - radius * 0.4) : 0.42;
  if (mode === "failed") return { opacity: column === row || column + row === 6 ? 1 : 0.12 };
  if (mode === "static") return { opacity: still };
  if (mode === "waiting") {
    return radius < 0.42
      ? {
        opacity: still,
        animation: "agent-mark-pulse 1.6s ease-in-out infinite",
        /* The core leads and its ring follows, which is what makes the pulse a heartbeat
           rather than a whole-mark blink. */
        animationDelay: radius < 0.18 ? "0s" : "0.22s",
      }
      : { opacity: 0.12 };
  }
  if (radius < 0.18) return { opacity: 1 };
  const duration = DURATION[mode];
  /* The angle is negated so the light runs clockwise. SVG's y grows downward, so a phase that
     rises with `atan2(dy, dx)` sends the bright cell counter-clockwise on screen. The radial
     term is what bends the run into arms instead of a spoke. */
  const phase = ((-angle / Math.PI + radius * 1.1) % 1 + 1) % 1;
  return {
    opacity: still,
    animation: `agent-mark-swirl-${radius < 0.82 ? "core" : "corner"} ${duration}s linear infinite`,
    animationDelay: `${-phase * duration}s`,
  };
}

export function AgentMark({
  mode = "static",
  size = 16,
  className = "",
}: {
  mode?: AgentMarkMode;
  size?: number;
  className?: string;
}) {
  return <svg
    className={`agent-mark is-${mode} block flex-none ${className}`.trim()}
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
  >
    {CELLS.map((row) => CELLS.map((column) => <rect
      className="agent-mark-cell"
      x={origin(column)}
      y={origin(row)}
      width={2.35}
      height={2.35}
      rx={0.6}
      fill="currentColor"
      style={paint(row, column, mode)}
      key={`${column},${row}`}
    />))}
  </svg>;
}
