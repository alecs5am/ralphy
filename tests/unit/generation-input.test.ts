import { describe, expect, test } from "bun:test";
import { generationInput, readGenerationInput } from "../../cli/lib/generation-input.js";

describe("generation input projection", () => {
  test("stores only the closed public shape", () => {
    expect(generationInput(
      [{ role: "prompt", value: "A studio product shot" }],
      [{ name: "aspectRatio", value: "9:16" }],
    )).toEqual({
      type: "generation-input/v1",
      texts: [{ role: "prompt", value: "A studio product shot", truncated: false }],
      parameters: [{ name: "aspectRatio", value: "9:16" }],
    });
  });

  test("canonicalizes every connector-supported positive size spelling", () => {
    for (const [value, expected] of [["1024 X 1024", "1024x1024"], ["1024 x 1024", "1024x1024"], ["1x1", "1x1"], ["100000000000000000000000000000x1", "100000000000000000000000000000x1"]]) {
      expect(generationInput([], [{ name: "size", value }])).toMatchObject({
        parameters: [{ name: "size", value: expected }],
      });
      expect(readGenerationInput({ type: "generation-input/v1", texts: [], parameters: [{ name: "size", value }] }))
        .toEqual({ version: 1, texts: [], parameters: [{ name: "size", value: expected }] });
    }
  });

  test("truncates text at 65,536 UTF-8 bytes without splitting its final code point", () => {
    const input = generationInput([{ role: "negative-prompt", value: `${"a".repeat(65_532)}🙂b` }], []);
    const text = (input as { texts: Array<{ role: string; value: string; truncated: boolean }> }).texts[0];

    expect(text).toEqual({
      role: "negative-prompt",
      value: `${"a".repeat(65_532)}🙂`,
      truncated: true,
    });
    expect(Buffer.byteLength(text.value, "utf8")).toBe(65_536);

    const split = generationInput([{ role: "prompt", value: `${"a".repeat(65_533)}🙂` }], []);
    expect((split as { texts: Array<{ value: string }> }).texts[0].value).toBe("a".repeat(65_533));
  });

  test("rejects oversized, duplicate, private, and invalid constructor inputs", () => {
    expect(() => generationInput(Array.from({ length: 4 }, () => ({ role: "prompt", value: "x" })) as any, [])).toThrow();
    expect(() => generationInput([{ role: "prompt", value: "x" }, { role: "prompt", value: "y" }], [])).toThrow();
    expect(() => generationInput([], Array.from({ length: 33 }, () => ({ name: "size", value: "x" })) as any)).toThrow();
    expect(() => generationInput([], [{ name: "size", value: "x" }, { name: "size", value: "y" }])).toThrow();
    expect(() => generationInput([], [{ name: "speed", value: Number.NaN }])).toThrow();
    expect(() => generationInput([], [{ name: "voiceId", value: "secret" }] as any)).toThrow();
  });

  test("rejects arbitrary strings and wrong parameter value types", () => {
    const invalid = [
      { name: "size", value: "/private/fixture.png" },
      { name: "aspectRatio", value: "https://example.test/secret" },
      { name: "resolution", value: "data:image/png;base64,private" },
      { name: "language", value: "credential=private" },
      { name: "backend", value: "provider-error-private" },
      { name: "backend", value: "x".repeat(65_537) },
      { name: "durationSec", value: "5" },
      { name: "voiceSpecified", value: "true" },
      { name: "backend", value: true },
    ] as any;

    for (const parameter of invalid) {
      expect(() => generationInput([], [parameter])).toThrow();
      expect(readGenerationInput({
        type: "generation-input/v1",
        texts: [],
        parameters: [parameter],
      })).toBeNull();
    }
  });

  test("reads only valid closed projections and never returns private payloads", () => {
    const privateNames = ["voiceId", "path", "url", "note", "request", "response", "error"];
    const valid = {
      type: "generation-input/v1",
      texts: [{ role: "text", value: "approved", truncated: false }],
      parameters: [{ name: "backend", value: "elevenlabs" }],
    };

    expect(readGenerationInput(valid)).toEqual({
      version: 1,
      texts: [{ role: "text", value: "approved", truncated: false }],
      parameters: [{ name: "backend", value: "elevenlabs" }],
    });
    expect(readGenerationInput(null)).toBeNull();
    expect(readGenerationInput({ slot: "hero" })).toBeNull();
    expect(readGenerationInput({ ...valid, texts: "not-an-array" } as any)).toBeNull();
    expect(readGenerationInput({ ...valid, parameters: [{ name: "backend" }] } as any)).toBeNull();
    expect(readGenerationInput({ ...valid, texts: [{ role: "text", value: "x", truncated: false }, { role: "text", value: "y", truncated: false }] })).toBeNull();
    expect(readGenerationInput({ ...valid, parameters: [{ name: "backend", value: "x" }, { name: "backend", value: "y" }] })).toBeNull();
    expect(readGenerationInput({ ...valid, parameters: [{ name: "voiceId", value: "secret" }] } as any)).toBeNull();
    expect(readGenerationInput({ ...valid, parameters: [{ name: "speed", value: Number.POSITIVE_INFINITY }] })).toBeNull();
    expect(readGenerationInput({ ...valid, extra: true })).toBeNull();
    expect(readGenerationInput({ ...valid, type: "generation-input/v2" })).toBeNull();
    for (const name of privateNames) {
      expect(readGenerationInput({ ...valid, [name]: "secret" })).toBeNull();
    }
  });

  test("rejects hidden string and symbol keys at every projection boundary", () => {
    const valid = {
      type: "generation-input/v1",
      texts: [{ role: "text", value: "approved", truncated: false }],
      parameters: [{ name: "backend", value: "elevenlabs" }],
    };
    const envelope = { ...valid };
    Object.defineProperty(envelope, "voiceId", { value: "secret" });
    Object.defineProperty(envelope, Symbol("unknown"), { value: "secret" });
    const text = { ...valid.texts[0] };
    Object.defineProperty(text, "request", { value: "secret" });
    Object.defineProperty(text, Symbol("unknown"), { value: "secret" });
    const parameter = { ...valid.parameters[0] };
    Object.defineProperty(parameter, "path", { value: "secret" });
    Object.defineProperty(parameter, Symbol("unknown"), { value: "secret" });

    expect(readGenerationInput(envelope)).toBeNull();
    expect(readGenerationInput({ ...valid, texts: [text] })).toBeNull();
    expect(readGenerationInput({ ...valid, parameters: [parameter] })).toBeNull();
  });

  test("returns fresh DTO arrays", () => {
    const stored = generationInput([{ role: "prompt", value: "approved" }], [{ name: "size", value: "1024x1024" }]);
    const first = readGenerationInput(stored)!;
    first.texts[0].value = "mutated";
    first.parameters[0].value = "mutated";

    expect(readGenerationInput(stored)).toEqual({
      version: 1,
      texts: [{ role: "prompt", value: "approved", truncated: false }],
      parameters: [{ name: "size", value: "1024x1024" }],
    });
  });
});
