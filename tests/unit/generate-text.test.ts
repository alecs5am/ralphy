import { afterEach, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { generateText } from "../../cli/commands/generate-text.js";
import { clearCommandContext, setCommandContext } from "../../cli/lib/context-state.js";
import { activateCredentialResolver, clearActiveCredentialResolver, createCredentialResolver } from "../../cli/lib/providers/credentials.js";
import { providerMatrix } from "../../cli/lib/providers/registry.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { createSecretStore } from "../../cli/lib/store/secrets.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { getRunAggregate } from "../helpers/run-aggregate.js";

let root: TmpRoot | undefined;
let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; clearActiveCredentialResolver(); clearCommandContext(); closeDomainDb(); root?.cleanup(); });
async function setup() {
  root = makeTmpRoot("generate-text");
  const workspace = createWorkspace({ slug: "selected", name: "Selected" });
  const context = { kind: "scope" as const, workspaceId: workspace.id };
  setCommandContext(context);
  const resolver = createCredentialResolver({ dataRoot: path.join(root.dir, ".ralphy"), context, capturedEnvironment: new Map([["openrouter", "saved-fallback"]]), secretStore: createSecretStore({ dataRoot: path.join(root.dir, ".ralphy"), keyProvider: { lookupKey: async () => Buffer.alloc(32, 17), createKey: async () => Buffer.alloc(32, 17) } }) });
  await resolver.set("openrouter", "selected-workspace-key");
  await activateCredentialResolver(resolver, ["openrouter"]);
  return { workspace, resolver };
}

test("text availability and execution share the workspace credential, preserving reported cost without exposing raw provider data", async () => {
  const { workspace } = await setup();
  let authorization: unknown;
  const mocked = spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    authorization = (init?.headers as Record<string, string>).Authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "A real response" }, finish_reason: "stop" }], usage: { cost: 0.012 }, internal: "selected-workspace-key" }));
  }); restore = () => mocked.mockRestore();
  expect(providerMatrix().find((row) => row.id === "openrouter")?.available).toBe(true);
  const result = await generateText({ model: "test/model", prompt: "A prompt", provider: "openrouter" });
  expect(authorization).toBe("Bearer selected-workspace-key");
  expect(result).toMatchObject({ text: "A real response", costUsd: 0.012 });
  expect(JSON.stringify(result)).not.toContain("selected-workspace-key");
  expect(getRunAggregate(result.runId)).toMatchObject({ workspaceId: workspace.id, state: "succeeded", attempts: [{ state: "succeeded", costUsd: 0.012 }] });
  expect(mocked).toHaveBeenCalledTimes(1);
});

test("unknown text cost stays null and an ambiguous network failure has one durable failed attempt without retry", async () => {
  await setup();
  const mocked = spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Response" }, finish_reason: "stop" }] }))).mockRejectedValueOnce(new Error("ECONNRESET")); restore = () => mocked.mockRestore();
  const result = await generateText({ model: "test/model", prompt: "A prompt" });
  expect(result.costUsd).toBeNull();
  expect(getRunAggregate(result.runId).attempts[0]?.costUsd).toBeNull();
  await expect(generateText({ model: "test/model", prompt: "Another prompt" })).rejects.toThrow();
  expect(mocked).toHaveBeenCalledTimes(2);
  expect(openDomainDb().query("SELECT state FROM runs WHERE id != ?").all(result.runId)).toEqual([{ state: "failed" }]);
});

test("cancelled text requests finish their attempt locally and do not submit again", async () => {
  await setup();
  const controller = new AbortController();
  const mocked = spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    controller.abort(new Error("Cancelled"));
    init?.signal?.throwIfAborted();
    throw new Error("Expected cancellation signal");
  }); restore = () => mocked.mockRestore();
  await expect(generateText({ model: "test/model", prompt: "A prompt", signal: controller.signal })).rejects.toThrow();
  expect(mocked).toHaveBeenCalledTimes(1);
  expect(openDomainDb().query("SELECT state FROM runs").all()).toEqual([{ state: "cancelled" }]);
  expect(openDomainDb().query("SELECT state FROM run_attempts").all()).toEqual([{ state: "cancelled" }]);
});

test("invalid text input is rejected before recording or submitting an attempt", async () => {
  await setup();
  const mocked = spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Must not submit"); }); restore = () => mocked.mockRestore();
  for (const input of [{ model: "invalid model", prompt: "Prompt" }, { model: "test/model", prompt: " " }, { model: "test/model", prompt: "x".repeat(100_001) }]) {
    await expect(generateText(input)).rejects.toThrow();
  }
  expect(mocked).not.toHaveBeenCalled();
  expect(openDomainDb().query("SELECT id FROM runs").all()).toEqual([]);
});
