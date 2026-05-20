// Unit tests for the shared NDJSON event emitter (cli/lib/stream/ndjson.ts).
//
// Per 01.07.01 acceptance:
//   • single emitter used by every long-running verb
//   • backpressure-safe (cooperates with process.stdout's write() boolean)
//   • --quiet suppresses all but the final summary
//   • 10k events in <1s, never reorders
//   • every event line is a complete JSON object with `{ ts, kind, ... }`

import { describe, test, expect } from "bun:test";
import { PassThrough } from "node:stream";
import { NdjsonEmitter } from "../../cli/lib/stream/ndjson.js";

function collect(stream: PassThrough): { lines: string[]; raw: () => string } {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
  });
  return {
    get lines() {
      return buf.split("\n").filter((l) => l.length > 0);
    },
    raw() {
      return buf;
    },
  };
}

describe("NdjsonEmitter", () => {
  test("emit() writes one JSON object per line with ts + kind", () => {
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out });
    e.event("start", { project: "x" });
    e.event("progress", { pct: 50 });
    e.summary({ ok: true });
    expect(sink.lines.length).toBe(3);
    for (const line of sink.lines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.ts).toBe("number");
      expect(typeof parsed.kind).toBe("string");
    }
    expect(JSON.parse(sink.lines[0]!).kind).toBe("start");
    expect(JSON.parse(sink.lines[1]!).kind).toBe("progress");
    expect(JSON.parse(sink.lines[2]!).kind).toBe("summary");
  });

  test("preserves insertion order across many events", () => {
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out });
    for (let i = 0; i < 1000; i++) {
      e.event("tick", { i });
    }
    e.summary({ total: 1000 });
    expect(sink.lines.length).toBe(1001);
    // Spot-check the boundaries and a random middle index.
    expect(JSON.parse(sink.lines[0]!).i).toBe(0);
    expect(JSON.parse(sink.lines[500]!).i).toBe(500);
    expect(JSON.parse(sink.lines[999]!).i).toBe(999);
    expect(JSON.parse(sink.lines[1000]!).kind).toBe("summary");
  });

  test("10k events emit in <1s and never reorder", () => {
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out });
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      e.event("tick", { i });
    }
    e.summary({ total: 10_000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(sink.lines.length).toBe(10_001);
    // Sample-verify ordering at several offsets.
    for (const i of [0, 1234, 5678, 9999]) {
      expect(JSON.parse(sink.lines[i]!).i).toBe(i);
    }
  });

  test("quiet=true suppresses events but keeps summary", () => {
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out, quiet: true });
    e.event("progress", { pct: 10 });
    e.event("progress", { pct: 90 });
    e.summary({ ok: true });
    expect(sink.lines.length).toBe(1);
    const summary = JSON.parse(sink.lines[0]!);
    expect(summary.kind).toBe("summary");
    expect(summary.ok).toBe(true);
  });

  test("payload fields override neither ts nor kind", () => {
    // If a caller passes { kind: "spoof" } in the payload, the emitter's
    // top-level kind must still be the canonical one passed to event().
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out });
    e.event("real", { kind: "spoof", ts: 0, extra: "x" });
    const parsed = JSON.parse(sink.lines[0]!);
    expect(parsed.kind).toBe("real");
    expect(parsed.ts).not.toBe(0);
    expect(parsed.extra).toBe("x");
  });

  test("close() flushes and is idempotent", () => {
    const out = new PassThrough();
    const sink = collect(out);
    const e = new NdjsonEmitter({ out });
    e.event("a", {});
    e.close();
    e.close(); // second close must not throw or duplicate
    expect(sink.lines.length).toBe(1);
  });
});
