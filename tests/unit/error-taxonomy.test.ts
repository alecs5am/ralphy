// Agent-facing error taxonomy (#450). Pure string-in / classification-out —
// NO network, NO live provider calls. Fixtures are representative REAL error
// strings mined from connectors + recent done-issues (008 kling prompt cap,
// 023 kling audio, 051 voice/vision, 121 elevenlabs geo-block, 006 music ToS).

import { describe, test, expect } from "bun:test";
import {
  classifyError,
  failureClassFor,
  ERROR_CLASSES,
  type ErrorClass,
} from "../../cli/lib/errors/taxonomy.js";

/** Every classification must carry at least one concrete next action. */
function assertActionable(cls: ReturnType<typeof classifyError>) {
  expect(Array.isArray(cls.nextActions)).toBe(true);
  expect(cls.nextActions.length).toBeGreaterThan(0);
  expect(cls.nextActions[0]!.length).toBeGreaterThan(10);
}

describe("classifyError · provider-transient (retry / backoff)", () => {
  test("HTTP 429 too many requests → retry-with-backoff", () => {
    const c = classifyError({ message: "request failed with status 429 Too Many Requests" });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry-with-backoff");
    assertActionable(c);
  });

  test("ElevenLabs concurrent_limit_exceeded → retry-with-backoff", () => {
    const c = classifyError({ message: '{"detail":"concurrent_limit_exceeded"}' });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry-with-backoff");
  });

  test("OpenRouter burst-cap 403 → provider-transient, mentions $ balance", () => {
    const c = classifyError({ message: "OpenRouter 403: Key limit exceeded (total limit)" });
    expect(c.class).toBe("provider-transient");
    expect(c.matched).toBe("burst-cap");
    expect(c.nextActions[0]).toContain("NOT a $ balance");
  });

  test("ECONNRESET / 5xx network blip → retry (cheap)", () => {
    const c = classifyError({ message: "fetch failed: ECONNRESET socket hang up" });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry");
  });

  test("OpenRouter 503 empty body → transient retry", () => {
    const c = classifyError({ message: "openrouter 503: Service Unavailable" });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry");
  });
});

describe("classifyError · moderation (ask-user, no blind retry)", () => {
  test("Gemini IMAGE_SAFETY → moderation", () => {
    const c = classifyError({ message: "google/gemini-3-pro-image-preview returned IMAGE_SAFETY" });
    expect(c.class).toBe("moderation");
    expect(c.retryPolicy).toBe("ask-user");
    assertActionable(c);
  });

  test("ElevenLabs Music bad_prompt ToS → moderation", () => {
    const c = classifyError({
      message: 'ElevenLabs Music 400: {"detail":{"message":"bad_prompt"}} prompt_suggestion: instrumental synthwave',
    });
    expect(c.class).toBe("moderation");
    expect(c.retryPolicy).toBe("ask-user");
  });
});

describe("classifyError · model-constraint (no-retry + fallback model)", () => {
  test("kling prompt cap 400 → model-constraint with fallback", () => {
    const c = classifyError({
      message: "kwaivgi/kling-v3.0-std 400: prompt is too long (prompt cap is 2500 chars)",
      modelId: "kwaivgi/kling-v3.0-std",
      kind: "video",
    });
    expect(c.class).toBe("model-constraint");
    expect(c.retryPolicy).toBe("no-retry");
    // The MODELS.md video default (kling-v3.0-pro) is recommended as a fallback
    // since the failing model (kling-v3.0-std) is not the default.
    expect(c.fallbackModels).toContain("kwaivgi/kling-v3.0-pro");
    assertActionable(c);
  });

  test("duration out of range → model-constraint", () => {
    const c = classifyError({
      message: "elevenlabs-music duration 700s is out of range; ElevenLabs Music range is 3-600s",
      modelId: "elevenlabs-music",
      kind: "music",
    });
    expect(c.class).toBe("model-constraint");
    expect(c.retryPolicy).toBe("no-retry");
  });

  test("fallback is omitted when the default IS the failing model", () => {
    const c = classifyError({
      message: "kwaivgi/kling-v3.0-pro 400: unsupported parameter",
      modelId: "kwaivgi/kling-v3.0-pro",
      kind: "video",
    });
    // kling-v3.0-pro is the MODELS.md video default — no self-fallback.
    expect(c.fallbackModels).toBeUndefined();
  });
});

describe("classifyError · missing-refs (ask-user)", () => {
  test("reference required gate → missing-refs", () => {
    const c = classifyError({ message: "Reference required for named entity: Coca-Cola can" });
    expect(c.class).toBe("missing-refs");
    expect(c.retryPolicy).toBe("ask-user");
    expect(c.nextActions[0]).toContain("--no-ref-consent");
  });
});

describe("classifyError · bad-path (no-retry)", () => {
  test("file not found → bad-path", () => {
    const c = classifyError({ message: "ffmpeg: no such file or directory" });
    expect(c.class).toBe("bad-path");
    expect(c.retryPolicy).toBe("no-retry");
    assertActionable(c);
  });

  test("missing --prompt-file → bad-path", () => {
    const c = classifyError({ message: "generate image: --prompt arg missing" });
    expect(c.class).toBe("bad-path");
  });
});

describe("classifyError · eval-failure (ask-user → repair-plan)", () => {
  test("video quality gate refused → eval-failure", () => {
    const c = classifyError({ message: "Video quality gate refused for scene-03: hook leak" });
    expect(c.class).toBe("eval-failure");
    expect(c.retryPolicy).toBe("ask-user");
    expect(c.nextActions[0]).toContain("repair-plan");
  });
});

describe("classifyError · artifact-mismatch (no-retry)", () => {
  test("hyperframes wrapper-on-video lint → artifact-mismatch", () => {
    const c = classifyError({ message: "hyperframes lint error: wrapper-on-video element missing data-start" });
    expect(c.class).toBe("artifact-mismatch");
    expect(c.retryPolicy).toBe("no-retry");
  });
});

describe("classifyError · budget (ask-user)", () => {
  test("budget cap exceeded → budget", () => {
    const c = classifyError({ message: "Estimated cost $4.20 exceeds budget cap $2.00" });
    expect(c.class).toBe("budget");
    expect(c.retryPolicy).toBe("ask-user");
  });
});

describe("classifyError · provider-semantic (geo-block / auth / generic 4xx)", () => {
  test("ElevenLabs geo-block HTML-in-mp3 → provider-semantic", () => {
    const c = classifyError({
      message:
        "ElevenLabs returned a non-audio response (content-type text/html; leading bytes 0x3c21444f not an audio container); refusing to write a corrupt audio file. This is the geo-block failure mode.",
    });
    expect(c.class).toBe("provider-semantic");
    expect(c.matched).toBe("geoblock");
    expect(c.nextActions[0]).toContain("proxy");
  });

  test("401 unauthorized → provider-semantic ask-user", () => {
    const c = classifyError({ message: "OpenRouter 401: Unauthorized" });
    expect(c.class).toBe("provider-semantic");
    expect(c.retryPolicy).toBe("ask-user");
  });

  test("unrecognized error → provider-semantic ask-user (conservative default)", () => {
    const c = classifyError({ message: "some entirely novel failure mode nobody has seen" });
    expect(c.class).toBe("provider-semantic");
    expect(c.matched).toBeNull();
    assertActionable(c);
  });
});

describe("failureClassFor · gen-log vocabulary alignment", () => {
  test("every ErrorClass maps to a gen-log failureClass bucket", () => {
    const allowed = new Set(["transient", "constraint", "moderation", "provider-semantic"]);
    for (const cls of ERROR_CLASSES) {
      expect(allowed.has(failureClassFor(cls as ErrorClass))).toBe(true);
    }
  });

  test("the four direct analogs map 1:1", () => {
    expect(failureClassFor("provider-transient")).toBe("transient");
    expect(failureClassFor("model-constraint")).toBe("constraint");
    expect(failureClassFor("moderation")).toBe("moderation");
    expect(failureClassFor("provider-semantic")).toBe("provider-semantic");
  });
});
