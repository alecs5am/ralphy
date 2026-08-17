import { afterEach, describe, expect, test } from "vitest";
import { realpath, rm } from "node:fs/promises";
import { basename } from "node:path";

import { TerminalManager, type PtyProcessLike, type PtySpawnOptions } from "../electron/terminal/manager";
import { makeLibraryFixture } from "./fixtures";

type ExitListener = (event: { exitCode: number; signal?: number }) => void;

class FakePty implements PtyProcessLike {
  readonly writes: string[] = [];
  readonly resizes: Array<{ cols: number; rows: number }> = [];
  readonly kills: Array<string | undefined> = [];
  private dataListeners = new Set<(data: string) => void>();
  private exitListeners = new Set<ExitListener>();

  constructor(readonly pid: number) {}

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onExit(listener: ExitListener) {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  write(data: string) {
    this.writes.push(data);
  }

  resize(cols: number, rows: number) {
    this.resizes.push({ cols, rows });
  }

  kill(signal?: string) {
    this.kills.push(signal);
  }

  emitData(data: string) {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(exitCode = 0, signal = 0) {
    for (const listener of this.exitListeners) listener({ exitCode, signal });
  }
}

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createHarness() {
  const processes: FakePty[] = [];
  const spawns: Array<{ file: string; args: string[]; options: PtySpawnOptions }> = [];
  const events: unknown[] = [];
  const manager = new TerminalManager({
    shell: "/bin/zsh",
    env: { PATH: "/usr/bin", SHELL: "/bin/zsh" },
    spawn(file, args, options) {
      spawns.push({ file, args, options });
      const process = new FakePty(9000 + processes.length);
      processes.push(process);
      return process;
    },
    emit(event) {
      events.push(event);
    },
  });

  return { events, manager, processes, spawns };
}

describe("TerminalManager", () => {
  test("spawns the login shell in the canonical .ralphy root", async () => {
    const fixture = await makeLibraryFixture();
    fixtureRoots.push(fixture.parentPath);
    const harness = createHarness();
    const canonicalRoot = await realpath(fixture.rootPath);

    const session = await harness.manager.create(fixture.rootPath, { cols: 120, rows: 36 });

    expect(session).toMatchObject({
      label: basename(fixture.parentPath),
      pid: 9000,
      shell: "/bin/zsh",
      status: "running",
    });
    expect(session).not.toHaveProperty("cwd");
    expect(harness.spawns).toEqual([
      {
        file: "/bin/zsh",
        args: ["-l"],
        options: {
          cols: 120,
          cwd: canonicalRoot,
          env: {
            COLORTERM: "truecolor",
            LC_CTYPE: "UTF-8",
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
            TERM: "xterm-256color",
          },
          name: "xterm-256color",
          rows: 36,
        },
      },
    ]);
  });

  test("forwards input, resize, and kill to the selected PTY", async () => {
    const fixture = await makeLibraryFixture();
    fixtureRoots.push(fixture.parentPath);
    const harness = createHarness();
    const session = await harness.manager.create(fixture.rootPath, { cols: 80, rows: 24 });

    harness.manager.write(session.id, "ls -la\r");
    harness.manager.resize(session.id, { cols: 140, rows: 42 });
    harness.manager.kill(session.id);

    expect(harness.processes[0]?.writes).toEqual(["ls -la\r"]);
    expect(harness.processes[0]?.resizes).toEqual([{ cols: 140, rows: 42 }]);
    expect(harness.processes[0]?.kills).toEqual([undefined]);
  });

  test("emits bounded output and one exit event", async () => {
    const fixture = await makeLibraryFixture();
    fixtureRoots.push(fixture.parentPath);
    const harness = createHarness();
    const session = await harness.manager.create(fixture.rootPath, { cols: 80, rows: 24 });

    harness.processes[0]?.emitData("x".repeat(70 * 1024));
    harness.processes[0]?.emitExit(7, 9);
    harness.processes[0]?.emitExit(7, 9);

    const output = harness.events.filter(
      (event): event is { type: "data"; sessionId: string; data: string } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "data",
    );
    const exits = harness.events.filter(
      (event): event is { type: "exit"; sessionId: string; exitCode: number; signal: number } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "exit",
    );

    expect(output.map((event) => event.data).join("")).toBe("x".repeat(70 * 1024));
    expect(output.every((event) => Buffer.byteLength(event.data) <= 64 * 1024)).toBe(true);
    expect(exits).toEqual([{ type: "exit", sessionId: session.id, exitCode: 7, signal: 9 }]);
    expect(harness.manager.list()).toEqual([]);
  });

  test("rejects unsafe input and caps live sessions", async () => {
    const fixture = await makeLibraryFixture();
    fixtureRoots.push(fixture.parentPath);
    const harness = createHarness();

    await expect(harness.manager.create(fixture.alphaPath, { cols: 80, rows: 24 })).rejects.toThrow(
      "canonical .ralphy",
    );
    await expect(harness.manager.create(fixture.rootPath, { cols: 1, rows: 24 })).rejects.toThrow(
      "dimensions",
    );

    const sessions = [];
    for (let index = 0; index < 16; index += 1) {
      sessions.push(await harness.manager.create(fixture.rootPath, { cols: 80, rows: 24 }));
    }
    await expect(harness.manager.create(fixture.rootPath, { cols: 80, rows: 24 })).rejects.toThrow(
      "limit",
    );

    expect(() => harness.manager.write(sessions[0]!.id, "x".repeat(64 * 1024 + 1))).toThrow(
      "64 KiB",
    );
    harness.manager.killAll();
    expect(harness.processes.slice(0, 16).every((process) => process.kills.length === 1)).toBe(true);
  });

  test("terminates only terminals owned by the switched root", async () => {
    const first = await makeLibraryFixture();
    const second = await makeLibraryFixture();
    fixtureRoots.push(first.parentPath, second.parentPath);
    const harness = createHarness();
    await harness.manager.create(first.rootPath, { cols: 80, rows: 24 });
    const kept = await harness.manager.create(second.rootPath, { cols: 80, rows: 24 });

    expect(harness.manager).toHaveProperty("terminateRoot");
    (harness.manager as TerminalManager & { terminateRoot(root: string): void })
      .terminateRoot(await realpath(first.rootPath));

    expect(harness.processes[0]?.kills).toEqual([undefined]);
    expect(harness.processes[1]?.kills).toEqual([]);
    expect(harness.manager.list()).toEqual([kept]);
  });
});
