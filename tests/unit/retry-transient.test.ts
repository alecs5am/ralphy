// Unit tests for the transient-error retry helper (#005).
// Covers:
//  - classifier returns "transient" for every named transient class
//  - classifier returns "terminal" for everything else
//  - retryTransient backs off with the documented 1s/4s/16s schedule
//  - retryTransient stops retrying immediately on terminal errors
//  - retryTransient honors noRetry by short-circuiting to a single attempt
//
// Uses an injectable `sleep` to avoid real timer waits — no fake-timer infra
// in bun:test, but the same effect with a recording stub.

import { describe, test, expect } from "bun:test";
import {
  classifyError,
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
} from "../../cli/lib/providers/shared.js";

describe("classifyError", () => {
  test("TransientPayloadError → transient", () => {
    expect(classifyError(new TransientPayloadError("skeleton-null"))).toBe("transient");
  });

  test("TerminalProviderError → terminal", () => {
    expect(classifyError(new TerminalProviderError("400 invalid prompt"))).toBe("terminal");
  });

  test("ECONNRESET errno → transient", () => {
    const err = new Error("socket reset") as Error & { code?: string };
    err.code = "ECONNRESET";
    expect(classifyError(err)).toBe("transient");
  });

  test("ETIMEDOUT errno → transient", () => {
    const err = new Error("timeout") as Error & { code?: string };
    err.code = "ETIMEDOUT";
    expect(classifyError(err)).toBe("transient");
  });

  test("DNS class (ENOTFOUND) → transient", () => {
    const err = new Error("getaddrinfo failed") as Error & { code?: string };
    err.code = "ENOTFOUND";
    expect(classifyError(err)).toBe("transient");
  });

  test("TLS handshake message → transient", () => {
    const err = new Error("unknown certificate verification error during TLS handshake");
    expect(classifyError(err)).toBe("transient");
  });

  test("fetch-failed message → transient (undici wrapper)", () => {
    const err = new Error("fetch failed");
    expect(classifyError(err)).toBe("transient");
  });

  test("MALFORMED_FUNCTION_CALL message → transient", () => {
    const err = new Error("openrouter chat-completions finish_reason=MALFORMED_FUNCTION_CALL");
    expect(classifyError(err)).toBe("transient");
  });

  test("HTTP 502 bad gateway → transient", () => {
    const err = new Error("OpenRouter 502: Bad Gateway");
    expect(classifyError(err)).toBe("transient");
  });

  test("HTTP 503 with empty body → transient", () => {
    const err = new Error("OpenRouter 503: ");
    expect(classifyError(err)).toBe("transient");
  });

  test("HTTP 400 validation error → terminal", () => {
    const err = new Error("OpenRouter 400: prompt is required");
    expect(classifyError(err)).toBe("terminal");
  });

  test("HTTP 401 auth error → terminal", () => {
    const err = new Error("OpenRouter 401: invalid api key");
    expect(classifyError(err)).toBe("terminal");
  });

  test("HTTP 422 ToS bad_prompt → terminal", () => {
    // ElevenLabs Music ToS rejection — #006 owns auto-resubmit, not the retry loop.
    const err = new Error("ElevenLabs Music 422: bad_prompt");
    expect(classifyError(err)).toBe("terminal");
  });

  test("plain string → terminal (defensive default)", () => {
    expect(classifyError("oops")).toBe("terminal");
  });

  test("undefined → terminal", () => {
    expect(classifyError(undefined)).toBe("terminal");
  });

  test("errno on cause chain → transient", () => {
    // node fetch wraps TLS errors as `Error { cause: Error { code: 'ECONNRESET' } }`.
    const inner = new Error("socket hang up") as Error & { code?: string };
    inner.code = "ECONNRESET";
    const wrapper = new Error("fetch failed") as Error & { cause?: Error };
    wrapper.cause = inner;
    expect(classifyError(wrapper)).toBe("transient");
  });
});

describe("retryTransient", () => {
  test("succeeds on first attempt → returns result, no sleeps", async () => {
    const sleeps: number[] = [];
    const result = await retryTransient(async () => "ok", {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result).toBe("ok");
    expect(sleeps).toEqual([]);
  });

  test("backoff schedule is 1s → 4s → 16s for 2 transient failures then success", async () => {
    const sleeps: number[] = [];
    const attempts: number[] = [];
    let calls = 0;
    const result = await retryTransient(
      async (attempt) => {
        attempts.push(attempt);
        calls += 1;
        if (calls < 3) {
          throw new TransientPayloadError(`blip ${calls}`);
        }
        return "ok";
      },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(result).toBe("ok");
    expect(attempts).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([1000, 4000]);
  });

  test("respects custom backoffMs schedule", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await retryTransient(
      async () => {
        calls += 1;
        if (calls < 3) throw new TransientPayloadError("blip");
        return "ok";
      },
      {
        backoffMs: [10, 20, 30],
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(sleeps).toEqual([10, 20]);
  });

  test("terminal error → throws immediately, no retries, no sleep", async () => {
    const sleeps: number[] = [];
    const attempts: number[] = [];
    await expect(
      retryTransient(
        async (attempt) => {
          attempts.push(attempt);
          throw new TerminalProviderError("400 bad request");
        },
        {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    ).rejects.toThrow(/400 bad request/);
    expect(attempts).toEqual([1]);
    expect(sleeps).toEqual([]);
  });

  test("noRetry=true → single attempt even on transient", async () => {
    const sleeps: number[] = [];
    const attempts: number[] = [];
    await expect(
      retryTransient(
        async (attempt) => {
          attempts.push(attempt);
          throw new TransientPayloadError("blip");
        },
        {
          noRetry: true,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    ).rejects.toThrow(/blip/);
    expect(attempts).toEqual([1]);
    expect(sleeps).toEqual([]);
  });

  test("exhausts retries → throws last error, sleeps N times", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          throw new TransientPayloadError(`blip ${calls}`);
        },
        {
          retries: 2,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    ).rejects.toThrow(/blip 3/);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 4000]);
  });

  test("onTransientFailure called once per failed attempt with 1-indexed attempt counter", async () => {
    const reported: Array<{ attempt: number; msg: string }> = [];
    let calls = 0;
    await retryTransient(
      async () => {
        calls += 1;
        if (calls < 3) throw new TransientPayloadError(`blip ${calls}`);
        return "ok";
      },
      {
        sleep: async () => {},
        onTransientFailure: async (err, attempt) => {
          reported.push({ attempt, msg: (err as Error).message });
        },
      },
    );
    expect(reported).toEqual([
      { attempt: 1, msg: "blip 1" },
      { attempt: 2, msg: "blip 2" },
    ]);
  });

  test("onTransientFailure throwing does not mask the inner error", async () => {
    let calls = 0;
    const result = await retryTransient(
      async () => {
        calls += 1;
        if (calls < 2) throw new TransientPayloadError("blip");
        return "ok";
      },
      {
        sleep: async () => {},
        onTransientFailure: async () => {
          throw new Error("logging exploded");
        },
      },
    );
    expect(result).toBe("ok");
  });
});
