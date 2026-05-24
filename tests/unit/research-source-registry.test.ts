// `cli/lib/research/source-registry.ts` — append-only JSONL store of every
// URL the retrievers actually fetched. The source of truth for citation
// verification.
//
// Append-only: never rewrite the file; never remove entries; dedup by the
// normalized URL so two writes of the same URL produce one entry.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadRegistry,
  appendSource,
  findSource,
  registryPathFor,
  type RegistryRecord,
} from "../../cli/lib/research/source-registry.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ralphy-research-registry-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadRegistry", () => {
  test("missing file → empty array", async () => {
    expect(await loadRegistry(dir)).toEqual([]);
  });

  test("reads back appended entries in insertion order", async () => {
    await appendSource(dir, {
      url: "https://example.com/a",
      text: "snapshot A",
      retrievedAt: "2026-05-25T10:00:00Z",
      score: 1.0,
    });
    await appendSource(dir, {
      url: "https://example.com/b",
      text: "snapshot B",
      retrievedAt: "2026-05-25T10:01:00Z",
      score: 0.9,
    });
    const entries = await loadRegistry(dir);
    expect(entries.map((e) => e.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  test("ignores blank lines and trailing newlines", async () => {
    const p = registryPathFor(dir);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(
      p,
      [
        "",
        JSON.stringify({
          url: "https://example.com/a",
          text: "x",
          retrievedAt: "2026-05-25T10:00:00Z",
          score: 1,
        }),
        "",
        JSON.stringify({
          url: "https://example.com/b",
          text: "y",
          retrievedAt: "2026-05-25T10:01:00Z",
          score: 1,
        }),
        "",
      ].join("\n"),
    );
    const entries = await loadRegistry(dir);
    expect(entries).toHaveLength(2);
  });

  test("skips corrupted lines without crashing", async () => {
    const p = registryPathFor(dir);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(
      p,
      [
        JSON.stringify({
          url: "https://example.com/a",
          text: "x",
          retrievedAt: "2026-05-25T10:00:00Z",
          score: 1,
        }),
        "{this is not valid json",
        JSON.stringify({
          url: "https://example.com/b",
          text: "y",
          retrievedAt: "2026-05-25T10:01:00Z",
          score: 1,
        }),
      ].join("\n"),
    );
    const entries = await loadRegistry(dir);
    expect(entries.map((e) => e.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});

describe("appendSource", () => {
  test("first append creates the file and returns added=true", async () => {
    const r = await appendSource(dir, {
      url: "https://example.com/a",
      text: "snap",
      retrievedAt: "2026-05-25T10:00:00Z",
      score: 1,
    });
    expect(r.added).toBe(true);
    expect(r.entry.url).toBe("https://example.com/a");
    const onDisk = await readFile(registryPathFor(dir), "utf8");
    expect(onDisk.trim().split("\n")).toHaveLength(1);
  });

  test("duplicate URL is a no-op (added=false), existing entry returned", async () => {
    await appendSource(dir, {
      url: "https://example.com/a",
      text: "snap",
      retrievedAt: "2026-05-25T10:00:00Z",
      score: 1,
    });
    const r = await appendSource(dir, {
      url: "https://example.com/a",
      text: "snap-2",
      retrievedAt: "2026-05-25T11:00:00Z",
      score: 0.5,
    });
    expect(r.added).toBe(false);
    expect(r.entry.text).toBe("snap");
    const entries = await loadRegistry(dir);
    expect(entries).toHaveLength(1);
  });

  test("dedup uses normalizeUrl — utm params + casing collapse", async () => {
    await appendSource(dir, {
      url: "https://example.com/a",
      text: "snap",
      retrievedAt: "2026-05-25T10:00:00Z",
      score: 1,
    });
    const r = await appendSource(dir, {
      url: "https://Example.com/a?utm_source=hn",
      text: "snap-2",
      retrievedAt: "2026-05-25T11:00:00Z",
      score: 0.5,
    });
    expect(r.added).toBe(false);
  });

  test("survives concurrent-ish writes by serializing", async () => {
    const writes = await Promise.all([
      appendSource(dir, {
        url: "https://example.com/a",
        text: "1",
        retrievedAt: "2026-05-25T10:00:00Z",
        score: 1,
      }),
      appendSource(dir, {
        url: "https://example.com/b",
        text: "2",
        retrievedAt: "2026-05-25T10:00:01Z",
        score: 1,
      }),
      appendSource(dir, {
        url: "https://example.com/c",
        text: "3",
        retrievedAt: "2026-05-25T10:00:02Z",
        score: 1,
      }),
    ]);
    expect(writes.filter((w) => w.added)).toHaveLength(3);
    const entries = await loadRegistry(dir);
    expect(entries).toHaveLength(3);
  });
});

describe("findSource", () => {
  test("returns the entry whose normalized URL equals the query", async () => {
    const entry: RegistryRecord = {
      url: "https://example.com/a",
      text: "snap",
      retrievedAt: "2026-05-25T10:00:00Z",
      score: 1,
    };
    await appendSource(dir, entry);
    const reg = await loadRegistry(dir);
    expect(findSource(reg, "https://Example.com/a?utm_source=tw")?.url).toBe(
      "https://example.com/a",
    );
  });

  test("returns null when nothing matches", async () => {
    const reg = await loadRegistry(dir);
    expect(findSource(reg, "https://nowhere.example/x")).toBeNull();
  });
});
