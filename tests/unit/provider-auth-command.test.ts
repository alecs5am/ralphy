import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Command } from "commander";
import { providerCmd } from "../../cli/commands/provider.js";
import { DomainError } from "../../cli/lib/errors/domain.js";
import type { CredentialResolver } from "../../cli/lib/providers/credentials.js";
import { setPretty } from "../../cli/lib/output.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { setMode } from "../../cli/lib/ui.js";

const SECRET_SENTINEL = "task-2b-auth-secret-sentinel";

let output: string[];
let originalLog: typeof console.log;

beforeEach(() => {
  output = [];
  originalLog = console.log;
  console.log = (...values: unknown[]) => {
    output.push(values.map(String).join(" "));
  };
  setPretty(false);
  setMode("json");
});

afterEach(() => {
  console.log = originalLog;
  setPretty(false);
  setMode("auto");
});

function fakeResolver(calls: string[]): CredentialResolver {
  return {
    async set(providerId, value, target?: { accountId?: string }) {
      const version = target && "expectedRowVersion" in target
        ? `@${String(target.expectedRowVersion)}`
        : "";
      calls.push(`set:${providerId}:${value === SECRET_SENTINEL}:${target?.accountId ?? "scope"}${version}`);
    },
    async clear(providerId, target?: { accountId?: string }) {
      calls.push(`clear:${providerId}:${target?.accountId ?? "scope"}`);
    },
    async resolve(providerId, target?: { accountId?: string }) {
      calls.push(`resolve:${providerId}:${target?.accountId ?? "scope"}`);
      return {
        configured: true,
        providerId,
        source: "encrypted",
        value: SECRET_SENTINEL,
      };
    },
    async status(providerId, target?: { accountId?: string }) {
      calls.push(`status:${providerId}:${target?.accountId ?? "scope"}`);
      return {
        configured: true,
        source: "encrypted",
        relinkRequired: false,
      };
    },
    async login(providerId) {
      calls.push(`login:${providerId}`);
      throw new DomainError("E_INPUT_INVALID", undefined, {
        field: "provider",
        detail: "provider does not support owned login",
        verb: "provider auth login",
      });
    },
  };
}

async function run(
  args: string[],
  resolver: CredentialResolver,
  readStdin = async () => SECRET_SENTINEL,
  dependencies: Parameters<typeof providerCmd>[0] = {},
) {
  const program = new Command().exitOverride();
  program.addCommand(providerCmd({ resolver, readStdin, ...dependencies }));
  const overrideTree = (command: Command): void => {
    command.exitOverride();
    for (const child of command.commands) overrideTree(child);
  };
  overrideTree(program);
  return program.parseAsync(["node", "test", ...args]);
}

describe("provider auth command", () => {
  test("set accepts the value only from stdin and emits redacted JSON", async () => {
    const calls: string[] = [];
    await run(
      ["provider", "auth", "set", "openrouter", "--stdin"],
      fakeResolver(calls),
    );

    expect(calls).toEqual(["set:openrouter:true:scope", "status:openrouter:scope"]);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toEqual({
      provider: "openrouter",
      configured: true,
      source: "encrypted",
      relinkRequired: false,
    });
    expect(output.join("\n")).not.toContain(SECRET_SENTINEL);
  });

  test("set rejects missing --stdin and a positional value before reading input", async () => {
    let reads = 0;
    const readStdin = async () => {
      reads += 1;
      return SECRET_SENTINEL;
    };
    const resolver = fakeResolver([]);

    await expect(
      run(["provider", "auth", "set", "openrouter"], resolver, readStdin),
    ).rejects.toMatchObject({ code: "commander.missingMandatoryOptionValue" });
    await expect(
      run(
        [
          "provider",
          "auth",
          "set",
          "openrouter",
          SECRET_SENTINEL,
          "--stdin",
        ],
        resolver,
        readStdin,
      ),
    ).rejects.toMatchObject({ code: "commander.excessArguments" });
    expect(reads).toBe(0);
    expect(output.join("\n")).not.toContain(SECRET_SENTINEL);
  });

  test("clear and status emit only the safe status fields", async () => {
    const calls: string[] = [];
    const resolver = fakeResolver(calls);

    await run(["provider", "auth", "clear", "openrouter"], resolver);
    await run(["provider", "auth", "status", "openrouter"], resolver);

    expect(calls).toEqual([
      "clear:openrouter:scope",
      "status:openrouter:scope",
      "status:openrouter:scope",
    ]);
    for (const line of output) {
      expect(Object.keys(JSON.parse(line)).sort()).toEqual([
        "configured",
        "provider",
        "relinkRequired",
        "source",
      ]);
      expect(line).not.toContain(SECRET_SENTINEL);
      expect(line).not.toContain("credentialRef");
      expect(line).not.toContain("value");
    }
  });

  test("login invokes only the provider-owned callback and remains unsupported", async () => {
    const calls: string[] = [];
    const error = await run(
      ["provider", "auth", "login", "openrouter"],
      fakeResolver(calls),
    ).catch((caught: unknown) => caught);

    expect(calls).toEqual(["login:openrouter"]);
    expect(error).toMatchObject({ code: "E_INPUT_INVALID" });
    expect(String(error)).not.toContain(SECRET_SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
  });

  test("account set binds the exact private ref with an expected row version", async () => {
    const calls: string[] = [];
    let state = {
      credentialRef: null as string | null,
      relinkRequired: true,
      rowVersion: 4,
    };
    const resolver = fakeResolver(calls);
    const set = resolver.set.bind(resolver);
    resolver.set = async (providerId, value, target) => {
      await set(providerId, value, target);
      if (target?.accountId) {
        state = {
          credentialRef: "provider/postiz/workspace/ws_test/account/acct_test",
          relinkRequired: false,
          rowVersion: 5,
        };
      }
    };
    await run(
      [
        "provider",
        "auth",
        "set",
        "postiz",
        "--stdin",
        "--account",
        "acct_test",
        "--row-version",
        "4",
      ],
      resolver,
      async () => SECRET_SENTINEL,
      {
        context: { kind: "scope", workspaceId: "ws_test" },
        accountCredentialState: () => state,
      },
    );

    expect(calls).toEqual([
      "set:postiz:true:acct_test@4",
      "status:postiz:acct_test",
    ]);
    expect(state.credentialRef).toBe(
      "provider/postiz/workspace/ws_test/account/acct_test",
    );
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toEqual({
      provider: "postiz",
      configured: true,
      source: "encrypted",
      relinkRequired: false,
    });
    expect(output[0]).not.toContain(SECRET_SENTINEL);
    expect(output[0]).not.toContain("provider/postiz");
  });

  test("account status combines encrypted state with the persisted relink flag", async () => {
    const calls: string[] = [];
    await run(
      ["provider", "auth", "status", "postiz", "--account", "acct_test"],
      fakeResolver(calls),
      undefined,
      {
        context: { kind: "scope", workspaceId: "ws_test" },
        accountCredentialState: () => ({
          credentialRef: "provider/postiz/workspace/ws_test/account/acct_test",
          relinkRequired: true,
          rowVersion: 7,
        }),
      },
    );

    expect(calls).toEqual(["status:postiz:acct_test"]);
    expect(JSON.parse(output[0]!)).toEqual({
      provider: "postiz",
      configured: true,
      source: "encrypted",
      relinkRequired: true,
    });
    expect(output[0]).not.toContain("credentialRef");
    expect(output[0]).not.toContain("provider/postiz");
  });

  test("account set rejects a stale row before reading or writing the secret", async () => {
    const calls: string[] = [];
    let reads = 0;
    const error = await run(
      [
        "provider",
        "auth",
        "set",
        "postiz",
        "--stdin",
        "--account",
        "acct_test",
        "--row-version",
        "3",
      ],
      fakeResolver(calls),
      async () => {
        reads += 1;
        return SECRET_SENTINEL;
      },
      {
        context: { kind: "scope", workspaceId: "ws_test" },
        accountCredentialState: () => ({
          credentialRef: null,
          relinkRequired: false,
          rowVersion: 4,
        }),
      },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "E_CONFLICT" });
    expect(reads).toBe(0);
    expect(calls).toEqual([]);
    expect(output).toEqual([]);
  });

  test("account set propagates an atomic conflict without compensation", async () => {
    const calls: string[] = [];
    const resolver = fakeResolver(calls);
    resolver.set = async (providerId, value, target) => {
      const version = target && "expectedRowVersion" in target
        ? `@${String(target.expectedRowVersion)}`
        : "";
      calls.push(`set:${providerId}:${value === SECRET_SENTINEL}:${target?.accountId ?? "scope"}${version}`);
      throw new StoreConflictError();
    };
    const error = await run(
      [
        "provider",
        "auth",
        "set",
        "postiz",
        "--stdin",
        "--account",
        "acct_test",
        "--row-version",
        "4",
      ],
      resolver,
      undefined,
      {
        context: { kind: "scope", workspaceId: "ws_test" },
        accountCredentialState: () => ({
          credentialRef: null,
          relinkRequired: false,
          rowVersion: 4,
        }),
      },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "E_CONFLICT" });
    expect(calls).toEqual(["set:postiz:true:acct_test@4"]);
    expect(output).toEqual([]);
  });
});
