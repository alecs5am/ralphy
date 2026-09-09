import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";

import {
  SECRET_HANDOFF_REQUEST_MAX_BYTES,
  assertCanonicalStagedRoot,
  dispatchDesktopStartup,
  parseSecretHandoffRequest,
  readSecretHandoffRequest,
  runSecretHandoff,
  secretFileForProvider,
  type SecretHandoffBridge,
} from "../electron/migration/secret-handoff";

const runId = "mig_11111111-1111-4111-8111-111111111111";
const sourceEntryId = "mentry_22222222-2222-4222-8222-222222222222";
const workspaceId = "ws_33333333-3333-4333-8333-333333333333";
const rootId = "a".repeat(64);
const rootDevice = 16_777_234;
const rootInode = 123_456;
const authorizationNonce = "55555555-5555-4555-8555-555555555555";
const execFileAsync = promisify(execFile);

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    authorizationNonce,
    runId,
    stagedRoot: `/tmp/ralphy/.ralphy-staging/${runId}/.ralphy`,
    sourceEntryId,
    ref: `provider/anthropic/workspace/${workspaceId}/workspace/${workspaceId}`,
    kind: "text",
    ...overrides,
  };
}

function frame(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

describe("migration secret handoff request", () => {
  test("accepts the exact metadata-only Core authorization contract", () => {
    const coreRequest = {
      v: 1,
      authorizationNonce: "55555555-5555-4555-8555-555555555555",
      runId,
      stagedRoot: `/tmp/ralphy/.ralphy-staging/${runId}/.ralphy`,
      sourceEntryId,
      ref: `provider/anthropic/workspace/${workspaceId}/workspace/${workspaceId}`,
      kind: "text",
    };

    expect(parseSecretHandoffRequest(frame(coreRequest))).toEqual(coreRequest);
  });

  test.each([
    ["missing terminal LF", JSON.stringify(request())],
    ["CRLF", `${JSON.stringify(request())}\r\n`],
    ["extra line", `${JSON.stringify(request())}\n\n`],
    ["leading whitespace", ` ${JSON.stringify(request())}\n`],
  ])("rejects %s in the exact one-line Core frame", (_name, raw) => {
    expect(() => parseSecretHandoffRequest(raw)).toThrow();
  });

  test("parses the exact bounded stdin request", async () => {
    const raw = frame(request());
    const parsed = parseSecretHandoffRequest(raw);
    expect(parsed).toEqual(request());

    async function* chunks(): AsyncGenerator<Buffer> {
      yield Buffer.from(raw.slice(0, 17));
      yield Buffer.from(raw.slice(17));
    }
    await expect(readSecretHandoffRequest(chunks())).resolves.toEqual(request());
  });

  test("maps only the two audited providers to their owned files", () => {
    expect(secretFileForProvider("anthropic")).toBe("claude-api-key.bin");
    expect(secretFileForProvider("openrouter")).toBe("openrouter-api-key.bin");
    expect(() => secretFileForProvider("claude")).toThrow();
    expect(() => secretFileForProvider("__proto__")).toThrow();
  });

  test.each([
    ["extra field", request({ extra: true })],
    ["missing field", (() => { const value = request(); delete value.ref; return value; })()],
    ["wrong version", request({ v: 2 })],
    ["relative root", request({ stagedRoot: `.ralphy-staging/${runId}/.ralphy` })],
    ["normal live root", request({ stagedRoot: "/tmp/ralphy/.ralphy" })],
    ["non-normal root", request({ stagedRoot: `/tmp/ralphy/../ralphy/.ralphy-staging/${runId}/.ralphy` })],
    ["root run mismatch", request({ stagedRoot: "/tmp/ralphy/.ralphy-staging/mig_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/.ralphy" })],
    ["invalid authorization nonce", request({ authorizationNonce: "short" })],
    ["unsafe migration id", request({ runId: "mig_../escape" })],
    ["unsafe source entry id", request({ sourceEntryId: "entry_missing" })],
    ["ref workspace mismatch", request({ ref: `provider/anthropic/workspace/${workspaceId}/workspace/ws_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` })],
    ["unsupported provider", request({ ref: `provider/claude/workspace/${workspaceId}/workspace/${workspaceId}` })],
    ["unsupported kind", request({ kind: "file" })],
  ])("rejects %s", (_name, value) => {
    expect(() => parseSecretHandoffRequest(frame(value))).toThrow();
  });

  test("rejects malformed, multiple, empty, and oversized stdin", async () => {
    expect(() => parseSecretHandoffRequest("not-json\n")).toThrow();
    expect(() => parseSecretHandoffRequest(`${JSON.stringify(request())}\n{}`)).toThrow();
    expect(() => parseSecretHandoffRequest("")).toThrow();

    async function* oversized(): AsyncGenerator<Buffer> {
      yield Buffer.alloc(SECRET_HANDOFF_REQUEST_MAX_BYTES, 0x20);
      yield Buffer.from("x");
    }
    await expect(readSecretHandoffRequest(oversized())).rejects.toThrow();
  });

  test("rejects a staged-root symlink before credential access", async () => {
    const fixture = await realpath(await mkdtemp(join(tmpdir(), "ralphy-secret-handoff-")));
    const runRoot = join(fixture, ".ralphy-staging", runId);
    const liveRoot = join(fixture, ".ralphy");
    const stagedRoot = join(runRoot, ".ralphy");
    try {
      await mkdir(runRoot, { recursive: true });
      await mkdir(liveRoot);
      await symlink(liveRoot, stagedRoot);
      await expect(assertCanonicalStagedRoot(stagedRoot)).rejects.toThrow();
      await rm(stagedRoot);
      await mkdir(stagedRoot);
      await expect(assertCanonicalStagedRoot(stagedRoot)).resolves.toBeUndefined();
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

describe("migration secret handoff lifecycle", () => {
  function setupBridge(options: {
    result?: unknown;
    startError?: Error;
    requestError?: Error;
  } = {}) {
    const calls = { created: 0, started: 0, requested: [] as unknown[][], closed: 0 };
    const bridge: SecretHandoffBridge = {
      async start() {
        calls.started += 1;
        if (options.startError) throw options.startError;
        return { rootId };
      },
      async request(method, params) {
        calls.requested.push([method, params]);
        if (options.requestError) throw options.requestError;
        return options.result ?? {
          ref: request().ref,
          kind: "text",
          completed: true,
        };
      },
      async close() {
        calls.closed += 1;
      },
    };
    return {
      calls,
      createBridge(root: string) {
        calls.created += 1;
        expect(root).toBe(request().stagedRoot);
        return bridge;
      },
    };
  }

  const identity = { rootId, rootDevice, rootInode };
  const handoffPaths = {
    sourcePath: "/tmp/ralphy/.ralphy",
    encryptedSourcePath: "/tmp/desktop/claude-api-key.bin",
  };

  test("passes the exact Core authorization envelope to the write-only bridge", async () => {
    const fixture = setupBridge();
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => "sk-ant-fixture-secret-value" },
        openrouter: { read: async () => null },
      },
      createBridge: fixture.createBridge,
      captureRoot: async () => identity,
      sourcePath: "/tmp/ralphy/.ralphy",
      encryptedSourcePath: "/tmp/desktop/claude-api-key.bin",
    })).resolves.toBeUndefined();

    expect(fixture.calls.requested).toEqual([["migration.secret.import", {
      sourcePath: "/tmp/ralphy/.ralphy",
      encryptedSourcePath: "/tmp/desktop/claude-api-key.bin",
      authorizationNonce,
      runId,
      sourceEntryId,
      ref: request().ref,
      kind: "text",
      value: "sk-ant-fixture-secret-value",
    }]]);
  });

  test("validates the physical staged root before decrypting", async () => {
    const fixture = setupBridge();
    const read = vi.fn(async () => "sk-ant-fixture-secret-value");
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: { anthropic: { read }, openrouter: { read: async () => null } },
      createBridge: fixture.createBridge,
      captureRoot: async () => { throw new Error("staged root is an alias"); },
      ...handoffPaths,
    })).rejects.toThrow("staged root is an alias");
    expect(read).not.toHaveBeenCalled();
    expect(fixture.calls.created).toBe(0);
  });

  test("decrypts one selected entry and sends one write-only bridge request", async () => {
    const fixture = setupBridge();
    const reads = { anthropic: 0, openrouter: 0 };
    const secret = "sk-ant-fixture-secret-value";

    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => { reads.anthropic += 1; return secret; } },
        openrouter: { read: async () => { reads.openrouter += 1; return "unused"; } },
      },
      createBridge: fixture.createBridge,
      captureRoot: async () => identity,
      ...handoffPaths,
    })).resolves.toBeUndefined();

    expect(reads).toEqual({ anthropic: 1, openrouter: 0 });
    expect(fixture.calls).toEqual({
      created: 1,
      started: 1,
      requested: [["migration.secret.import", {
        ...handoffPaths,
        authorizationNonce,
        runId,
        sourceEntryId,
        ref: request().ref,
        kind: "text",
        value: secret,
      }]],
      closed: 1,
    });
  });

  test("reads only the selected OpenRouter credential store", async () => {
    const openrouterRef = `provider/openrouter/workspace/${workspaceId}/workspace/${workspaceId}`;
    const fixture = setupBridge({ result: { ref: openrouterRef, kind: "text", completed: true } });
    const anthropicRead = vi.fn(async () => "unused");
    const openrouterRead = vi.fn(async () => "sk-or-v1-fixture-secret-1234567890");
    await runSecretHandoff(parseSecretHandoffRequest(frame(request({
      ref: openrouterRef,
    }))), {
      stores: {
        anthropic: { read: anthropicRead },
        openrouter: { read: openrouterRead },
      },
      createBridge: fixture.createBridge,
      captureRoot: async () => identity,
      ...handoffPaths,
    });
    expect(anthropicRead).not.toHaveBeenCalled();
    expect(openrouterRead).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["missing", async () => null],
    ["decrypt-invalid", async () => { throw new Error("decrypt failed"); }],
  ])("fails closed before starting a bridge for a %s credential", async (_name, read) => {
    const fixture = setupBridge();
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: { anthropic: { read }, openrouter: { read: async () => null } },
      createBridge: fixture.createBridge,
      captureRoot: async () => identity,
      ...handoffPaths,
    })).rejects.toThrow();
    expect(fixture.calls).toEqual({ created: 0, started: 0, requested: [], closed: 0 });
  });

  test.each([
    ["wrong ref", { ref: "provider/anthropic/workspace/ws_wrong/workspace/ws_wrong", kind: "text", completed: true }],
    ["wrong kind", { ref: request().ref, kind: "file", completed: true }],
    ["not completed", { ref: request().ref, kind: "text", completed: false }],
    ["extra field", { ref: request().ref, kind: "text", completed: true, secret: "leak" }],
    ["missing field", { ref: request().ref, completed: true }],
  ])("rejects a %s bridge result and closes the child", async (_name, result) => {
    const fixture = setupBridge({ result });
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => "sk-ant-fixture-secret-value" },
        openrouter: { read: async () => null },
      },
      createBridge: fixture.createBridge,
      captureRoot: async () => identity,
      ...handoffPaths,
    })).rejects.toThrow();
    expect(fixture.calls.closed).toBe(1);
  });

  test.each([
    ["start failure", { startError: new Error("child failed") }],
    ["request failure", { requestError: new Error("child failed") }],
  ])("closes the bridge after %s without writing stdout or stderr", async (_name, options) => {
    const fixture = setupBridge(options);
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");
    try {
      await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
        stores: {
          anthropic: { read: async () => "sk-ant-fixture-secret-value" },
          openrouter: { read: async () => null },
        },
        createBridge: fixture.createBridge,
        captureRoot: async () => identity,
        ...handoffPaths,
      })).rejects.toThrow("child failed");
      expect(fixture.calls.closed).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  test("fences the same root identity around hello and the import request", async () => {
    const fixture = setupBridge();
    const captureRoot = vi.fn(async () => identity);
    await runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => "sk-ant-fixture-secret-value" },
        openrouter: { read: async () => null },
      },
      createBridge: fixture.createBridge,
      captureRoot,
      ...handoffPaths,
    });
    expect(captureRoot).toHaveBeenCalledTimes(5);
  });

  test("rejects a root swap and a mismatched bridge root identity", async () => {
    const swapped = { ...identity, rootInode: rootInode + 1 };
    const fixture = setupBridge();
    let captures = 0;
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => "sk-ant-fixture-secret-value" },
        openrouter: { read: async () => null },
      },
      createBridge: fixture.createBridge,
      captureRoot: async () => (++captures === 3 ? swapped : identity),
      ...handoffPaths,
    })).rejects.toThrow();
    expect(fixture.calls.requested).toHaveLength(0);
    expect(fixture.calls.closed).toBe(1);

    const wrongHello = setupBridge();
    const originalStart = wrongHello.createBridge;
    await expect(runSecretHandoff(parseSecretHandoffRequest(frame(request())), {
      stores: {
        anthropic: { read: async () => "sk-ant-fixture-secret-value" },
        openrouter: { read: async () => null },
      },
      createBridge: (root) => ({
        ...originalStart(root),
        start: async () => ({ rootId: "b".repeat(64) }),
      }),
      captureRoot: async () => identity,
      ...handoffPaths,
    })).rejects.toThrow();
  });

  test("selects helper mode before every normal Desktop startup seam", () => {
    const helper = vi.fn();
    const seams = {
      ipc: vi.fn(),
      protocol: vi.fn(),
      window: vi.fn(),
      watcher: vi.fn(),
      interval: vi.fn(),
      terminal: vi.fn(),
      agent: vi.fn(),
      restart: vi.fn(),
    };
    const normal = vi.fn(() => Object.values(seams).forEach((start) => start()));

    dispatchDesktopStartup(["electron", "app", "--migration-secret-handoff"], helper, normal);

    expect(helper).toHaveBeenCalledTimes(1);
    expect(normal).not.toHaveBeenCalled();
    for (const start of Object.values(seams)) expect(start).not.toHaveBeenCalled();
  });
});

describe("packaged migration secret handoff smoke", () => {
  async function packagedFixture(helperOutput = ""): Promise<{
    app: string;
    cleanup(): Promise<void>;
  }> {
    const fixture = await realpath(await mkdtemp(join(tmpdir(), "ralphy-secret-smoke-")));
    const app = join(fixture, "Ralphy Media.app");
    const resources = join(app, "Contents", "Resources");
    const macos = join(app, "Contents", "MacOS");
    const core = join(resources, "bin", "ralphy");
    const executable = join(macos, "Ralphy Media");
    await mkdir(join(resources, "bin"), { recursive: true });
    await mkdir(macos, { recursive: true });
    await writeFile(core, `#!/usr/bin/env node\nprocess.stdout.write("9.9.9\\n");\n`);
    await chmod(core, 0o755);
    const sha256 = createHash("sha256").update(await readFile(core)).digest("hex");
    await writeFile(join(resources, "ralphy-core.json"), JSON.stringify({ version: "9.9.9", sha256 }));
    await writeFile(executable, `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (!process.argv.includes("--migration-secret-handoff") || !process.argv.includes("--smoke-test")) {
    process.stdout.write("RALPHY_TERMINAL_BRIDGE_READY\\nRALPHY_SMOKE_READY\\n");
    process.exit(0);
  }
  if (!input.endsWith("\\n") || input.indexOf("\\n") !== input.length - 1) process.exit(2);
  const request = JSON.parse(input.slice(0, -1));
  const keys = Object.keys(request);
  const expected = ["v", "authorizationNonce", "runId", "stagedRoot", "sourceEntryId", "ref", "kind"];
  if (JSON.stringify(keys) !== JSON.stringify(expected)
    || request.kind !== "text"
    || Object.hasOwn(request, "value")
    || Object.hasOwn(request, "secret")) process.exit(2);
  process.stdout.write(${JSON.stringify(helperOutput)});
  process.exit(0);
});
`);
    await chmod(executable, 0o755);
    return { app, cleanup: () => rm(fixture, { recursive: true, force: true }) };
  }

  async function runPackagedSmoke(app: string) {
    return execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "smoke-electron.mjs"),
      "--secret-handoff",
    ], {
      cwd: process.cwd(),
      env: { ...process.env, RALPHY_PACKAGED_APP: app },
    });
  }

  test("selects the silent helper branch with the exact current Core frame", async () => {
    const fixture = await packagedFixture();
    try {
      await expect(runPackagedSmoke(fixture.app)).resolves.toMatchObject({
        stdout: "Packaged secret handoff smoke passed\n",
        stderr: "",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  test("rejects any helper startup marker or protocol output", async () => {
    const fixture = await packagedFixture("RALPHY_WATCHER_STARTED\n");
    try {
      await expect(runPackagedSmoke(fixture.app)).rejects.toThrow();
    } finally {
      await fixture.cleanup();
    }
  });
});
