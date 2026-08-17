import { randomUUID } from "node:crypto";
import { basename, dirname } from "node:path";

import { validateLibraryRoot } from "../media/catalog";
import type {
  TerminalDimensions,
  TerminalEvent,
  TerminalSession,
} from "../media/types";

export type {
  TerminalDimensions,
  TerminalEvent,
  TerminalSession,
} from "../media/types";

const MAX_SESSIONS = 16;
const MAX_MESSAGE_BYTES = 64 * 1024;

export interface PtySpawnOptions extends TerminalDimensions {
  name: string;
  cwd: string;
  env: Record<string, string>;
}

export interface PtyProcessLike {
  readonly pid: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(
    listener: (event: { exitCode: number; signal?: number }) => void,
  ): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export type SpawnPty = (
  file: string,
  args: string[],
  options: PtySpawnOptions,
) => PtyProcessLike;

interface ManagedSession {
  process: PtyProcessLike;
  rootPath: string;
  session: TerminalSession;
  dispose: () => void;
}

interface TerminalManagerOptions {
  spawn: SpawnPty;
  emit: (event: TerminalEvent) => void;
  shell?: string;
  env?: NodeJS.ProcessEnv;
}

function assertDimensions(dimensions: TerminalDimensions): void {
  const valid =
    Number.isInteger(dimensions.cols)
    && Number.isInteger(dimensions.rows)
    && dimensions.cols >= 2
    && dimensions.cols <= 500
    && dimensions.rows >= 2
    && dimensions.rows <= 300;
  if (!valid) throw new Error("Invalid terminal dimensions");
}

function sanitizedEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  if (!env.LC_ALL && !env.LC_CTYPE) env.LC_CTYPE = "UTF-8";
  return env;
}

function emitBoundedData(
  emit: (event: TerminalEvent) => void,
  sessionId: string,
  data: string,
): void {
  if (Buffer.byteLength(data) <= MAX_MESSAGE_BYTES) {
    emit({ type: "data", sessionId, data });
    return;
  }

  let bytes = 0;
  let chunk: string[] = [];
  for (const character of data) {
    const characterBytes = Buffer.byteLength(character);
    if (bytes + characterBytes > MAX_MESSAGE_BYTES && chunk.length > 0) {
      emit({ type: "data", sessionId, data: chunk.join("") });
      chunk = [];
      bytes = 0;
    }
    chunk.push(character);
    bytes += characterBytes;
  }
  if (chunk.length > 0) emit({ type: "data", sessionId, data: chunk.join("") });
}

export class TerminalManager {
  readonly #emit: (event: TerminalEvent) => void;
  readonly #env: NodeJS.ProcessEnv;
  readonly #sessions = new Map<string, ManagedSession>();
  readonly #shell: string;
  readonly #spawn: SpawnPty;

  constructor(options: TerminalManagerOptions) {
    this.#spawn = options.spawn;
    this.#emit = options.emit;
    this.#env = options.env ?? process.env;
    this.#shell = options.shell ?? this.#env.SHELL ?? "/bin/zsh";
  }

  list(): TerminalSession[] {
    return [...this.#sessions.values()].map(({ session }) => ({ ...session }));
  }

  async create(rootPath: string, dimensions: TerminalDimensions): Promise<TerminalSession> {
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new Error(`Terminal session limit (${MAX_SESSIONS}) reached`);
    }
    assertDimensions(dimensions);

    let cwd: string;
    try {
      cwd = await validateLibraryRoot(rootPath);
    } catch (error) {
      throw new Error("Terminal cwd must be a canonical .ralphy library root", {
        cause: error,
      });
    }

    const process = this.#spawn(this.#shell, ["-l"], {
      ...dimensions,
      name: "xterm-256color",
      cwd,
      env: sanitizedEnvironment(this.#env),
    });
    const session: TerminalSession = {
      id: randomUUID(),
      label: basename(dirname(cwd)) || ".ralphy",
      shell: this.#shell,
      pid: process.pid,
      status: "running",
    };

    let exited = false;
    const dataSubscription = process.onData((data) => {
      if (!exited) emitBoundedData(this.#emit, session.id, data);
    });
    let exitSubscription: { dispose(): void } = { dispose: () => undefined };
    exitSubscription = process.onExit((event) => {
      if (exited) return;
      exited = true;
      session.status = "exited";
      session.exitCode = event.exitCode;
      session.signal = event.signal ?? 0;
      dataSubscription.dispose();
      exitSubscription.dispose();
      this.#sessions.delete(session.id);
      this.#emit({
        type: "exit",
        sessionId: session.id,
        exitCode: event.exitCode,
        signal: event.signal ?? 0,
      });
    });

    this.#sessions.set(session.id, {
      process,
      rootPath: cwd,
      session,
      dispose: () => {
        dataSubscription.dispose();
        exitSubscription.dispose();
      },
    });
    return { ...session };
  }

  write(sessionId: string, data: string): void {
    if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES) {
      throw new Error("Terminal input cannot exceed 64 KiB");
    }
    this.#sessions.get(sessionId)?.process.write(data);
  }

  resize(sessionId: string, dimensions: TerminalDimensions): void {
    assertDimensions(dimensions);
    this.#sessions.get(sessionId)?.process.resize(dimensions.cols, dimensions.rows);
  }

  kill(sessionId: string): void {
    this.#sessions.get(sessionId)?.process.kill();
  }

  killAll(): void {
    for (const { process } of this.#sessions.values()) process.kill();
  }

  terminateRoot(rootPath: string): void {
    for (const [sessionId, managed] of this.#sessions) {
      if (managed.rootPath !== rootPath) continue;
      managed.dispose();
      managed.process.kill();
      this.#sessions.delete(sessionId);
    }
  }

  dispose(): void {
    for (const managed of this.#sessions.values()) {
      managed.dispose();
      managed.process.kill();
    }
    this.#sessions.clear();
  }
}
