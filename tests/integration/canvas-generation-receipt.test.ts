import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createCanvasRuntime, type RuntimeDependencies } from "../../apps/desktop/electron/canvas/runtime.js";
import { saveCanvas } from "../../apps/desktop/electron/canvas/store.js";
import { RalphyBridgeClient } from "../../apps/desktop/electron/ralphy/client.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot | undefined, client: RalphyBridgeClient | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(async () => { await client?.close(); server?.stop(true); closeDomainDb(); tmp?.cleanup(); });

test("Canvas reads the real generate sfx CLI receipt through the scoped bridge without requesting another generation", async () => {
  tmp = makeTmpRoot("canvas-generation-receipt");
  const root = path.join(tmp.dir, ".ralphy"), workspace = createWorkspace({ slug: "live-contract", name: "Live contract" });
  closeDomainDb();
  const bytes = Buffer.from("ID3local audio fixture"); let calls = 0;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    if (new URL(request.url).pathname !== "/v1/sound-generation") return new Response("Not found", { status: 404 });
    calls++; return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
  } });
  const cli = path.resolve(import.meta.dir, "../../cli/index.ts");
  client = new RalphyBridgeClient({ root, spawn: (_bin, args, options) => spawn(process.execPath, [cli, ...args], options) });
  await client.start();
  let receipt: Record<string, unknown> | undefined;
  const deps: RuntimeDependencies = {
    root, workspaceId: workspace.id, request: client.request.bind(client), mint: async () => ({ url: "ralphy-media://verified" }), assertCurrent() {},
    cli: async (args) => {
      const child = Bun.spawn([process.execPath, cli, "--json", "--root", root, "--workspace", workspace.id, ...args], {
        env: { ...process.env, RALPHY_ELEVENLABS_BASE_URL: `http://127.0.0.1:${server!.port}/v1`, ELEVENLABS_API_KEY: "fixture-only-not-a-real-secret", RALPHY_APP_ELEVENLABS_API_KEY: "fixture-only-not-a-real-secret", RALPHY_APP_CREDENTIALS: "elevenlabs" },
        stdout: "pipe", stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      if (code !== 0) throw new Error(stderr || stdout);
      receipt = JSON.parse(stdout); return receipt;
    },
  };
  const saved = await saveCanvas(root, workspace.id, { version: 2, id: "audio-check", name: "Audio check", edges: [], nodes: [
    { id: "sound", kind: "model", title: "Sound", value: "A quiet chime", x: 0, y: 0, config: { provider: "elevenlabs", modality: "audio", operation: "sfx", modelId: "elevenlabs-sfx", parameters: { duration: 0.5 } } },
  ] }, null);
  const runtime = createCanvasRuntime(deps);
  await runtime.start("audio-check", { mode: "execute", expectedRevision: saved.revision, nodeId: "sound" });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const run = (await runtime.list("audio-check")).items[0];
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      expect(run.error).toBeNull(); expect(run.status).toBe("succeeded");
      expect(receipt?.revisionId).toBeString(); expect(receipt?.path).toBeUndefined();
      expect(run.nodes[0].results[0].previewUrl).toBe("ralphy-media://verified");
      expect(fs.readFileSync(run.nodes[0].results[0].asset!.path)).toEqual(bytes);
      expect(calls).toBe(1); return;
    }
    await Bun.sleep(20);
  }
  throw new Error("Canvas did not finish the real CLI receipt");
}, 20_000);

test("a real CLI provider 402 returns an actionable credits error without leaking the response body", async () => {
  tmp = makeTmpRoot("generation-credits");
  const root = path.join(tmp.dir, ".ralphy"), workspace = createWorkspace({ slug: "credits", name: "Credits" });
  closeDomainDb();
  let calls = 0;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { calls++; return new Response("private provider payload", { status: 402 }); } });
  const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../../cli/index.ts"), "--json", "--quiet", "--root", root, "--workspace", workspace.id, "generate", "sfx", "--slot", "credits-check", "--prompt", "A bell", "--no-retry"], {
    env: { ...process.env, RALPHY_ELEVENLABS_BASE_URL: `http://127.0.0.1:${server.port}/v1`, RALPHY_APP_ELEVENLABS_API_KEY: "fixture-only-not-a-real-secret", RALPHY_APP_CREDENTIALS: "elevenlabs" }, stdout: "pipe", stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code).toBe(3);
  expect(JSON.parse(out || err).error).toMatchObject({ code: "E_PROVIDER_CREDITS", httpAnalog: 402 });
  expect(out + err).not.toContain("private provider payload");
  expect(calls).toBe(1);
}, 15_000);
