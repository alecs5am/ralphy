import { describe, test, expect } from "bun:test";
import { findSource, type RegistryRecord } from "../../cli/lib/research/source-registry.js";

const entry = (url: string): RegistryRecord => ({
  url,
  text: "source",
  retrievedAt: "2026-08-04T00:00:00.000Z",
  score: 1,
});

describe("findSource", () => {
  test("matches normalized URLs", () => {
    expect(findSource([entry("https://example.com/a")], "https://Example.com/a?utm_source=x"))
      .toEqual(expect.objectContaining({ url: "https://example.com/a" }));
  });

  test("returns null for an unknown or invalid URL", () => {
    expect(findSource([entry("https://example.com/a")], "https://nowhere.example/x")).toBeNull();
    expect(findSource([entry("https://example.com/a")], "not a URL")).toBeNull();
  });
});
