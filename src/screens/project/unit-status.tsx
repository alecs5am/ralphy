import type { UnitLifecycle } from "../../lib/unit-lifecycle";

/**
 * A Unit's lifecycle, as a pill.
 *
 * The grid and the viewer each had one of these, and they had drifted: the same markup, the same
 * dot, one plate written as `bg-chip` and the other as `bg-ink/13`, and one of the two missing the
 * `idle` tone entirely. The pill carries its tone on the dot -- the label already names the state,
 * so the copy stays readable ink rather than turning into a colour.
 */

const DOT: Record<string, string> = {
  ok: "bg-ink",
  warn: "bg-muted",
  danger: "bg-alert",
  idle: "bg-unreviewed",
};

export const UNIT_STATUS_PILL = "inline-flex h-5 items-center gap-1.5 rounded-control bg-chip px-2 type-mono-md whitespace-nowrap text-ink";

export function UnitStatus({ lifecycle }: { lifecycle: UnitLifecycle }) {
  return <span className={`unit-status status-${lifecycle.tone} ${UNIT_STATUS_PILL}`}>
    <span className={`size-1.25 flex-none rounded-full ${DOT[lifecycle.tone] ?? "bg-muted"}`} aria-hidden="true" />
    {lifecycle.label}
  </span>;
}
