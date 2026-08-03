import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseStartupCredentialTransfer,
  safeChildEnvironment,
  startupCredentialTransfer,
} from "../../cli/lib/providers/credentials.js";
import { daemonChildEnvironment } from "../../cli/lib/jobs/daemon.js";
import { jobChildEnvironment } from "../../cli/lib/jobs/worker.js";
import { articleChildEnvironment } from "../../cli/lib/publish/article.js";

const SECRET_SENTINEL = "task-2b-child-secret-sentinel";

const inherited: NodeJS.ProcessEnv = {
  HOME: "/tmp/test-home",
  PATH: "/usr/bin:/bin",
  TMPDIR: "/tmp/test-tmp",
  LANG: "C.UTF-8",
  OPENROUTER_API_KEY: SECRET_SENTINEL,
  ELEVENLABS_API_KEY: SECRET_SENTINEL,
  NODE_OPTIONS: `--require ${SECRET_SENTINEL}`,
  DYLD_INSERT_LIBRARIES: SECRET_SENTINEL,
  BASH_ENV: SECRET_SENTINEL,
  ENV: SECRET_SENTINEL,
  CDPATH: SECRET_SENTINEL,
  ARBITRARY_PROJECT_SECRET: SECRET_SENTINEL,
};

describe("credential-safe child environments", () => {
  test("the fixed safe base drops credentials, loader hooks, and shell startup variables", () => {
    const child = safeChildEnvironment({ inherited });

    expect(child).toEqual({
      HOME: "/tmp/test-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp/test-tmp",
      LANG: "C.UTF-8",
    });
    expect(JSON.stringify(child)).not.toContain(SECRET_SENTINEL);
  });

  test("only the one explicitly requested resolved credential is injected", () => {
    const child = safeChildEnvironment({
      inherited,
      credential: {
        descriptor: {
          providerId: "openrouter",
          kind: "api-key",
          environmentVariable: "OPENROUTER_API_KEY",
        },
        value: "one-requested-test-value",
      },
    });

    expect(child.OPENROUTER_API_KEY).toBe("one-requested-test-value");
    expect(child.ELEVENLABS_API_KEY).toBeUndefined();
    expect(child.ARBITRARY_PROJECT_SECRET).toBeUndefined();
    expect(child.NODE_OPTIONS).toBeUndefined();
  });

  test("credential descriptors cannot target safe-base, loader, or shell names", () => {
    for (const environmentVariable of [
      "HOME",
      "PATH",
      "NODE_OPTIONS",
      "DYLD_INSERT_LIBRARIES",
      "BASH_ENV",
      "ENV",
      "CDPATH",
    ]) {
      expect(() =>
        safeChildEnvironment({
          inherited,
          credential: {
            descriptor: {
              providerId: "invalid",
              kind: "api-key",
              environmentVariable,
            },
            value: "test-value",
          },
        }),
      ).toThrow(expect.objectContaining({ code: "E_INPUT_INVALID" }));
    }
  });

  test("worker, daemon, and article boundaries use the safe builder", () => {
    expect(
      jobChildEnvironment({
        inherited,
        commandEnvironment: {
          HOME: SECRET_SENTINEL,
          OPENROUTER_API_KEY: SECRET_SENTINEL,
        },
      }),
    ).toEqual({
      HOME: "/tmp/test-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp/test-tmp",
      LANG: "C.UTF-8",
    });
    expect(daemonChildEnvironment(inherited)).toEqual({
      HOME: "/tmp/test-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp/test-tmp",
      LANG: "C.UTF-8",
      RALPHY_DAEMON: "1",
    });
    expect(articleChildEnvironment(inherited)).toEqual({
      HOME: "/tmp/test-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp/test-tmp",
      LANG: "C.UTF-8",
    });

    const serialized = JSON.stringify({
      worker: jobChildEnvironment({ inherited }),
      daemon: daemonChildEnvironment(inherited),
      article: articleChildEnvironment(inherited),
    });
    expect(serialized).not.toContain(SECRET_SENTINEL);
  });

  test("daemon credentials use the private startup payload, not its environment", () => {
    const payload = startupCredentialTransfer(
      new Map([["openrouter", SECRET_SENTINEL]]),
    );
    const captured = parseStartupCredentialTransfer(payload);

    expect(captured.get("openrouter")).toBe(SECRET_SENTINEL);
    expect(daemonChildEnvironment(inherited).OPENROUTER_API_KEY).toBeUndefined();
    expect(() =>
      parseStartupCredentialTransfer(
        JSON.stringify({ "unknown-provider": SECRET_SENTINEL }),
      ),
    ).toThrow(expect.objectContaining({ code: "E_INPUT_INVALID" }));
  });

  test("an actual child capture contains neither inherited sentinel nor secret argv", () => {
    const argv = [
      "-e",
      "process.stdout.write(JSON.stringify(process.env))",
    ];
    const child = spawnSync(process.execPath, argv, {
      encoding: "utf8",
      env: jobChildEnvironment({ inherited }),
    });
    expect(child.status).toBe(0);
    expect(JSON.stringify(argv)).not.toContain(SECRET_SENTINEL);
    expect(child.stdout).not.toContain(SECRET_SENTINEL);
    expect(child.stderr).not.toContain(SECRET_SENTINEL);
    expect(JSON.parse(child.stdout)).toEqual({
      HOME: "/tmp/test-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp/test-tmp",
      LANG: "C.UTF-8",
    });
  });

  test("the three audited spawn sites never spread process.env", () => {
    const files = [
      "cli/lib/jobs/worker.ts",
      "cli/lib/jobs/daemon.ts",
      "cli/lib/publish/article.ts",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\.\.\.process\.env/u);
      expect(source).not.toMatch(/env\s*:\s*process\.env/u);
    }
  });
});
