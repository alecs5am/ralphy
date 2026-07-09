# Farm liveness signal for container orchestration

> **Status:** done — 2026-07-09 (heartbeat file written each loop scan; `ralphy farm health` probe with alive/stalled/dead/stopped states + 0/1 exit codes; frozen/`farm stop` reports `stopped` (exit 0) so the healthcheck doesn't fight an intentional stop; `--notify-on-fail` fires #518 once per healthy→unhealthy transition via a sidecar; docker `farm` service HEALTHCHECK added; missed-tick coalescing verified already-present. No in-process supervisor — NON-GOALS respected.)
> **Filed:** 2026-07-08 (rewritten 2026-07-08 — scoped down to a health signal;
> lifecycle is the container runtime's job, see Notes)
> **Folder:** issues
> **Severity:** high
> **Category:** operations / reliability / content-farm

## Context

`farm doctor` (#530) verifies readiness BEFORE start; the runner keeps a PID
file + `isFarmAlive()` (`cli/lib/farm/runner.ts`). `ralphy farm start` is
already a FOREGROUND process ("background it yourself or docker run it") — so in
the intended deployment (`docker compose up` on a server) the CONTAINER RUNTIME
owns the process lifecycle. What is missing is the piece that lets that runtime,
and the operator, KNOW the farm is actually ticking: if the process wedges
(deadlock, stalled tick) or dies at 3am, ticks silently stop and no one learns
until they open the dashboard.

The job here is to expose a LIVENESS SIGNAL, not to build a supervisor. Docker
`restart: unless-stopped` already restarts a dead process; `HEALTHCHECK`
already probes health. ralphy must feed those, not reimplement them.

## What

Two small things:

1. **Heartbeat** — the farm loop writes a heartbeat each iteration (last-tick,
   next-scheduled, ticks-this-session). Cheap, overwrite-in-place (liveness
   state, not history).
2. **`ralphy farm health`** — reads the heartbeat + PID and exits 0 (alive),
   non-zero (dead/stalled: heartbeat older than a configurable multiple of the
   tick interval, or dead PID). This is the probe a Docker `HEALTHCHECK`, a
   systemd watchdog, or an external uptime check calls.

The dead-farm alert is then just: an unhealthy probe fires the existing
notifier (#518) — driven either by the container marking the service unhealthy
or by a lightweight external check hitting `farm health`. No new long-running
process inside ralphy.

## Why it matters

An unattended farm whose failure mode is "silently stops" is worse than one
that crashes loudly — the operator believes it is working. A health probe is
the runtime half of the trust story #530 opens, and it slots directly into the
orchestration the deployment already has, instead of adding a second thing to
supervise.

## Scope / acceptance

- Heartbeat file (`.ralphy/farm/<ws|daemon>.heartbeat`) updated every loop with
  {ts, lastTickAt, nextScheduledAt, ticksThisSession}; overwrite, not append.
- `ralphy farm health [--workspace <ws>]` — out() contract, exit 0 alive /
  non-zero dead|stalled, with the last-known state in the payload. Stall
  threshold configurable (default a small multiple of the shortest tick
  interval).
- Deploy wiring (documented + in the #506 compose): the landed
  `docker/docker-compose.yml` already gives the `farm` service
  `restart: unless-stopped` (so a DEAD process is already auto-restarted) but —
  unlike the `studio` service — has NO `healthcheck`, so a WEDGED-but-alive
  daemon (stalled tick, deadlock) is never noticed. This issue adds the missing
  `HEALTHCHECK` on the `farm` service, wired to `ralphy farm health`. ralphy
  ships NO in-process supervisor / self-relaunch / crash-loop manager — that is
  explicitly the container runtime's responsibility (call it out so no one adds
  it back).
- Alert path: on an unhealthy transition, fire the #518 notifier once (not per
  probe) — via the health check itself (`--notify-on-fail`) so it works with a
  plain external cron, no bespoke watcher.
- Missed-tick coalescing on restart: when the runtime restarts the process, the
  loop does NOT stampede-fire every tick it slept through — coalesce to the next
  valid slot per cadence (#525). (This is loop behavior, not supervision.)
- Tests: heartbeat write, health verb states (alive/stalled/dead), stall-
  threshold, notify-on-fail once-per-transition, missed-tick coalescing on a
  simulated restart.

## Notes

- Sequence after #503/#506/#518.
- NON-GOALS (deliberate, to avoid re-over-engineering): no `--supervise` mode,
  no in-process auto-restart, no bespoke watchdog daemon. Lifecycle = the
  container runtime (docker-compose `restart:` + `HEALTHCHECK`) or systemd on a
  bare host.
- Kill switch (#536) interplay: `farm health` must report a DELIBERATELY frozen
  farm (#536 freeze / `farm stop`) as intentionally-down, NOT unhealthy — so the
  container healthcheck does not fight an intentional stop. Distinguish
  "stopped on purpose" from "died".
- Non-docker deployment (bare host): the documented path is systemd with
  `Restart=always` + a `WatchdogSec` wired to `farm health` — same signal, OS
  supervisor. Still no ralphy-owned supervisor.
