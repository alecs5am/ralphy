# Publishing kill switch and safe-mode pause

> **Status:** todo
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** high
> **Category:** operations / safety / content-farm

## Context

The farm publishes to real accounts unattended. Budget-guard (#481) halts
SPENDING and dead-letter (#519) parks failures, but there is no single, fast
operator control to stop the OUTWARD action — publishing — across everything,
independent of production. If something embarrassing or off-policy is about to
go out (or already started), the operator needs a big red button, not a scramble
to stop N workspaces.

## What

A publishing kill switch with two levels: `safe-mode` (keep producing +
gating, but route ALL publishes to the approval queue regardless of trust
level — nothing auto-posts) and `freeze` (halt publishing entirely; scheduled
posts are held). Operable instantly from CLI + dashboard, scoped global or
per-workspace. Auto-trip on anomaly signals — spend spike, mass node failure,
a policy/claims gate breach (#442) at scale — into safe-mode with a
notification (#518). Resume is always an explicit human action; the reason and
actor are logged.

## Why it matters

Unattended outward automation without an instant, reliable stop is
irresponsible — this is table stakes for trusting L1/L2. Auto-tripping into
safe-mode (produce, don't post) rather than full stop keeps the farm useful
while a human investigates.

## Scope / acceptance

- State: `publish-mode: normal | safe | freeze` per workspace + a global
  override; the global wins; persisted so a daemon restart honors it.
- Enforcement in the publish path (#501/#527): `safe` forces the approval
  queue (bypasses trust auto-publish #505); `freeze` blocks + holds; both
  journal the reason.
- Operability: `ralphy farm safe-mode|freeze|resume [--workspace <ws>]` +
  dashboard toggles (#506); resume requires an explicit confirm + logs
  actor/reason.
- Auto-trip rules (configurable, conservative defaults): spend-rate spike vs
  budget (#481), failure-rate spike (#519), policy-gate breach (#442) — trip
  to `safe`, notify (#518), never auto-resume.
- Interplay: idempotency (#531) ensures held posts released after resume are
  not duplicated; cadence times are preserved, not resampled, on release.
- Tests: mode enforcement per level, global-vs-workspace precedence,
  auto-trip on each signal, restart persistence, explicit-resume gate,
  no-duplicate-on-release.

## Notes

- Sequence after #501/#505/#506; auto-trip signals reuse #481/#519/#442.
- This is the operator safety counterpart to the trust ladder: the ladder
  grants autonomy, the kill switch revokes it instantly.
