import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test } from "bun:test";
import { runBridge } from "../../cli/lib/bridge/server.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { createProject } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

async function run(input: string): Promise<string> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  const server = runBridge({
    dataRoot: `${root.dir}/.ralphy`,
    input: stdin,
    output: stdout,
  });
  stdin.end(input);
  await server;
  return Buffer.concat(chunks).toString("utf8");
}

describe("stdio bridge", () => {
  test("returns hello over JSONL and keeps stdout JSON-only", async () => {
    root = makeTmpRoot("ralphy-bridge");
    createWorkspace({ slug: "primary", name: "Primary" });
    const output = await run('{"v":1,"id":"hello","method":"system.hello"}\n');
    const response = JSON.parse(output) as { id: string; ok: boolean; result: { limits: { maxFrameBytes: number }; consumerNamespaces: string[] } };
    expect(response.id).toBe("hello");
    expect(response.ok).toBe(true);
    expect(response.result.limits.maxFrameBytes).toBe(1_048_576);
    expect(response.result.consumerNamespaces).toEqual(["farm"]);
    expect(output.trim().split("\n")).toHaveLength(1);
  });

  test("rejects duplicate live ids fatally", async () => {
    root = makeTmpRoot("ralphy-bridge-duplicate");
    createWorkspace({ slug: "primary", name: "Primary" });
    const output = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      '{"v":1,"id":"hello","method":"system.hello"}',
    ].join("\n") + "\n");
    const responses = output.trim().split("\n").map((line) => JSON.parse(line) as { id: string | null; ok: boolean; error?: { code: string } });
    expect(responses.some((response) => response.id === null && response.error?.code === "E_PROTOCOL_INVALID")).toBe(true);
  });

  test("drains the subscription acknowledgement before activity events", async () => {
    root = makeTmpRoot("ralphy-bridge-activity");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    let resolveLines: (() => void) | undefined;
    stdout.on("data", (chunk: Buffer) => {
      lines.push(...Buffer.from(chunk).toString("utf8").trim().split("\n").filter(Boolean));
      resolveLines?.();
      resolveLines = undefined;
    });
    const server = runBridge({ dataRoot: `${root.dir}/.ralphy`, input: stdin, output: stdout });
    stdin.write('{"v":1,"id":"hello","method":"system.hello"}\n');
    stdin.write('{"v":1,"id":"sub","method":"activity.subscribe","params":{"subscriptionId":"s1","afterSequence":1}}\n');
    await new Promise<void>((resolve) => {
      if (lines.length >= 2) resolve();
      else resolveLines = resolve;
    });
    createProject({ workspaceId: workspace.id, slug: "activity", name: "Activity" });
    await new Promise<void>((resolve) => {
      const check = () => {
        if (lines.length >= 3) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    stdin.end();
    await server;
    const events = lines.map((line) => JSON.parse(line) as { event?: string; id?: string; sequence?: number });
    expect(events[1]?.id).toBe("sub");
    expect(events[2]?.event).toBe("activity");
    expect(events[2]?.sequence).toBeGreaterThan(1);
  });
});
