// Opt-in switch back to the pre-audit gate severities (#569).
//
// The October 2026 gate audit (docs/research/gate-audit-2026-10.md) relaxed or
// made advisory the checks whose stored findings were format choices or
// measurement artifacts rather than defects: the cut-based hook-zone check, the
// "not exactly 1080x1920" resolution warning, keyframe-only vision fails, the
// too-short check on word-level caption tracks, the platform maximum-resolution
// fail, and the scenario gate's universal hook word cap. Setting
// RALPHY_EVAL_STRICT_RUBRIC=1 restores the previous severities for one release so
// a maintainer can compare both readings on the same project before the old
// behavior is removed. Measurement fixes (counting caption words instead of
// caption entries, ignoring intermediate artifacts in the platform gate) are not
// reverted by this switch.
//
// Since #583 the switch also restores the previous full-video ship aggregation:
// the raw full-video sub-check severities (no hook-window or detail caps) and the
// generic `score()` verdict, where two warns make a warn. See
// full-video-verdict.ts. The guard that keeps an errored or unparseable
// full-video pass from reading as `pass` is a bug fix and stays on.

export const STRICT_RUBRIC_ENV = "RALPHY_EVAL_STRICT_RUBRIC";

/** True when the environment opts back into the pre-audit severities. */
export function strictRubricEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env[STRICT_RUBRIC_ENV];
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}
