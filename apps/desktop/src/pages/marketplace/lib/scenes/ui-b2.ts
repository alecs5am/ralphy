/**
 * Remocn scenes for the ui-b2 shard: `toast` and `switch`.
 *
 * Both run the `useStateTransition` machine: two style presets and one scalar `t`, with every
 * numeric channel lerped and every colour channel mixed in OKLCH. `easings.out` is not embedded in
 * the catalog and is ease-out cubic, `cubic-bezier(0.33, 1, 0.68, 1)`. `useRemocnTheme`'s light
 * token set is not embedded either; it is the stock shadcn neutral ramp, transcribed as hex below.
 *
 * Neither component positions itself upstream -- `Toast` is a bare row and `Switch` centres itself
 * in a transparent stage -- so the surface behind each one is chosen here, and it is `theme.muted`
 * for the toast so that a `popover`-white row reads as a raised surface rather than as nothing.
 */
import { stage } from "./shared";
import { scene, type SceneSpec } from "./types";

/**
 * Three channels, one 12-frame (0.4 s) tween, `transform-origin: bottom center`: opacity 0 -> 1,
 * `translateY(16px) -> 0` and `scale(0.97) -> 1`. The exit re-targets the same hook at
 * `toastStyle("hidden")`, so it drops and shrinks on the way out rather than simply fading.
 *
 * `title` is the one required prop with no default upstream, so the scene's own title control
 * drives it. All three icon variants are drawn from the embedded SVG paths; the default variant is
 * the info circle in `mutedForeground`, and the success tone is upstream's literal
 * `oklch(0.6 0.17 150)` converted to sRGB.
 */
export const toast = scene({
  id: "toast",
  group: "ui",
  shard: "ui-b2",
  stage: { w: 480, h: 270 },
  params: { state: "hidden", variant: "default" },
  palette: {
    text: "#0a0a0a", bg: "#f5f5f5", panel: "#ffffff", border: "#e5e5e5",
    muted: "#737373", ok: "#009b44", bad: "#e7000b", shadow: "#0000001a",
  },
  motion: { kind: "cycle", seconds: 2.45, hold: 0.55 },
  still: 0.4,
  markup: (ctx, p) => {
    const variant = String(p.variant);
    const glyph = variant === "success"
      ? `<path d="M8 12.5l2.6 2.6L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : variant === "error"
        ? `<path d="M12 7.5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.1" fill="currentColor"/>`
        : `<path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/>`;
    return stage(
      `<div class="rv-toast" data-state="${ctx.esc(String(p.state))}">`
      + `<span class="rv-ico rv-ico-${ctx.esc(variant)}"><svg viewBox="0 0 24 24" fill="none">`
      + `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>${glyph}</svg></span>`
      + `<div class="rv-col"><span class="rv-ttl">${ctx.title}</span></div></div>`);
  },
});

/**
 * Two channels over a 10-frame (0.333 s) tween: `thumbOffset` 0 -> 1 against the derived
 * `travel = trackW - thumb - 2 * pad` (20px at the default size), and the track background from
 * `theme.input` to `theme.primary`. The colour is mixed in OKLCH upstream, so the track animates a
 * registered `<number>` custom property that feeds a `color-mix(in oklch, ...)` rather than
 * interpolating two hex stops through sRGB.
 *
 * `label` has no default upstream, so the scene's own title control supplies it -- a bare 44x24
 * track is the whole component otherwise, and every call site in the catalog passes a label.
 */
export const switchControl = scene({
  id: "switch",
  group: "ui",
  shard: "ui-b2",
  stage: { w: 192, h: 108 },
  params: { state: "unchecked", size: "default" },
  palette: {
    text: "#0a0a0a", bg: "#ffffff", accent: "#171717",
    track: "#e5e5e5", thumb: "#ffffff", shadow: "#00000026",
  },
  motion: { kind: "cycle", seconds: 1.94, hold: 0.46 },
  still: 0.45,
  markup: (ctx, p) => {
    const sizes: Record<string, readonly [track: number, height: number, thumb: number, pad: number, fontSize: number, gap: number]> = {
      sm: [36, 20, 16, 2, 13, 8], default: [44, 24, 20, 2, 15, 10], lg: [52, 28, 24, 2, 17, 12],
    };
    const [track, height, thumb, pad, fontSize, gap] = sizes[String(p.size)] ?? sizes.default;
    return stage(
      `<span class="rv-group" data-state="${ctx.esc(String(p.state))}" style="--gap:${gap}em;--fs:${fontSize}">`
      + `<span class="rv-track" style="--tw:${track}em;--th:${height}em">`
      + `<span class="rv-thumb" style="--tb:${thumb}em;--pad:${pad}em;--travel:${track - thumb - pad * 2}em"></span>`
      + `</span><span class="rv-label">${ctx.title}</span></span>`);
  },
});

export const uiB2: readonly SceneSpec[] = [toast, switchControl];
