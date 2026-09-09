import { describe, expect, test } from "vitest";

import { parseBoundedJsonValue } from "../electron/json-value";

describe("bounded renderer JSON", () => {
  test("copies ordinary JSON and rejects cyclic, deep, and oversized values", () => {
    expect(parseBoundedJsonValue({ engine: "manual", outputs: [1, true, null] })).toEqual({ engine: "manual", outputs: [1, true, null] });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parseBoundedJsonValue(cyclic)).toThrow("Invalid JSON value");

    let deep: unknown = null;
    for (let index = 0; index < 40; index += 1) deep = [deep];
    expect(() => parseBoundedJsonValue(deep)).toThrow("Invalid JSON value");
    const sparse: unknown[] = [];
    sparse.length = 10_001;
    expect(() => parseBoundedJsonValue(sparse)).toThrow("Invalid JSON value");
    expect(() => parseBoundedJsonValue("x".repeat(1_000_000))).toThrow("Invalid JSON value");
    expect(() => parseBoundedJsonValue(new Date())).toThrow("Invalid JSON value");
  });
});
