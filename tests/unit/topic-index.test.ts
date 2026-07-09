// Long-horizon topic dedup (#541) — the pure lexical signature + append-only
// index + consult, and the dedup executor's topic-suppression pass. ZERO
// network, all on-disk under a tmp root. Env/cwd hygiene per #545 (tmp-root
// binds paths.root; no env mutation).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import {
  topicSignature,
  compareTopics,
  consultTopic,
  loadTopicIndex,
  recordTopic,
  parseWindowMs,
  type TopicRecord,
} from "../../cli/lib/ingestion/topic-index.js";
import { dedupExecutor } from "../../cli/lib/workflow/executors/ingestion.js";
import type { ExecutorContext } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowNode } from "../../cli/lib/schemas/workflow.js";
import type { SourceItem } from "../../cli/lib/schemas/source-item.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";
const DAY = 86_400_000;

function seed(): string {
  tmp = makeTmpRoot("ralphy-topic");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rec(unitId: string, title: string, ts: string, extra?: Partial<TopicRecord>): TopicRecord {
  return { unitId, title, ts, signature: topicSignature({ title, ...extra }) };
}

function makeCtx(dir: string, now: Date): ExecutorContext {
  return {
    workspaceDir: dir,
    workspace: WS,
    artifactsDir: `${dir}/artifacts`,
    // No runId: the topic-skip run-event is best-effort and we assert on the
    // KEPT items, not the journal, so a run-scoped write is unnecessary noise.
    now: () => now,
    inputs: {},
    log: async () => {},
    reportCost: () => {},
  } as unknown as ExecutorContext;
}

const item = (url: string, title: string, text = ""): SourceItem => ({
  url,
  title,
  text,
  ts: "2026-07-01T00:00:00.000Z",
  source: { backend: "rss" },
});

describe("topicSignature + compareTopics (pure lexical)", () => {
  test("exact-topic → high similarity", () => {
    const a = topicSignature({ title: "OpenAI launches GPT-6 model today" });
    const b = topicSignature({ title: "OpenAI launches GPT-6 model today" });
    expect(compareTopics(a, b)).toBe(1);
  });

  test("cross-source same story → above block threshold", () => {
    const a = topicSignature({ title: "OpenAI launches GPT-6 flagship model" });
    const b = topicSignature({ title: "OpenAI announces GPT-6 flagship model launch" });
    // ~0.57 token Jaccard — above the conservative 0.5 block default.
    expect(compareTopics(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  test("distinct topics → low similarity", () => {
    const a = topicSignature({ title: "OpenAI launches GPT-6 flagship model" });
    const b = topicSignature({ title: "Apple unveils foldable iPhone hardware redesign" });
    expect(compareTopics(a, b)).toBeLessThan(0.45);
  });

  test("embedding seam: cosine wins when both carry a vector", () => {
    const a = { tokens: [], shingles: [], embedding: [1, 0, 0] };
    const b = { tokens: [], shingles: [], embedding: [1, 0, 0] };
    expect(compareTopics(a, b)).toBe(1);
    // lexical fallback when either side lacks a vector
    const c = { tokens: ["x"], shingles: [], embedding: undefined };
    expect(compareTopics(a, c)).toBe(0);
  });
});

describe("consultTopic", () => {
  const now = Date.parse("2026-07-10T00:00:00.000Z");

  test("exact-topic suppression", () => {
    const index = [rec("p/u1", "OpenAI launches GPT-6 model today", "2026-07-08T00:00:00.000Z")];
    const cand = topicSignature({ title: "OpenAI launches GPT-6 model today" });
    const v = consultTopic(cand, index);
    expect(v.decision).toBe("duplicate");
  });

  test("cross-source same-story suppression (different url, same launch)", () => {
    const index = [rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-07-08T00:00:00.000Z")];
    const cand = topicSignature({ title: "OpenAI announces GPT-6 flagship model launch" });
    const v = consultTopic(cand, index);
    expect(v.decision).toBe("duplicate");
  });

  test("distinct topic passes", () => {
    const index = [rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-07-08T00:00:00.000Z")];
    const cand = topicSignature({ title: "Apple unveils foldable iPhone hardware redesign" });
    expect(consultTopic(cand, index).decision).toBe("fresh");
  });

  test("follow-up band (near-but-not-identical) is separable", () => {
    // Tuned so the score lands between followUp(0.45) and block(0.9).
    const index = [rec("p/u1", "OpenAI launches GPT-6 flagship model reasoning", "2026-07-08T00:00:00.000Z")];
    const cand = topicSignature({ title: "OpenAI GPT-6 flagship pricing tiers" });
    const v = consultTopic(cand, index, 0.9, 0.2);
    expect(v.decision).toBe("follow-up");
  });

  test("window expiry: an old topic no longer blocks", () => {
    seed();
    const dir = workspaceDir(WS);
    recordTopic(dir, rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-05-01T00:00:00.000Z"));
    // 45d window from now excludes a May-01 record on Jul-10.
    const windowed = loadTopicIndex(dir, 45 * DAY, now);
    expect(windowed.length).toBe(0);
    // wider window includes it.
    expect(loadTopicIndex(dir, 120 * DAY, now).length).toBe(1);
  });
});

describe("dedupExecutor topic pass (#541)", () => {
  test("suppresses a same-topic candidate covered in the index", async () => {
    const dir = seed();
    recordTopic(dir, rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-07-09T00:00:00.000Z"));
    const node = { id: "dedup", type: "dedup", params: {} } as unknown as WorkflowNode;
    const ctx = makeCtx(dir, new Date("2026-07-10T00:00:00.000Z"));
    ctx.inputs = { items: [item("https://b.com/2", "OpenAI announces GPT-6 flagship model launch")] };
    const { output } = await dedupExecutor(node, ctx);
    expect((output as SourceItem[]).length).toBe(0);
  });

  test("lexical fallback path works with no embeddings present", async () => {
    const dir = seed();
    recordTopic(dir, rec("p/u1", "Rust 2.0 release stabilizes async traits", "2026-07-09T00:00:00.000Z"));
    const node = { id: "dedup", type: "dedup", params: {} } as unknown as WorkflowNode;
    const ctx = makeCtx(dir, new Date("2026-07-10T00:00:00.000Z"));
    ctx.inputs = { items: [item("https://x.com/1", "Rust 2.0 release stabilizes async traits in the compiler")] };
    const { output } = await dedupExecutor(node, ctx);
    expect((output as SourceItem[]).length).toBe(0); // suppressed via lexical only
  });

  test("distinct topic passes through", async () => {
    const dir = seed();
    recordTopic(dir, rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-07-09T00:00:00.000Z"));
    const node = { id: "dedup", type: "dedup", params: {} } as unknown as WorkflowNode;
    const ctx = makeCtx(dir, new Date("2026-07-10T00:00:00.000Z"));
    ctx.inputs = { items: [item("https://c.com/3", "Apple unveils foldable iPhone hardware redesign")] };
    const { output } = await dedupExecutor(node, ctx);
    expect((output as SourceItem[]).length).toBe(1);
  });

  test("topic_dedup:false opts out (short-window seen store still applies)", async () => {
    const dir = seed();
    recordTopic(dir, rec("p/u1", "OpenAI launches GPT-6 flagship model", "2026-07-09T00:00:00.000Z"));
    const node = { id: "dedup", type: "dedup", params: { topic_dedup: false } } as unknown as WorkflowNode;
    const ctx = makeCtx(dir, new Date("2026-07-10T00:00:00.000Z"));
    ctx.inputs = { items: [item("https://b.com/2", "OpenAI announces GPT-6 flagship model launch")] };
    const { output } = await dedupExecutor(node, ctx);
    expect((output as SourceItem[]).length).toBe(1);
  });

  test("#542 consistency: a stale-dropped item is NOT recorded as covered → a later source is NOT suppressed", async () => {
    // The topic index is written ONLY on publish success (publish.ts
    // recordCoveredTopic), never on the stale-drop path. So with an EMPTY index
    // (nothing ever published), a fresh same-topic source passes the consult.
    const dir = seed();
    expect(loadTopicIndex(dir, 45 * DAY).length).toBe(0); // stale-drop wrote nothing
    const node = { id: "dedup", type: "dedup", params: {} } as unknown as WorkflowNode;
    const ctx = makeCtx(dir, new Date("2026-07-10T00:00:00.000Z"));
    ctx.inputs = { items: [item("https://b.com/2", "OpenAI announces GPT-6 flagship model launch")] };
    const { output } = await dedupExecutor(node, ctx);
    expect((output as SourceItem[]).length).toBe(1); // topic stays OPEN
  });
});

describe("parseWindowMs reuses store.ts window grammar", () => {
  test("45d", () => expect(parseWindowMs("45d")).toBe(45 * DAY));
});
