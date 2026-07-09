// Source freshness TTL + staleness guard (#542). Pure/deterministic coverage
// (inject `now`) + one on-disk rollup-accounting test. Env/cwd hygiene per the
// #545 lesson: the rollup test binds a tmp root and cleans it up; no
// process.env / process.chdir mutation.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import {
  resolveFreshnessTtl,
  classifyFreshness,
  orderByFreshness,
  NODE_FRESHNESS_DEFAULTS,
} from "../../cli/lib/farm/freshness.js";
import { SourceItemSchema } from "../../cli/lib/schemas/source-item.js";
import { buildFarmReport } from "../../cli/lib/farm/rollup.js";
import { publishExecutor } from "../../cli/lib/workflow/executors/publish.js";
import type { ExecutorContext } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

const HOUR = 3_600_000;
const now = Date.parse("2026-07-09T12:00:00Z");

describe("resolveFreshnessTtl precedence + evergreen opt-out", () => {
  test("item ttl wins over node ttl and content-class default", () => {
    expect(resolveFreshnessTtl({ itemTtl: "1h", nodeTtl: "6h", contentClass: "news" })).toBe(HOUR);
  });

  test("node ttl used when item omits it", () => {
    expect(resolveFreshnessTtl({ nodeTtl: "6h", contentClass: "news" })).toBe(6 * HOUR);
  });

  test("content-class default fills in when neither item nor node set a ttl", () => {
    expect(resolveFreshnessTtl({ contentClass: "news-short" })).toBe(6 * HOUR);
  });

  test("evergreen content class opts out — TTL is undefined (never guarded)", () => {
    expect(resolveFreshnessTtl({ contentClass: "evergreen" })).toBeUndefined();
    expect(NODE_FRESHNESS_DEFAULTS.evergreen).toBeUndefined();
  });

  test("no inputs at all → undefined (evergreen default)", () => {
    expect(resolveFreshnessTtl({})).toBeUndefined();
  });

  test("malformed duration degrades to undefined (never crashes the farm)", () => {
    expect(resolveFreshnessTtl({ itemTtl: "banana" })).toBeUndefined();
  });
});

describe("classifyFreshness — age from source ts, not ingest/tick", () => {
  test("past-TTL item is stale with a drop action", () => {
    const ts = new Date(now - 10 * HOUR).toISOString(); // 10h old
    const v = classifyFreshness(ts, 6 * HOUR, now);
    expect(v.stale).toBe(true);
    expect(v.action).toBe("drop");
    expect(v.ageMs).toBe(10 * HOUR);
  });

  test("within-TTL item is fresh (no action)", () => {
    const ts = new Date(now - 2 * HOUR).toISOString();
    const v = classifyFreshness(ts, 6 * HOUR, now);
    expect(v.stale).toBe(false);
    expect(v.action).toBeUndefined();
  });

  test("a LATE-INGESTED but OLD story is stale — age is from the (publish) ts", () => {
    // The item was ingested seconds ago but its source ts is a week old.
    const publishTs = new Date(now - 7 * 24 * HOUR).toISOString();
    const v = classifyFreshness(publishTs, 6 * HOUR, now);
    expect(v.stale).toBe(true); // age measured from the old publish ts, not "just ingested"
  });

  test("evergreen (undefined ttl) is NEVER stale even at extreme age", () => {
    const ts = new Date(now - 365 * 24 * HOUR).toISOString();
    expect(classifyFreshness(ts, undefined, now).stale).toBe(false);
  });

  test("downgrade action is carried on a stale verdict when configured", () => {
    const ts = new Date(now - 10 * HOUR).toISOString();
    expect(classifyFreshness(ts, 6 * HOUR, now, "downgrade").action).toBe("downgrade");
  });

  test("unparseable ts fails open — treated as fresh (never drop what we cannot date)", () => {
    const v = classifyFreshness("not-a-date", 6 * HOUR, now);
    expect(v.stale).toBe(false);
    expect(v.ageMs).toBeNull();
  });
});

describe("orderByFreshness — freshness-weighted within priority", () => {
  test("fresher story preempts an older one within the same priority band", () => {
    const older = { id: "old", ts: new Date(now - 20 * HOUR).toISOString() };
    const fresher = { id: "new", ts: new Date(now - 1 * HOUR).toISOString() };
    const ordered = orderByFreshness([older, fresher]);
    expect(ordered.map((x) => x.id)).toEqual(["new", "old"]);
  });

  test("never reorders ACROSS priority — priority dominates freshness", () => {
    const highButOld = { id: "hi", priority: 5, ts: new Date(now - 50 * HOUR).toISOString() };
    const lowButFresh = { id: "lo", priority: 1, ts: new Date(now - 1 * HOUR).toISOString() };
    const ordered = orderByFreshness([lowButFresh, highButOld]);
    expect(ordered.map((x) => x.id)).toEqual(["hi", "lo"]); // higher priority first regardless of freshness
  });

  test("stable + deterministic: equal priority AND equal ts keep input order", () => {
    const ts = new Date(now - 3 * HOUR).toISOString();
    const a = { id: "a", ts };
    const b = { id: "b", ts };
    expect(orderByFreshness([a, b]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(orderByFreshness([b, a]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  test("undateable ts sorts oldest within its band", () => {
    const dated = { id: "dated", ts: new Date(now - 30 * HOUR).toISOString() };
    const undated = { id: "undated", ts: "??" };
    expect(orderByFreshness([undated, dated]).map((x) => x.id)).toEqual(["dated", "undated"]);
  });
});

describe("source-item schema — freshness_ttl / content_class are optional + additive", () => {
  test("an item WITHOUT the new fields still validates (older payloads)", () => {
    const item = SourceItemSchema.parse({
      url: "https://example.com/a",
      title: "A",
      ts: new Date(now).toISOString(),
      source: { backend: "rss" },
    });
    expect(item.freshness_ttl).toBeUndefined();
    expect(item.content_class).toBeUndefined();
  });

  test("an item carrying the new fields round-trips", () => {
    const item = SourceItemSchema.parse({
      url: "https://example.com/b",
      title: "B",
      ts: new Date(now).toISOString(),
      freshness_ttl: "6h",
      content_class: "news-short",
      source: { backend: "rss" },
    });
    expect(item.freshness_ttl).toBe("6h");
    expect(item.content_class).toBe("news-short");
  });
});

describe("publishExecutor drop path — stale unit never publishes", () => {
  let tmp: TmpRoot;
  afterEach(() => tmp?.cleanup());

  function pubNode(params: Record<string, unknown>): WorkflowNode {
    return {
      id: "pub",
      type: "publish" as WorkflowNodeType,
      in: {},
      params: { project: "news-001", unit_slug: "hero", targets: ["x"], ...params },
      retry: { max: 0, backoff: "exponential" },
      on_fail: "halt",
      cache: "none",
      emit: true,
    };
  }

  test("a past-TTL unit is dropped before any publish + emits a stale-dropped run event", async () => {
    tmp = makeTmpRoot("ralphy-freshness-drop");
    const ws = "test";
    fs.mkdirSync(workspaceDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }));
    const runId = "farm-news-drop-1";
    fs.mkdirSync(runDir(ws, runId), { recursive: true });
    // Seed run.json so appendRunEvent has a run dir to write into.
    fs.writeFileSync(path.join(runDir(ws, runId), "run.json"), JSON.stringify({ id: runId, status: "active" }));

    const logged: unknown[] = [];
    const ctx: ExecutorContext = {
      workspace: ws,
      workspaceDir: workspaceDir(ws),
      artifactsDir: path.join(runDir(ws, runId), "artifacts"),
      inputs: {},
      runId,
      runDir: runDir(ws, runId),
      log: async (e) => void logged.push(e),
      reportCost: () => {},
      now: () => new Date("2026-07-09T12:00:00Z"),
    };
    // Source published a week ago, TTL 6h → stale → dropped (no manifest / Postiz needed).
    const node = pubNode({
      source_ts: new Date(now - 7 * 24 * HOUR).toISOString(),
      freshness_ttl: "6h",
      stale_action: "drop",
    });

    const res = await publishExecutor(node, ctx);
    expect((res.output as { stale_dropped?: boolean }).stale_dropped).toBe(true);

    // The stale-dropped event is on the run journal (report reads it).
    const journal = fs.readFileSync(path.join(runDir(ws, runId), "run-events.jsonl"), "utf8");
    expect(journal).toContain('"stale-dropped"');
    // No Postiz call was made: the log row is the drop note, status ok.
    expect(logged.length).toBe(1);
  });

  test("evergreen source_ts (no ttl) proceeds past the guard (not dropped)", async () => {
    tmp = makeTmpRoot("ralphy-freshness-evergreen");
    const ws = "test";
    fs.mkdirSync(workspaceDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }));
    const ctx: ExecutorContext = {
      workspace: ws,
      workspaceDir: workspaceDir(ws),
      artifactsDir: path.join(workspaceDir(ws), "artifacts"),
      inputs: {},
      log: async () => {},
      reportCost: () => {},
      now: () => new Date("2026-07-09T12:00:00Z"),
    };
    // Old source but no TTL → NOT a drop. It falls through to the readiness gate,
    // which throws publish-not-ready (no scorecard) — proving the guard let it pass.
    const node = pubNode({ source_ts: new Date(now - 365 * 24 * HOUR).toISOString(), content_class: "evergreen" });
    await expect(publishExecutor(node, ctx)).rejects.toThrow(/publish-not-ready|readiness/i);
  });
});

describe("farm report — stale-dropped accounting (#518)", () => {
  let tmp: TmpRoot;
  afterEach(() => tmp?.cleanup());

  test("counts stale-dropped journal events into totals.staleDropped", () => {
    tmp = makeTmpRoot("ralphy-freshness");
    const ws = "test";
    fs.mkdirSync(workspaceDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }));

    const runId = "farm-news-20260709-120000";
    const dir = runDir(ws, runId);
    fs.mkdirSync(dir, { recursive: true });
    const events = [
      { kind: "farm-tick", ts: "2026-07-09T12:00:00Z", message: "tick" },
      { kind: "stale-dropped", node: "pub", ts: "2026-07-09T12:00:01Z", ageMs: 10 * HOUR, ttlMs: 6 * HOUR, message: "drop 1" },
      { kind: "stale-dropped", node: "pub", ts: "2026-07-09T12:00:02Z", ageMs: 20 * HOUR, ttlMs: 6 * HOUR, message: "drop 2" },
    ];
    fs.writeFileSync(
      path.join(dir, "run-events.jsonl"),
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );

    const report = buildFarmReport(ws);
    expect(report.totals.staleDropped).toBe(2);
    expect(report.totals.ticks).toBe(1);
  });
});
