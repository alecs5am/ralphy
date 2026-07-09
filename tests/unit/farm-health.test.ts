// Farm liveness signal (#539) — heartbeat write shape, `farm health` states
// (alive / stalled / dead / stopped-on-purpose), the stall-threshold boundary,
// notify-on-fail once-per-transition, and missed-tick coalescing on a simulated
// restart. ZERO network, no real sleeps: the clock/sleep seams are injected.
//
// Env hygiene (#545): this suite touches no process.env, but it seeds workflows
// + workspace.json under an isolated tmp root and restores it via makeTmpRoot's
// cleanup in afterEach.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir } from "../../cli/lib/paths.js";
import {
  farmLoop,
  farmStatus,
  farmHealth,
  farmHeartbeatPath,
  readFarmHeartbeat,
  writeFarmPid,
  clearFarmPid,
  shouldAlertOnTransition,
  type FarmDeps,
  type FarmHealthState,
} from "../../cli/lib/farm/runner.js";
import { setPublishMode } from "../../cli/lib/farm/publish-mode.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";
const noSleep: FarmDeps = { sleep: async () => {} };

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-farm-health");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

/** A one-schedule workflow on disk (default: every minute). */
function seedWorkflow(cron = "* * * * *"): void {
  fs.mkdirSync(workflowsDir(WS), { recursive: true });
  fs.writeFileSync(
    path.join(workflowsDir(WS), "news.json"),
    JSON.stringify({
      version: "2.0",
      name: "news",
      nodes: [
        { id: "tick", type: "schedule", params: { cron } },
        { id: "copy", type: "template-string", params: { prompt: "daily news" } },
      ],
    }),
  );
}

// ─── Heartbeat write ───────────────────────────────────────────────────────

describe("heartbeat", () => {
  test("the loop overwrites a well-shaped heartbeat each scan (--once)", async () => {
    seedWorkspace();
    seedWorkflow("* * * * *");
    const now = () => new Date("2026-07-09T09:00:00.000Z");
    await farmLoop({ workspace: WS, once: true }, { ...noSleep, now });

    const hb = readFarmHeartbeat(WS);
    expect(hb).not.toBeNull();
    expect(hb!.ts).toBe("2026-07-09T09:00:00.000Z");
    expect(hb!.lastTickAt).toBe("2026-07-09T09:00:00.000Z");
    expect(typeof hb!.nextScheduledAt).toBe("string"); // a next cron fire exists
    expect(hb!.ticksThisSession).toBe(1);
    // Overwrite-in-place: exactly one heartbeat file, valid JSON (not appended).
    const raw = fs.readFileSync(farmHeartbeatPath(WS), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

// ─── health states ──────────────────────────────────────────────────────────

describe("farm health states", () => {
  test("alive: live pid + fresh heartbeat → exit 0", () => {
    seedWorkspace();
    seedWorkflow("* * * * *");
    writeFarmPid(WS, process.pid); // this test process is alive
    fs.writeFileSync(
      farmHeartbeatPath(WS),
      JSON.stringify({
        ts: "2026-07-09T09:00:00.000Z",
        lastTickAt: "2026-07-09T09:00:00.000Z",
        nextScheduledAt: "2026-07-09T09:01:00.000Z",
        ticksThisSession: 5,
      }),
    );
    const r = farmHealth(WS, { now: () => new Date("2026-07-09T09:00:30.000Z") });
    expect(r.state).toBe("alive");
    expect(r.exitCode).toBe(0);
    expect(r.healthy).toBe(true);
  });

  test("dead: no live process, not frozen → exit 1", () => {
    seedWorkspace();
    seedWorkflow();
    clearFarmPid(WS); // nothing running
    const r = farmHealth(WS);
    expect(r.state).toBe("dead");
    expect(r.exitCode).toBe(1);
    expect(r.healthy).toBe(false);
  });

  test("stalled: live process but stale heartbeat → exit 1", () => {
    seedWorkspace();
    seedWorkflow("* * * * *"); // 60s interval, ×3 = 180s threshold
    writeFarmPid(WS, process.pid);
    fs.writeFileSync(
      farmHeartbeatPath(WS),
      JSON.stringify({
        ts: "2026-07-09T09:00:00.000Z",
        lastTickAt: "2026-07-09T09:00:00.000Z",
        nextScheduledAt: null,
        ticksThisSession: 1,
      }),
    );
    // 10 minutes later — well past 3× the 60s tick interval.
    const r = farmHealth(WS, { now: () => new Date("2026-07-09T09:10:00.000Z") });
    expect(r.state).toBe("stalled");
    expect(r.exitCode).toBe(1);
    expect(r.stallThresholdSec).toBe(180);
  });

  test("stopped-on-purpose: frozen workspace, no process → exit 0 (NOT unhealthy)", () => {
    seedWorkspace();
    seedWorkflow();
    clearFarmPid(WS);
    setPublishMode(WS, "freeze", { actor: "test", reason: "kill switch" });
    const r = farmHealth(WS);
    expect(r.state).toBe("stopped");
    expect(r.exitCode).toBe(0);
    expect(r.healthy).toBe(true);
    expect(r.publishMode).toBe("freeze");
  });
});

// ─── stall-threshold boundary ────────────────────────────────────────────────

describe("stall threshold boundary", () => {
  test("exactly at the threshold is still alive; one second past is stalled", () => {
    seedWorkspace();
    seedWorkflow("* * * * *"); // 60s interval → default ×3 = 180s
    writeFarmPid(WS, process.pid);
    const base = "2026-07-09T09:00:00.000Z";
    fs.writeFileSync(
      farmHeartbeatPath(WS),
      JSON.stringify({ ts: base, lastTickAt: base, nextScheduledAt: null, ticksThisSession: 1 }),
    );
    // Age exactly 180s → NOT > threshold → alive.
    const at = farmHealth(WS, { now: () => new Date("2026-07-09T09:03:00.000Z") });
    expect(at.heartbeatAgeSec).toBe(180);
    expect(at.state).toBe("alive");
    // Age 181s → stalled.
    const past = farmHealth(WS, { now: () => new Date("2026-07-09T09:03:01.000Z") });
    expect(past.state).toBe("stalled");
  });

  test("--stall-multiple widens the window", () => {
    seedWorkspace();
    seedWorkflow("* * * * *");
    writeFarmPid(WS, process.pid);
    const base = "2026-07-09T09:00:00.000Z";
    fs.writeFileSync(
      farmHeartbeatPath(WS),
      JSON.stringify({ ts: base, lastTickAt: base, nextScheduledAt: null, ticksThisSession: 1 }),
    );
    // 240s old: stalled at ×3 (180s), alive at ×5 (300s).
    const now = () => new Date("2026-07-09T09:04:00.000Z");
    expect(farmHealth(WS, { now, stallMultiple: 3 }).state).toBe("stalled");
    expect(farmHealth(WS, { now, stallMultiple: 5 }).state).toBe("alive");
  });
});

// ─── notify-on-fail once-per-transition ──────────────────────────────────────

describe("notify-on-fail transition gate", () => {
  test("fires only on healthy→unhealthy, not on repeat unhealthy probes", () => {
    const seq: Array<[FarmHealthState | null, FarmHealthState, boolean]> = [
      [null, "dead", true], // first probe, unhealthy → alert
      ["dead", "dead", false], // still dead → no re-alert
      ["dead", "stalled", false], // still unhealthy → no re-alert
      ["stalled", "alive", false], // recovered → no alert (re-arms)
      ["alive", "stalled", true], // healthy→unhealthy again → alert
      ["stopped", "dead", true], // stopped counts as healthy → alert
      ["alive", "stopped", false], // alive→stopped is not unhealthy
    ];
    for (const [last, current, expected] of seq) {
      expect(shouldAlertOnTransition(last, current)).toBe(expected);
    }
  });
});

// ─── missed-tick coalescing on restart ───────────────────────────────────────

describe("missed-tick coalescing", () => {
  test("a restart far past many due slots fires ONE run per workflow, not N", async () => {
    seedWorkspace();
    seedWorkflow("* * * * *"); // due every minute — hours of missed slots
    // Simulate a restart at a clock long after the last fire: the very first
    // scan sees the schedule as due and MUST coalesce to a single run, not
    // stampede one per slept-through minute.
    const now = () => new Date("2026-07-09T15:00:00.000Z");
    await farmLoop({ workspace: WS, once: true }, { ...noSleep, now });

    const report = farmStatus(WS);
    // Exactly one Run fired (coalesced), not dozens.
    expect(report.runs).toHaveLength(1);
    expect(report.counts.complete).toBe(1);
  });
});
