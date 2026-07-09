// Farm deployment-liveness preflight (#530) — each check against fixtures,
// verdict aggregation, and the `farm start` refusal path. ZERO network: the
// Postiz reachability check takes an injected fetch.

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir } from "../../cli/lib/paths.js";
import { addSlot } from "../../cli/lib/calendar/store.js";
import { farmDoctor, aggregateVerdict, type Check } from "../../cli/lib/farm/preflight.js";

let tmp: TmpRoot;
const WS = "doc-test";

// A minimal graph that publishes to tiktok (a Postiz social target) with an
// openrouter model (coverage-served) — the shape most checks read.
const PUBLISHING_GRAPH = {
  version: "2.0",
  name: "wf",
  nodes: [
    { id: "tick", type: "schedule", params: { cron: "0 9 * * *" }, out: "tick" },
    {
      id: "img",
      type: "t2i",
      in: { prompt: "tick.tick" },
      params: { provider: "openrouter", model: "google/gemini-3-pro-image-preview", project: "p", slot: "hero" },
      out: "image",
    },
    {
      id: "unit",
      type: "ralphy-unit",
      in: { media: "img.image" },
      params: { slug: "u", format: "video" },
      out: "unit",
    },
    {
      id: "publish",
      type: "publish",
      in: { unit: "unit.unit" },
      params: { targets: ["tiktok"] },
      out: "published",
    },
  ],
};

function seed(): void {
  tmp = makeTmpRoot("ralphy-farm-doctor");
  fs.mkdirSync(workspaceDir(WS), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir(WS), "workspace.json"), JSON.stringify({ slug: WS }));
}

function writeWorkflow(graph: unknown, name = "wf"): void {
  fs.mkdirSync(workflowsDir(WS), { recursive: true });
  fs.writeFileSync(path.join(workflowsDir(WS), `${name}.json`), JSON.stringify(graph));
}

/** A fetch that returns the given Postiz integrations as JSON. */
function postizFetchReturning(integrations: unknown[]): (u: string, i?: RequestInit) => Promise<Response> {
  return async () => new Response(JSON.stringify(integrations), { status: 200 });
}

function byId(checks: Check[], id: string): Check {
  const c = checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check "${id}" in [${checks.map((x) => x.id).join(", ")}]`);
  return c;
}

// Env keys this suite mutates. Snapshot the pre-test values in beforeEach and
// restore them (not blind-delete) in afterEach — a real runner env may already
// carry OPENROUTER_API_KEY / ELEVENLABS_API_KEY, and deleting them leaks into
// every later test that spawns a subprocess inheriting process.env (#545).
const MUTATED_ENV = [
  "OPENROUTER_API_KEY",
  "ELEVENLABS_API_KEY",
  "POSTIZ_API_KEY",
  "POSTIZ_BASE_URL",
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  seed();
  savedEnv = Object.fromEntries(MUTATED_ENV.map((k) => [k, process.env[k]]));
  process.env.OPENROUTER_API_KEY = "sk-test";
  process.env.ELEVENLABS_API_KEY = "el-test";
  process.env.POSTIZ_API_KEY = "pz-test";
  process.env.POSTIZ_BASE_URL = "https://postiz.example.com";
});
afterEach(() => {
  tmp?.cleanup();
  for (const k of MUTATED_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ─── verdict aggregation ─────────────────────────────────────────────────────

describe("aggregateVerdict", () => {
  const mk = (status: Check["status"]): Check => ({ id: "x", group: "host", status, detail: "", fix: "" });
  test("any fail → red (red > amber > green)", () => {
    expect(aggregateVerdict([mk("ok"), mk("warn"), mk("fail")])).toBe("red");
  });
  test("warn without fail → amber", () => {
    expect(aggregateVerdict([mk("ok"), mk("warn")])).toBe("amber");
  });
  test("all ok → green", () => {
    expect(aggregateVerdict([mk("ok"), mk("ok")])).toBe("green");
  });
});

// ─── providers ───────────────────────────────────────────────────────────────

describe("providers", () => {
  test("missing required key → fail", async () => {
    delete process.env.OPENROUTER_API_KEY;
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "provider-OPENROUTER_API_KEY").status).toBe("fail");
    expect(r.verdict).toBe("red");
  });
  test("present key → ok, noted not pinged", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    const c = byId(r.checks, "provider-OPENROUTER_API_KEY");
    expect(c.status).toBe("ok");
    expect(c.detail).toContain("not pinged");
  });
});

// ─── publish-targets ───────────────────────────────────────────────────────

describe("publish-targets", () => {
  test("no connected Postiz account for a target → fail", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "youtube" }]) });
    expect(byId(r.checks, "publish-target-tiktok").status).toBe("fail");
  });
  test("connected account for a target → ok", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "publish-target-tiktok").status).toBe("ok");
  });
  test("Postiz unconfigured but social target present → fail", async () => {
    delete process.env.POSTIZ_API_KEY;
    delete process.env.POSTIZ_BASE_URL;
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS);
    expect(byId(r.checks, "publish-postiz-config").status).toBe("fail");
  });
  test("article platform (#527) → warn, connectors-not-built note", async () => {
    const g = structuredClone(PUBLISHING_GRAPH);
    g.nodes[3]!.params = { targets: ["devto"] };
    writeWorkflow(g);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([]) });
    const c = byId(r.checks, "publish-article-connectors");
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("#527");
  });
});

// ─── bundle/coverage ─────────────────────────────────────────────────────────

describe("bundle/coverage", () => {
  test("no workflow → fail", async () => {
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([]) });
    expect(byId(r.checks, "bundle-workflows").status).toBe("fail");
    expect(r.verdict).toBe("red");
  });
  test("a coverage gap (unknown model) → fail", async () => {
    const g = structuredClone(PUBLISHING_GRAPH);
    g.nodes[1]!.params = { provider: "openrouter", model: "no/such-model-xyz", project: "p", slot: "hero" };
    writeWorkflow(g);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(r.checks.some((c) => c.group === "bundle/coverage" && c.status === "fail" && c.id.startsWith("coverage-"))).toBe(true);
    expect(r.verdict).toBe("red");
  });
  test("workflows present + coverage satisfied → ok", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "bundle-workflows").status).toBe("ok");
    expect(byId(r.checks, "coverage-satisfied").status).toBe("ok");
  });
});

// ─── budget ────────────────────────────────────────────────────────────────

describe("budget", () => {
  test("no budget cap → warn", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "budget-cap").status).toBe("warn");
  });
  test("a budget-guard node → ok", async () => {
    const g = structuredClone(PUBLISHING_GRAPH);
    g.nodes.push({ id: "cap", type: "budget-guard", in: { in: "img.image" }, params: { max_usd: 5 } } as never);
    writeWorkflow(g);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "budget-cap").status).toBe("ok");
  });
});

// ─── calendar ────────────────────────────────────────────────────────────────

describe("calendar", () => {
  test("no slots → warn", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "calendar-slots").status).toBe("warn");
  });
  test("a resolvable slot → ok", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    addSlot(workspaceDir(WS), {
      id: "mon-9",
      weekday: "mon",
      time: "09:00",
      timezone: "UTC",
      unitType: "ugc-review",
      targetPlatforms: ["tiktok"],
    });
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "calendar-slots").status).toBe("ok");
  });
});

// ─── trust ─────────────────────────────────────────────────────────────────

describe("trust", () => {
  test("unset trust (default L0) → ok with a parks-everything note", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    const c = byId(r.checks, "trust-level");
    expect(c.status).toBe("ok");
    expect(c.detail).toContain("L0");
  });
});

// ─── notifier ────────────────────────────────────────────────────────────────

describe("notifier", () => {
  test("no notifier → warn", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "notifier").status).toBe("warn");
  });
  test("a configured channel → ok", async () => {
    fs.writeFileSync(
      path.join(workspaceDir(WS), "workspace.json"),
      JSON.stringify({
        slug: WS,
        notifications: {
          enabled: true,
          channels: { webhook: { url: "https://hook.example.com" } },
          events: { "run-failed": ["webhook"] },
        },
      }),
    );
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, { postizFetch: postizFetchReturning([{ identifier: "tiktok" }]) });
    expect(byId(r.checks, "notifier").status).toBe("ok");
  });
});

// ─── quota ─────────────────────────────────────────────────────────────────

describe("quota", () => {
  test("a stale quota entry → warn", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    // The PLATFORM_QUOTAS verifiedOn dates are in 2026 — a far-future `now`
    // ages every entry past the 180-day horizon.
    const r = await farmDoctor(WS, {
      now: new Date("2030-01-01T00:00:00Z"),
      postizFetch: postizFetchReturning([{ identifier: "tiktok" }]),
    });
    expect(byId(r.checks, "quota-stale").status).toBe("warn");
  });
  test("fresh caps with headroom → ok", async () => {
    writeWorkflow(PUBLISHING_GRAPH);
    const r = await farmDoctor(WS, {
      now: new Date("2026-07-08T12:00:00Z"),
      postizFetch: postizFetchReturning([{ identifier: "tiktok" }]),
    });
    expect(byId(r.checks, "quota-headroom").status).toBe("ok");
  });
});

// ─── all-good → green ────────────────────────────────────────────────────────

describe("all-good fixture → green", () => {
  test("every check ok when fully wired", async () => {
    const g = structuredClone(PUBLISHING_GRAPH);
    g.nodes.push({ id: "cap", type: "budget-guard", in: { in: "img.image" }, params: { max_usd: 5 } } as never);
    fs.writeFileSync(
      path.join(workspaceDir(WS), "workspace.json"),
      JSON.stringify({
        slug: WS,
        notifications: {
          enabled: true,
          channels: { webhook: { url: "https://hook.example.com" } },
          events: { "run-failed": ["webhook"] },
        },
      }),
    );
    writeWorkflow(g);
    addSlot(workspaceDir(WS), {
      id: "mon-9",
      weekday: "mon",
      time: "09:00",
      timezone: "UTC",
      unitType: "ugc-review",
      targetPlatforms: ["tiktok"],
    });
    const r = await farmDoctor(WS, {
      now: new Date("2026-07-08T12:00:00Z"),
      postizFetch: postizFetchReturning([{ identifier: "tiktok" }]),
    });
    // No fail, no warn — but host bun/ffmpeg presence depends on the machine;
    // assert no FAIL and no non-host warn instead of a bare "green".
    const nonHostWarn = r.checks.filter((c) => c.status === "warn" && c.group !== "host");
    const fails = r.checks.filter((c) => c.status === "fail" && c.group !== "host");
    expect(nonHostWarn).toEqual([]);
    expect(fails).toEqual([]);
  });
});

// ─── `farm start` refusal path (subprocess — the full command boundary) ──────

describe("farm start preflight refusal", () => {
  const REPO = path.resolve(import.meta.dir, "..", "..");
  const CLI = path.join(REPO, "cli", "index.ts");
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-farm-start-"));
    // A workspace with NO workflow → the preflight is guaranteed RED
    // (bundle-workflows fails).
    fs.mkdirSync(path.join(root, ".ralphy", "workspaces", "redws"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".ralphy", "workspaces", "redws", "workspace.json"),
      JSON.stringify({ slug: "redws" }),
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // `--pretty` so the `ok(...)` skip line is emitted (suppressed under --json).
  function start(extra: string[], flags: string[] = ["--json"], timeoutMs = 12_000) {
    return spawnSync(
      "bun",
      ["run", CLI, "--cwd", root, ...flags, "farm", "start", "--workspace", "redws", ...extra],
      { cwd: root, encoding: "utf8", timeout: timeoutMs, env: { ...process.env, OPENROUTER_API_KEY: "x", ELEVENLABS_API_KEY: "y" } },
    );
  }

  test("RED verdict refuses without --skip-preflight (non-zero, E_VALIDATION_FAILED)", () => {
    const r = start([]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("E_VALIDATION_FAILED");
    expect(r.stdout + r.stderr).toContain("preflight RED");
  });

  test("--skip-preflight proceeds past the gate (skip logged, no refusal)", () => {
    // A non-once start loops until SIGTERM; a short subprocess timeout kills it
    // AFTER it has cleared the preflight gate and printed the skip line.
    const r = start(["--skip-preflight", "operator override"], ["--pretty"], 3_000);
    const outAll = r.stdout + r.stderr;
    expect(outAll).not.toContain("preflight RED");
    expect(outAll).toContain("Skipping #530 preflight");
  }, 8_000);

  test("--once skips the preflight entirely (runs, exit 0)", () => {
    const r = start(["--once"]);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toContain("preflight RED");
  }, 20_000);
});
