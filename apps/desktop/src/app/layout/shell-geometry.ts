/**
 * The shell's arithmetic: how wide each column may be, and when a column gives way.
 *
 * Every number here is a floor or a ceiling with a reason, and none of them is a design
 * preference the operator can override -- a width they dragged is theirs, but a width that would
 * make a column unusable is not. Keeping the arithmetic pure is what lets it be read, and checked,
 * without mounting the shell.
 */
import { VIEW_PANEL_MIN } from "@/widgets/view-panel";

export const DOCK_WINDOW_MIN = 1_280;
export const DOCK_DESK_MIN = 680;
export const RIGHT_RAIL_MIN = 292;
const RIGHT_RAIL_DEFAULT = 360;
/* The window's own chrome between the frame edge and the two content columns: 4 of desk on each
   side, plus the zone gap after the sidebar and the one between the content and agent. */
const VIEW_CHROME = 16;
const RIGHT_RAIL_MAX = 1_000;
const LEFT_MIN = 216;
const LEFT_MAX = 420;
const LEFT_DEFAULT = 260;

export function clampWidth(requested: number, min: number, max: number, fallback: number): number {
  const value = Number.isFinite(requested) ? Math.round(requested) : fallback;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export interface ShellDimensions {
  frameWidth: number;
  deskWidth: number;
  deskHeight: number;
}

/**
 * Resolve every column width from the frame the shell was measured at.
 *
 * `railDocked` is the rail's current mode, not the one being computed: whether the desk still
 * clears its minimum depends on whether the rail is already taking width out of it.
 */
export function shellColumns({ dimensions, leftVisible, leftWidth, rightWidth, railDocked, chatLens = false }: {
  dimensions: ShellDimensions;
  leftVisible: boolean;
  leftWidth: number;
  rightWidth: number;
  viewWidth: number;
  railDocked: boolean;
  chatLens?: boolean;
}) {
  const left = clampWidth(leftWidth, LEFT_MIN, LEFT_MAX, LEFT_DEFAULT);
  const leftColumn = leftVisible ? left : 0;
  // The rail may not eat the desk: its ceiling is whatever is left after the sidebar and the
  // desk minimum, so dragging wide on a narrow window cannot silently flip it to overlay.
  const contentRoom = dimensions.frameWidth - leftColumn - VIEW_CHROME;
  const railMax = Math.max(
    RIGHT_RAIL_MIN,
    Math.min(RIGHT_RAIL_MAX, chatLens ? contentRoom - VIEW_PANEL_MIN : dimensions.frameWidth - leftColumn - DOCK_DESK_MIN),
  );
  const railWidth = clampWidth(rightWidth, RIGHT_RAIL_MIN, railMax, chatLens ? RIGHT_RAIL_DEFAULT : RIGHT_RAIL_MIN);
  const dockedDeskWidth = railDocked ? dimensions.deskWidth : dimensions.deskWidth - railWidth;
  return {
    leftWidth: left,
    leftColumn,
    railMax,
    railWidth,
    dockEligible: dimensions.frameWidth >= DOCK_WINDOW_MIN && dockedDeskWidth >= DOCK_DESK_MIN,
    viewPanelFits: contentRoom >= VIEW_PANEL_MIN + RIGHT_RAIL_MIN,
    /* The same bounds the widths were clamped against, so a resize grabber and the clamp cannot
       disagree about where a drag runs out of travel. */
    bounds: {
      left: { min: LEFT_MIN, max: LEFT_MAX, fallback: LEFT_DEFAULT },
      rail: { min: RIGHT_RAIL_MIN, max: railMax, fallback: chatLens ? RIGHT_RAIL_DEFAULT : RIGHT_RAIL_MIN },
    },
  };
}
