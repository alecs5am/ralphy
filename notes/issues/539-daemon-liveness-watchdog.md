# Daemon liveness watchdog + auto-recovery + dead-farm alert

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** high
> **Category:** operations / reliability / content-farm

## Context

`farm doctor` (#530) verifies readiness BEFORE start, and the runner keeps a
PID file + `isFarmAlive()` (`cli/lib/farm/runner.ts`) so a human can check. But
nothing WATCHES a running daemon: if the farm process dies (OOM, unhandled
throw, host reboot) at 3am, ticks silently stop, the calendar goes unfed, and
no one learns until they happen to open the dashboard. Preflight has no runtime
counterpart.

## What

A liveness layer with three parts: a heartbeat the daemon writes each loop
(timestamp + last-tick + next-scheduled), a watchdog that detects a stale
heartbeat or a dead PID and (a) fires a notification (#518) and (b) optionally
auto-restarts under a supervisor policy (docker `restart: unless-stopped`
documented as the deploy default; an in-process supervisor as the non-docker
path), and a `ralphy farm health` verb reporting alive/stale/dead + last tick +
missed-tick count.

## Why it matters

An unattended farm whose failure mode is "silently stops" is worse than one
that crashes loudly — the operator believes it is working. Liveness is the
runtime half of the trust story that #530 only opens.

## Scope / acceptance

- Heartbeat file (`.ralphy/farm/<ws>.heartbeat`) updated every loop with
  {ts, lastTickAt, nextScheduledAt, ticksThisSession}; cheap, append-free
  (overwrite is fine — it is liveness state, not history).
- Watchdog: detects heartbeat older than a configurable threshold (default a
  small multiple of the tick interval) or a dead PID; emits a
  `farm-dead`/`farm-stalled` notification (#518) with the last known state.
- Recovery: document `restart: unless-stopped` as the docker default (#506);
  provide a `--supervise` mode for non-docker hosts that relaunches on exit
  with backoff; a crash loop (N restarts in a window) escalates to a
  notification and stops retrying.
- `ralphy farm health [--workspace <ws>]` (out() contract, non-zero exit when
  dead/stalled for scripted probes / uptime checks).
- Missed-tick accounting: on recovery, the daemon reports how many scheduled
  ticks were missed and does NOT stampede-fire all of them (coalesce to the
  next valid slot per cadence #525).
- Tests: stale-heartbeat detection, dead-PID detection, crash-loop escalation,
  missed-tick coalescing, health verb states.

## Notes

- Sequence after #503/#506/#518.
- Kill switch (#536) and watchdog are complementary: #536 is deliberate stop,
  this is undesired stop — the watchdog must NOT auto-restart a daemon that was
  intentionally frozen (check publish-mode/stop intent before relaunch).
