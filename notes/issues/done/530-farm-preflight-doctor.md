# Farm preflight readiness (`ralphy farm doctor`)

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** high
> **Category:** operations / reliability / content-farm

## Context

`ralphy doctor` is not farm-aware (no connector/publish/Postiz/bundle checks),
and `workflow simulate` (#516) answers COST + missing generation keys — not
whether the deployment is actually LIVE and AUTHORIZED to publish. Pressing
"start" (#503/#506) on a server today can succeed structurally and then fail
at the publish edge at 2am because a Postiz account was never connected or an
article target repo is unreachable.

## What

A deployment-liveness preflight — `ralphy farm doctor [--workspace <ws>]` —
that verifies everything an unattended run needs, distinct from simulate's
cost view: generation connector keys present + a cheap validity ping; publish
targets AUTHORIZED (Postiz accounts connected per target platform;
GitHub-Pages repo writable; dev.to/Hashnode keys valid — #527); bundle parses
+ `workflow lint` green + #497 coverage satisfied by installed providers;
budget caps configured (#481); calendar has resolvable slots (#504); trust
level explicitly set (#505); notifier reachable (#518); disk headroom, ffmpeg,
bun. Output is a green/amber/red readiness verdict with per-check `{id,
status, detail, fix}`.

## Why it matters

"Start" is an act of trust. A single red/amber report the operator reads
before walking away converts the farm's worst failure class (silent
publish-edge death overnight) into a pre-flight refusal with a concrete fix.

## Scope / acceptance

- `ralphy farm doctor` verb (out() contract; non-zero exit on any red check
  for CI/scripted use).
- Checks grouped: providers, publish targets, bundle/coverage, budget,
  calendar, trust, notifier, host env. Each returns `{id, status:
  ok|warn|fail, detail, fix}`.
- Auth pings are cheap + read-only (no paid generation, no test post); a
  target that cannot be verified without a write returns `warn` with the
  manual-verify step, never a false `ok`.
- `farm start` in unattended mode runs doctor first and refuses on any `fail`
  unless `--skip-preflight "<reason>"` (logged).
- Dashboard (#506) surfaces the report via the app API.
- Tests: each check against fixtures (missing key, unconnected Postiz account,
  unwritable repo, unset trust, bad coverage), verdict aggregation, start
  refusal path.

## Notes

- Sequence after #506; composes with #516 (simulate = cost, doctor =
  liveness) and #534 (quota headroom is a doctor check).
