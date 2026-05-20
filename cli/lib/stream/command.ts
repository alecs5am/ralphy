// CommandStream — the wrapper long-running verbs use to emit NDJSON in
// JSON mode and a single pretty summary on TTY (01.02.03).
//
// Usage from a verb:
//   const cs = new CommandStream();
//   cs.event("render-started", { compositionId });
//   /* ...spawn remotion... */
//   cs.event("render-finished", { exitCode: 0 });
//   cs.summary({ project, path, bytes, latencyMs });
//
// On TTY: events are no-ops (the verb continues to use `ui.withSpinner` for
// human progress); `summary()` routes through `out()` so the user sees the
// same rendered table they always have.
// Off-TTY / --json: events become NDJSON lines on stdout; `summary()` is the
// final `{ ts, kind: "summary", ... }` line.

import type { Writable } from "node:stream";
import { isPrettyMode, isQuietMode } from "../ui.js";
import { out } from "../output.js";
import { NdjsonEmitter } from "./ndjson.js";

type Payload = Record<string, unknown>;

export interface CommandStreamOptions {
  /** NDJSON sink. Defaults to process.stdout. */
  out?: Writable;
  /** Override pretty-mode renderer (useful for tests). */
  prettyPrinter?: (payload: Payload) => void;
}

export class CommandStream {
  private emitter: NdjsonEmitter | null;
  private prettyPrinter: (payload: Payload) => void;

  constructor(opts: CommandStreamOptions = {}) {
    // Pretty TTY mode → no NDJSON; verb uses spinners + final pretty print.
    // JSON / piped mode → NDJSON for every step + summary line at end.
    if (isPrettyMode()) {
      this.emitter = null;
    } else {
      this.emitter = new NdjsonEmitter({ out: opts.out, quiet: isQuietMode() });
    }
    this.prettyPrinter = opts.prettyPrinter ?? ((p) => out(p));
  }

  event(kind: string, payload: Payload = {}): void {
    if (this.emitter) this.emitter.event(kind, payload);
  }

  summary(payload: Payload = {}): void {
    if (this.emitter) {
      this.emitter.summary(payload);
    } else {
      // Pretty mode: defer to the legacy single-object printer so the user
      // sees the same rendered table they're used to.
      this.prettyPrinter(payload);
    }
  }

  /**
   * True when NDJSON events are being emitted (i.e. off-TTY / --json).
   * Verbs can use this to suppress noisy spinners in JSON mode.
   */
  get isStreaming(): boolean {
    return this.emitter !== null;
  }
}
