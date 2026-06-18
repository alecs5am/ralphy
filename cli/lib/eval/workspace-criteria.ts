// Built-in deterministic validators for the per-workspace evaluator framework.
//
// STUB (#469). The runner (#469) looks up a `check: "deterministic"` criterion's
// `validatorId` in the registry (`registerWorkspaceValidator` in
// `cli/lib/eval/workspace-evaluators.ts`) and runs it; an UNREGISTERED id is
// surfaced as one `info` finding and the criterion is marked `na` — so the
// framework ships and tests pass with NO real validators wired.
//
// #470 implements the 6 builtin validators here (freeze-on-fork, plate-opacity,
// aspect-fit, scene-duration-band, etc.) and registers each via
// `registerWorkspaceValidator(id, fn)`. Until then this is intentionally empty:
// the runner calls `registerBuiltinWorkspaceValidators()` once at start, which
// is a no-op, and every deterministic criterion takes the `na` path.

export function registerBuiltinWorkspaceValidators(): void {
  // #470 implements the 6 builtin validators here.
}
