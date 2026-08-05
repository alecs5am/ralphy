import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  inspectMigrationProcessIdentity,
  inspectMigrationProcessIdentityState,
  type MigrationProcessIdentity,
} from "../../cli/lib/migration/process-identity.js";

const HASH = "a".repeat(64);

function identity(overrides: Partial<MigrationProcessIdentity> = {}): MigrationProcessIdentity {
  return {
    pid: 41,
    parentPid: 40,
    uid: 501,
    startId: "test:1:2",
    executable: {
      pathHash: HASH,
      device: "1",
      inode: "2",
      mode: 0o755,
      uid: 0,
      nlink: 1,
    },
    ...overrides,
  };
}

describe("migration process identity", () => {
  test("returns an identity only after two identical reads", () => {
    let reads = 0;
    const expected = identity();

    expect(inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      read: () => {
        reads += 1;
        return structuredClone(expected);
      },
    })).toEqual(expected);
    expect(reads).toBe(2);
  });

  test("rejects PID reuse or any inconsistent second read", () => {
    let reads = 0;
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "linux",
      read: () => identity({ startId: reads++ === 0 ? "linux:10" : "linux:11" }),
    })).toThrow(/changed|identity|consistent/i);
  });

  test("fails closed when the backend is short, denied, or unavailable", () => {
    for (const message of ["short proc_pidinfo read", "permission denied", "process disappeared"]) {
      expect(() => inspectMigrationProcessIdentity(41, {
        platform: "darwin",
        read: () => { throw new Error(message); },
      })).toThrow(/unavailable/i);
    }
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "win32",
    })).toThrow(/unsupported/i);
  });

  test("distinguishes an absent process from an unknown inspection failure", () => {
    const read = () => { throw new Error("inspection failed"); };
    expect(inspectMigrationProcessIdentityState(41, {
      platform: "darwin",
      read,
      presence: () => "absent",
    })).toEqual({ status: "absent" });
    expect(inspectMigrationProcessIdentityState(41, {
      platform: "darwin",
      read,
      presence: () => "present",
    })).toEqual({ status: "unknown", reason: "Migration process identity is unavailable" });
    expect(inspectMigrationProcessIdentityState(999_999_999, {
      platform: "win32",
    })).toEqual({
      status: "unknown",
      reason: "Migration process identity platform is unsupported: win32",
    });
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      read,
      presence: () => "absent",
    })).toThrow(/unavailable/i);
  });

  test("rejects malformed backend identities", () => {
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      read: () => identity({ pid: 42 }),
    })).toThrow(/invalid|identity/i);
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      read: () => identity({ executable: { ...identity().executable, pathHash: "short" } }),
    })).toThrow(/invalid|identity/i);
    expect(inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      read: () => identity({ executable: { ...identity().executable, mode: 0o4755 } }),
    }).executable.mode).toBe(0o4755);
  });

  test("reads Darwin effective UID and rejects a short proc_pidinfo record", () => {
    const symbols = {
      proc_pidinfo(pid: number, _flavor: number, _arg: bigint, buffer: Buffer): number {
        buffer.writeUInt32LE(pid, 12);
        buffer.writeUInt32LE(40, 16);
        buffer.writeUInt32LE(502, 20);
        buffer.writeUInt32LE(501, 28);
        buffer.writeBigUInt64LE(100n, 120);
        buffer.writeBigUInt64LE(900n, 128);
        return buffer.length;
      },
      proc_pidpath(_pid: number, buffer: Buffer): number {
        return buffer.write(process.execPath, "utf8");
      },
    };
    expect(inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      darwinSymbols: symbols,
    }).uid).toBe(502);
    expect(() => inspectMigrationProcessIdentity(41, {
      platform: "darwin",
      darwinSymbols: { ...symbols, proc_pidinfo: () => 135 },
    })).toThrow(/unavailable/i);
  });

  test("parses Linux PID, parent, effective UID, and a comm containing spaces and closing parentheses", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-process-identity-"));
    const procRoot = fs.realpathSync(root);
    const pid = 41;
    const processRoot = path.join(procRoot, String(pid));
    fs.mkdirSync(processRoot);
    fs.writeFileSync(
      path.join(processRoot, "stat"),
      `${pid} (worker ) with spaces) S 40 ${Array(17).fill("0").join(" ")} 12345\n`,
    );
    fs.writeFileSync(path.join(processRoot, "status"), "Name:\tworker\nUid:\t501\t502\t503\t504\n");
    fs.symlinkSync(fs.realpathSync(process.execPath), path.join(processRoot, "exe"));
    try {
      const actual = inspectMigrationProcessIdentity(pid, { platform: "linux", procRoot });
      expect(actual).toMatchObject({ pid, parentPid: 40, uid: 502, startId: "linux:12345" });
      fs.writeFileSync(
        path.join(processRoot, "stat"),
        `42 (worker ) with spaces) S 40 ${Array(17).fill("0").join(" ")} 12345\n`,
      );
      expect(() => inspectMigrationProcessIdentity(pid, { platform: "linux", procRoot }))
        .toThrow(/unavailable/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a process-start change around executable inspection", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-process-sandwich-"));
    const procRoot = fs.realpathSync(root);
    const pid = 41;
    const processRoot = path.join(procRoot, String(pid));
    const statPath = path.join(processRoot, "stat");
    fs.mkdirSync(processRoot);
    const line = (start: number) => `${pid} (worker) S 40 ${Array(17).fill("0").join(" ")} ${start}\n`;
    fs.writeFileSync(statPath, line(10));
    fs.writeFileSync(path.join(processRoot, "status"), "Uid:\t501\t502\t503\t504\n");
    fs.symlinkSync(fs.realpathSync(process.execPath), path.join(processRoot, "exe"));
    let changed = false;
    try {
      expect(() => inspectMigrationProcessIdentity(pid, {
        platform: "linux",
        procRoot,
        afterProcessSnapshot: () => {
          if (!changed) {
            changed = true;
            fs.writeFileSync(statPath, line(11));
          }
        },
      })).toThrow(/unavailable|changed/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("inspects the current process with a stable subsecond identity", () => {
    if (process.platform !== "darwin" && process.platform !== "linux") return;
    const actual = inspectMigrationProcessIdentity(process.pid);
    expect(actual.pid).toBe(process.pid);
    expect(actual.parentPid).toBe(process.ppid);
    expect(actual.uid).toBe(process.getuid?.() ?? actual.uid);
    expect(actual.startId).toMatch(process.platform === "darwin"
      ? /^darwin:\d+:\d+$/
      : /^linux:\d+$/);
    const executablePath = fs.realpathSync(process.execPath);
    const executable = fs.statSync(executablePath, { bigint: true });
    expect(actual.executable).toEqual({
      pathHash: new Bun.CryptoHasher("sha256").update(executablePath).digest("hex"),
      device: String(executable.dev),
      inode: String(executable.ino),
      mode: Number(executable.mode & 0o7777n),
      uid: Number(executable.uid),
      nlink: Number(executable.nlink),
    });
  });

  test("binds a direct child's exact parent PID", async () => {
    if (process.platform !== "darwin" && process.platform !== "linux") return;
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    try {
      let actual: MigrationProcessIdentity | undefined;
      for (let attempt = 0; attempt < 50 && !actual; attempt += 1) {
        try {
          if (child.pid) actual = inspectMigrationProcessIdentity(child.pid);
        } catch {
          await Bun.sleep(10);
        }
      }
      expect(actual?.pid).toBe(child.pid);
      expect(actual?.parentPid).toBe(process.pid);
    } finally {
      const closed = child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once("close", () => resolve()));
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
    }
  });
});
