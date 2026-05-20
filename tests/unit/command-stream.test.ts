// Unit tests for CommandStream (cli/lib/stream/command.ts).
//
// CommandStream is the higher-level wrapper around NdjsonEmitter used by
// long-running verbs (render, iterate, batch run, generate video, generate
// music, assets pull) per 01.02.03. It:
//   • emits NDJSON on stdout when off-TTY / --json
//   • falls back to a single summary line in pretty mode (spinners handled
//     elsewhere by ui.withSpinner)

import { describe, test, expect, beforeEach } from "bun:test";
import { PassThrough } from "node:stream";
import { CommandStream } from "../../cli/lib/stream/command.js";
import { setMode, setQuiet } from "../../cli/lib/ui.js";

beforeEach(() => {
  setMode("auto");
  setQuiet(false);
});

function collect(stream: PassThrough): { lines: () => string[] } {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
  });
  return {
    lines: () => buf.split("\n").filter((l) => l.length > 0),
  };
}

describe("CommandStream in JSON mode", () => {
  test("event() emits NDJSON line with ts + kind", () => {
    setMode("json");
    const out = new PassThrough();
    const sink = collect(out);
    const cs = new CommandStream({ out });
    cs.event("start", { project: "x" });
    cs.summary({ ok: true });
    const lines = sink.lines();
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).kind).toBe("start");
    expect(JSON.parse(lines[1]!).kind).toBe("summary");
    expect(JSON.parse(lines[1]!).ok).toBe(true);
  });

  test("quiet=true suppresses events but keeps summary", () => {
    setMode("json");
    setQuiet(true);
    const out = new PassThrough();
    const sink = collect(out);
    const cs = new CommandStream({ out });
    cs.event("tick", {});
    cs.event("tick", {});
    cs.summary({ result: "done" });
    const lines = sink.lines();
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!).kind).toBe("summary");
  });
});

describe("CommandStream in pretty mode", () => {
  test("event() is a no-op; summary() prints single JSON-like object via printer", () => {
    setMode("pretty");
    const out = new PassThrough();
    const sink = collect(out);
    const printed: unknown[] = [];
    const cs = new CommandStream({ out, prettyPrinter: (v) => printed.push(v) });
    cs.event("noise", { ignored: true });
    cs.event("more-noise", {});
    cs.summary({ project: "x", ok: true });
    // Nothing went to the NDJSON stream
    expect(sink.lines().length).toBe(0);
    // Single summary object handed to pretty printer
    expect(printed.length).toBe(1);
    expect(printed[0]).toEqual({ project: "x", ok: true });
  });
});
