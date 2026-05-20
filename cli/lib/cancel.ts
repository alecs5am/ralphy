// Cooperative cancellation primitive (01.07.02).
//
// Long-running verbs accept a CancellationToken and check `token.cancelled`
// (or call `token.throwIfCancelled()`) at safe points between API calls.
// The top-level SIGINT handler flips the global token, and the command
// boundary catches the resulting CancelledError to emit the structured
// E_CANCELLED payload + exit 130 (per 01.06.02).
//
// This is deliberately small — we don't need AbortController's ecosystem
// for v1.0. If/when a provider SDK requires AbortSignal, we can `.signal`
// adapter it.

export class CancelledError extends Error {
  constructor() {
    super("Operation cancelled by user (SIGINT)");
    this.name = "CancelledError";
  }
}

export type CancelListener = () => void;

export class CancellationToken {
  private _cancelled = false;
  private listeners: CancelListener[] = [];

  get cancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;
    // Snapshot + clear so a listener that re-registers doesn't fire twice.
    const ls = this.listeners;
    this.listeners = [];
    for (const l of ls) {
      try {
        l();
      } catch {
        // Best-effort; never let one listener tear down the rest.
      }
    }
  }

  onCancel(listener: CancelListener): void {
    if (this._cancelled) {
      // Fire synchronously — matches Promise-resolved-then-attach semantics.
      try {
        listener();
      } catch {
        /* swallow */
      }
      return;
    }
    this.listeners.push(listener);
  }

  throwIfCancelled(): void {
    if (this._cancelled) throw new CancelledError();
  }
}

// Global singleton wired to SIGINT at process boundary.
let _global: CancellationToken | null = null;
let _installed = false;

export function globalCancelToken(): CancellationToken {
  if (!_global) _global = new CancellationToken();
  return _global;
}

export function installSigintHandler(): CancellationToken {
  const token = globalCancelToken();
  if (_installed) return token;
  _installed = true;
  // Install at most once. The handler does NOT exit directly — it flips
  // the token so verbs can finish their current syscall (write buffer flush,
  // append-only log close) and then the command boundary emits E_CANCELLED.
  // A second SIGINT exits hard with 130 in case the verb refuses to budge.
  let hits = 0;
  process.on("SIGINT", () => {
    hits++;
    token.cancel();
    if (hits >= 2) {
      process.stderr.write("\n");
      process.exit(130);
    }
  });
  return token;
}
