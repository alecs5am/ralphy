import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { getRunAggregate } from "../helpers/run-aggregate.js";

let root: TmpRoot | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => { server?.stop(true); server = undefined; closeDomainDb(); root?.cleanup(); });

test("generate text accepts the desktop workspace/stdin contract and records the scoped attempt", async () => {
  root = makeTmpRoot("cli-generate-text");
  const workspace = createWorkspace({ slug: "canvas", name: "Canvas" });
  closeDomainDb();
  let submitted: unknown;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    submitted = await request.json();
    return Response.json({ choices: [{ message: { content: "Fixture text" }, finish_reason: "stop" }] });
  } });
  fs.writeFileSync(path.join(root.dir, ".ralphy", "config.json"), JSON.stringify({ providers: [{ id: "fixture", kind: "openai-compatible", baseUrl: `http://127.0.0.1:${server.port}/v1`, capabilities: ["text"] }] }));
  const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../../cli/index.ts"), "--root", path.join(root.dir, ".ralphy"), "--workspace", workspace.id, "--json", "generate", "text", "--model", "test/text", "--provider", "fixture", "--stdin", "--no-retry"], { cwd: root.dir, stdin: new Blob(["Private prompt from stdin"]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  const result = JSON.parse(stdout);
  expect(result).toMatchObject({ text: "Fixture text", provider: "fixture", costUsd: null });
  expect(submitted).toMatchObject({ model: "test/text", messages: [{ role: "user", content: "Private prompt from stdin" }] });
  expect(getRunAggregate(result.runId)).toMatchObject({ workspaceId: workspace.id, kind: "generate.text", state: "succeeded", attempts: [{ state: "succeeded", costUsd: null }] });
});
