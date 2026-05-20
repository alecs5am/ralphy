// Shared NDJSON event emitter for long-running CLI verbs (01.07.01).
//
// Every long-running verb (iterate, render, batch run, generate video,
// generate music, assets pull) emits NDJSON events on stdout while running,
// with the final summary as the last line. This module is the single
// implementation so the event shape and backpressure handling stay consistent.
//
// Event shape (01.02.03):
//   { "ts": <ms epoch>, "kind": "<event-name>", ...payload }
// The final summary always has kind "summary".
//
// Backpressure:
//   When stdout's underlying write() returns false (kernel buffer full or a
//   slow downstream pipe), Node still queues subsequent writes — Bun and Node
//   both honor ordering. We deliberately do not implement an unbounded buffer
//   of our own; cooperating with the stream's built-in queue is enough for
//   the event rates real verbs produce (≤ a few hundred per second).
//
// --quiet:
//   When quiet=true, event() is a no-op but summary() still fires. This lets
//   agents pass --quiet and still parse the final result without giving up
//   the exit-code contract.

import type { Writable } from "node:stream";

export interface NdjsonEmitterOptions {
  /** Stream to write to. Defaults to process.stdout. */
  out?: Writable;
  /** Suppress events but still emit the final summary. */
  quiet?: boolean;
  /** Override timestamp source (useful for deterministic tests). */
  now?: () => number;
}

type Payload = Record<string, unknown>;

export class NdjsonEmitter {
  private readonly out: Writable;
  private readonly quiet: boolean;
  private readonly now: () => number;
  private closed = false;

  constructor(opts: NdjsonEmitterOptions = {}) {
    this.out = opts.out ?? process.stdout;
    this.quiet = opts.quiet ?? false;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Emit one event line. No-op when quiet=true or after close(). */
  event(kind: string, payload: Payload = {}): void {
    if (this.closed || this.quiet) return;
    this.write(kind, payload);
  }

  /** Emit the final summary line. Always fires, even when quiet=true. */
  summary(payload: Payload = {}): void {
    if (this.closed) return;
    this.write("summary", payload);
  }

  /** Idempotent flush + lock — subsequent event/summary calls are no-ops. */
  close(): void {
    this.closed = true;
  }

  private write(kind: string, payload: Payload): void {
    // Construct the line so `kind` and `ts` always come from the emitter,
    // even if the caller tried to override them in the payload.
    const line: Payload = { ...payload, ts: this.now(), kind };
    this.out.write(JSON.stringify(line) + "\n");
  }
}
