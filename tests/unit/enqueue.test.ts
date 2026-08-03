// Pure-unit tests for cli/lib/jobs/enqueue.ts.
//
// `deriveWrappedArgv` is process.argv-dependent so we monkeypatch
// process.argv for the duration of each test.
//
// `submitBatchFromFile` runs against an isolated tmp DB.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  closeDb,
  openDb,
  listJobs,
  getJob,
} from "../../cli/lib/jobs/db.js";
import {
  deriveWrappedArgv,
  enqueueGenerate,
  parseDepsList,
  submitBatchFromFile,
} from "../../cli/lib/jobs/enqueue.js";
import {
  clearCommandContext,
  setCommandContext,
} from "../../cli/lib/context-state.js";
import * as generateCommand from "../../cli/commands/generate.js";
import { resolveConnector } from "../../cli/lib/providers/registry.js";
import { clearActiveCredentialResolver } from "../../cli/lib/providers/credentials.js";

let tmp: TmpRoot;
let originalArgv: string[];
let originalOpenRouter: string | undefined;
let originalFal: string | undefined;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-enqueue");
  closeDb();
  openDb();
  originalArgv = process.argv;
  originalOpenRouter = process.env.OPENROUTER_API_KEY;
  originalFal = process.env.FAL_KEY;
});

afterEach(() => {
  process.argv = originalArgv;
  clearCommandContext();
  clearActiveCredentialResolver();
  if (originalOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouter;
  if (originalFal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = originalFal;
  closeDb();
  tmp.cleanup();
});

describe("deriveWrappedArgv", () => {
  test("strips --queue flag", () => {
    process.argv = [
      "bun",
      "cli/index.ts",
      "generate",
      "video",
      "--project",
      "p",
      "--queue",
      "--prompt",
      "hi",
    ];
    expect(deriveWrappedArgv()).toEqual([
      "generate",
      "video",
      "--project",
      "p",
      "--prompt",
      "hi",
    ]);
  });

  test("strips --depends-on plus its value", () => {
    process.argv = [
      "bun",
      "cli/index.ts",
      "generate",
      "video",
      "--depends-on",
      "1,2,3",
      "--queue",
      "--prompt",
      "x",
    ];
    expect(deriveWrappedArgv()).toEqual([
      "generate",
      "video",
      "--prompt",
      "x",
    ]);
  });

  test("strips --queue-tag and --queue-priority + values", () => {
    process.argv = [
      "bun",
      "cli/index.ts",
      "generate",
      "image",
      "--queue",
      "--queue-tag",
      "batch-a",
      "--queue-priority",
      "10",
      "--slot",
      "s",
    ];
    expect(deriveWrappedArgv()).toEqual([
      "generate",
      "image",
      "--slot",
      "s",
    ]);
  });

  test("preserves order and unrelated flags", () => {
    process.argv = [
      "bun",
      "cli/index.ts",
      "generate",
      "video",
      "--first-frame",
      "/path/to/img.png",
      "--no-validate",
      "--queue",
    ];
    expect(deriveWrappedArgv()).toEqual([
      "generate",
      "video",
      "--first-frame",
      "/path/to/img.png",
      "--no-validate",
    ]);
  });
});

describe("parseDepsList", () => {
  test("comma-separated ids", () => {
    expect(parseDepsList("1,2,3")).toEqual([1, 2, 3]);
  });

  test("trims whitespace", () => {
    expect(parseDepsList(" 1 , 2 , 3 ")).toEqual([1, 2, 3]);
  });

  test("undefined → empty array", () => {
    expect(parseDepsList(undefined)).toEqual([]);
  });

  test("filters out non-numeric tokens", () => {
    expect(parseDepsList("1,foo,3")).toEqual([1, 3]);
  });
});

describe("enqueueGenerate", () => {
  test("implicit video queueing persists the same available Fal provider as sync", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.FAL_KEY = "task-2b-fal-selection-secret";
    const queuedProvider = (generateCommand as Record<string, unknown>)[
      "credentialProviderForQueuedGeneration"
    ];

    expect(resolveConnector("video").id).toBe("fal");
    expect(typeof queuedProvider).toBe("function");
    if (typeof queuedProvider !== "function") return;
    expect(queuedProvider("generate.video", undefined)).toBe("fal");
  });

  test("persists only the requested provider and immutable command scope", () => {
    process.argv = [
      "bun",
      "cli/index.ts",
      "generate",
      "image",
      "--queue",
      "--provider",
      "openrouter",
    ];
    setCommandContext({
      kind: "scope",
      workspaceId: "ws_enqueue",
      projectId: "prj_enqueue",
    });
    let daemonStarts = 0;

    const id = enqueueGenerate(
      { queue: true, credentialProviderId: "openrouter" },
      "generate.image",
      { ensureDaemon: () => (daemonStarts += 1) },
    );

    expect(daemonStarts).toBe(1);
    expect(getJob(id!)).toMatchObject({
      command: {
        argv: ["generate", "image", "--provider", "openrouter"],
        credential: {
          providerId: "openrouter",
          workspaceId: "ws_enqueue",
          projectId: "prj_enqueue",
        },
      },
    });
    expect(JSON.stringify(getJob(id!))).not.toContain("API_KEY");
  });
});

describe("submitBatchFromFile", () => {
  function writeBatch(spec: unknown): string {
    const file = path.join(tmp.dir, `batch-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(spec));
    return file;
  }

  test("inserts in topological order with symbolic deps resolved", async () => {
    const file = writeBatch([
      { id: "A", kind: "shell", argv: ["echo", "A"] },
      { id: "B", kind: "shell", argv: ["echo", "B"], depends_on: ["A"] },
      {
        id: "C",
        kind: "shell",
        argv: ["echo", "C"],
        depends_on: ["A", "B"],
      },
    ]);
    const r = await submitBatchFromFile(file);
    expect(Object.keys(r.symbolMap).sort()).toEqual(["A", "B", "C"]);

    const realA = r.symbolMap.A;
    const realB = r.symbolMap.B;
    const realC = r.symbolMap.C;

    expect(getJob(realA)?.depends_on).toEqual([]);
    expect(getJob(realB)?.depends_on).toEqual([realA]);
    expect(getJob(realC)?.depends_on).toEqual([realA, realB]);
  });

  test("preserves spec order in symbolMap regardless of dep declaration order", async () => {
    // Submit C before B even though C depends on B.
    const file = writeBatch([
      { id: "A", kind: "shell", argv: ["A"] },
      { id: "C", kind: "shell", argv: ["C"], depends_on: ["B"] },
      { id: "B", kind: "shell", argv: ["B"], depends_on: ["A"] },
    ]);
    const r = await submitBatchFromFile(file);
    const ids = listJobs().map((j) => j.id).sort((a, b) => a - b);
    expect(ids.length).toBe(3);
    // Topological insert order: A first, then B (its dep met), then C.
    expect(r.symbolMap.A).toBeLessThan(r.symbolMap.B);
    expect(r.symbolMap.B).toBeLessThan(r.symbolMap.C);
  });

  test("rejects unknown symbolic dep", async () => {
    const file = writeBatch([
      { id: "A", kind: "shell", argv: ["A"] },
      {
        id: "B",
        kind: "shell",
        argv: ["B"],
        depends_on: ["nonexistent"],
      },
    ]);
    await expect(submitBatchFromFile(file)).rejects.toThrow(/nonexistent/);
  });

  test("rejects dependency cycle", async () => {
    const file = writeBatch([
      { id: "A", kind: "shell", argv: ["A"], depends_on: ["B"] },
      { id: "B", kind: "shell", argv: ["B"], depends_on: ["A"] },
    ]);
    await expect(submitBatchFromFile(file)).rejects.toThrow(/cycle/);
  });

  test("rejects empty file", async () => {
    const file = writeBatch([]);
    await expect(submitBatchFromFile(file)).rejects.toThrow(/no jobs/);
  });

  test("rejects malformed JSON", async () => {
    const file = path.join(tmp.dir, "broken.json");
    fs.writeFileSync(file, "{not json");
    await expect(submitBatchFromFile(file)).rejects.toThrow(/not valid JSON/);
  });

  test("accepts the {jobs:[]} object form", async () => {
    const file = writeBatch({
      jobs: [{ id: "A", kind: "shell", argv: ["A"] }],
    });
    const r = await submitBatchFromFile(file);
    expect(r.symbolMap.A).toBeGreaterThan(0);
  });
});

void os;
