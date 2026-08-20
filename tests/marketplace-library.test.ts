import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadMarketplacePublicLibrary,
  projectMarketplacePublicDocument,
} from "../electron/marketplace-library";

const PUBLIC_LIBRARY_URL = "https://ralphy.b-cdn.net/library/library.json";
const NOW = 1_787_200_000_000;
const exactArtifact = "ffmpeg -vf \"drawtext=text='<script>opaque</script>'\"";

function document(blocks: unknown[] = [
  {
    kind: "template",
    id: "choose-the-door",
    name: "Choose <b>the</b> Door<script>unknownSecret</script>",
    blurb: "A <em>safe</em> choice.",
    refs: ["https://ralphy.b-cdn.net/blocks/template/choose-the-door/preview.png"],
    demoHtml: "<script>demoHtml</script>",
    sourcePath: "/Users/demo/.ssh/id_rsa",
    unknownSecret: "discard me",
  },
  {
    kind: "recipe",
    id: "voxel-dither",
    name: "Voxel Dither",
    blurb: "Retro effect",
    refs: ["https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4"],
    recipeKind: "ffmpeg",
    body: "## Safe\n<script>unknownSecret</script>Keep **Markdown**",
    artifact: exactArtifact,
    params: { contrast: 1.06, labels: ["a", null, true] },
    demo: {
      kind: "media",
      html: "<script>demoHtml</script>",
      beforeUrl: "https://ralphy.b-cdn.net/blocks/recipe/voxel-dither/before.mp4",
      afterUrl: "https://ralphy.b-cdn.net/blocks/recipe/voxel-dither/after.mp4",
      posterUrl: "https://ralphy.b-cdn.net/units/voxel-dither/poster.png",
      storageUrl: "https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4",
      absolutePath: "/Users/demo/private.mp4",
    },
  },
  { kind: "asset", id: "private-asset", name: "Ignored asset" },
]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    formats: [{ secret: true }],
    units: [{ absolutePath: "/Users/demo/unit" }],
    blocks,
    unknownRoot: "discard me",
  };
}

function response(
  value: unknown,
  options: {
    body?: BodyInit;
    headers?: Record<string, string>;
    status?: number;
    url?: string;
    redirected?: boolean;
  } = {},
): Response {
  const result = new Response(options.body ?? JSON.stringify(value), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...options.headers,
    },
  });
  Object.defineProperty(result, "url", { value: options.url ?? PUBLIC_LIBRARY_URL });
  if (options.redirected !== undefined) {
    Object.defineProperty(result, "redirected", { value: options.redirected });
  }
  return result;
}

function fetcher(result: Response | Error): typeof fetch {
  return vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  }) as unknown as typeof fetch;
}

let directory: string;
let cachePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ralphy-marketplace-"));
  cachePath = join(directory, "public-library.json");
});

afterEach(async () => {
  delete process.env.RALPHY_LIBRARY_URL;
  await rm(directory, { recursive: true, force: true });
});

describe("Marketplace public catalog trust boundary", () => {
  test("fetches only the fixed source and projects only bounded Template and Recipe fields", async () => {
    process.env.RALPHY_LIBRARY_URL = "file:///Users/demo/.ssh/id_rsa";
    const request = fetcher(response(document(), {
      headers: { "last-modified": "Tue, 18 Aug 2026 12:00:00 GMT" },
    }));

    const snapshot = await loadMarketplacePublicLibrary({ fetcher: request, cachePath, now: () => NOW });

    expect(request).toHaveBeenCalledWith(PUBLIC_LIBRARY_URL, expect.objectContaining({
      credentials: "omit",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    }));
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      source: "live",
      refreshedAt: new Date(NOW).toISOString(),
      sourceUpdatedAt: "Tue, 18 Aug 2026 12:00:00 GMT",
      warning: null,
    });
    expect(snapshot.items).toEqual([
      {
        id: "choose-the-door",
        category: "template",
        name: "Choose the Door",
        summary: "A safe choice.",
        referenceUrls: ["https://ralphy.b-cdn.net/blocks/template/choose-the-door/preview.png"],
        recipe: null,
      },
      {
        id: "voxel-dither",
        category: "recipe",
        name: "Voxel Dither",
        summary: "Retro effect",
        referenceUrls: ["https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4"],
        recipe: {
          kind: "ffmpeg",
          body: "## Safe\nKeep **Markdown**",
          artifact: exactArtifact,
          parameters: { contrast: 1.06, labels: ["a", null, true] },
          demo: {
            kind: "media",
            beforeUrl: "https://ralphy.b-cdn.net/blocks/recipe/voxel-dither/before.mp4",
            afterUrl: "https://ralphy.b-cdn.net/blocks/recipe/voxel-dither/after.mp4",
            posterUrl: "https://ralphy.b-cdn.net/units/voxel-dither/poster.png",
            storageUrl: "https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4",
          },
        },
      },
    ]);
    expect(JSON.stringify(snapshot.items.map(({ name, summary, recipe }) => [name, summary, recipe?.body])))
      .not.toMatch(/<script|demoHtml|sourcePath|absolutePath|unknownSecret/i);
    expect(snapshot.items[1]?.recipe?.artifact).toBe(exactArtifact);
    expect(JSON.stringify(snapshot)).not.toContain("/Users/demo");
  });

  test("rejects redirects, mismatched response URLs, bad status, content type, and bounded headers", async () => {
    const cases: [string, Response][] = [
      ["redirect", response(document(), { redirected: true })],
      ["URL mismatch", response(document(), { url: "https://ralphy.b-cdn.net/library/other.json" })],
      ["status", response(document(), { status: 404 })],
      ["content type", response(document(), { headers: { "content-type": "text/html" } })],
      ["content type length", response(document(), { headers: { "content-type": `application/json;${"x".repeat(129)}` } })],
      ["content length syntax", response(document(), { headers: { "content-length": "false" } })],
      ["content length cap", response(document(), { headers: { "content-length": String(2 * 1024 * 1024 + 1) } })],
      ["content length mismatch", response(document(), { headers: { "content-length": "1" } })],
      ["last modified length", response(document(), { headers: { "last-modified": "x".repeat(129) } })],
    ];

    for (const [label, result] of cases) {
      await expect(loadMarketplacePublicLibrary({ fetcher: fetcher(result), cachePath, now: () => NOW }), label)
        .rejects.toThrow("Marketplace catalog is unavailable");
    }
  });

  test("does not invent a source-updated timestamp from an invalid Last-Modified header", async () => {
    const snapshot = await loadMarketplacePublicLibrary({
      fetcher: fetcher(response(document(), { headers: { "last-modified": "not-a-date" } })),
      cachePath,
      now: () => NOW,
    });
    expect(snapshot.sourceUpdatedAt).toBeNull();
  });

  test("rejects streamed overflow, invalid UTF-8, invalid JSON, and the wrong schema", async () => {
    const overflow = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const cases = [
      response(null, { body: overflow }),
      response(null, { body: new Uint8Array([0xc3, 0x28]) }),
      response(null, { body: "{" }),
      response({ ...document(), schemaVersion: 2 }),
    ];
    for (const result of cases) {
      await expect(loadMarketplacePublicLibrary({ fetcher: fetcher(result), cachePath, now: () => NOW }))
        .rejects.toThrow("Marketplace catalog is unavailable");
    }
  });

  test("enforces raw block, projected item, identifier, duplicate, and field limits", () => {
    expect(() => projectMarketplacePublicDocument({ ...document(), blocks: Array.from({ length: 1025 }, () => ({})) }))
      .toThrow();
    expect(() => projectMarketplacePublicDocument(document(Array.from({ length: 513 }, (_, index) => ({
      kind: "template", id: `item-${index}`, name: "Item", blurb: "Summary",
    }))))) .toThrow();
    expect(() => projectMarketplacePublicDocument(document([
      { kind: "template", id: "same", name: "One", blurb: "A" },
      { kind: "recipe", id: "same", name: "Two", blurb: "B" },
    ]))).toThrow();

    const projected = projectMarketplacePublicDocument(document([
      { kind: "template", id: "é", name: "Bad id", blurb: "Bad" },
      { kind: "template", id: "x".repeat(129), name: "Bad id", blurb: "Bad" },
      { kind: "template", id: "valid", name: "x".repeat(161), blurb: "Bad" },
      { kind: "template", id: "valid-2", name: "Valid", blurb: "x".repeat(2049) },
      { kind: "asset", id: "asset", name: "Ignored" },
    ]));
    expect(projected).toEqual([]);
  });

  test("bounds recipe JSON without changing opaque artifacts", () => {
    const overKeys = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, index]));
    const cases: unknown[] = [
      { nested: { a: { b: { c: { tooDeep: true } } } } },
      Array.from({ length: 65 }, () => null),
      overKeys,
      { text: "x".repeat(4097) },
      { number: Number.POSITIVE_INFINITY },
    ];
    for (const params of cases) {
      const [item] = projectMarketplacePublicDocument(document([{
        kind: "recipe", id: "recipe", name: "Recipe", blurb: "Summary",
        recipeKind: "unknown", body: "x".repeat(64 * 1024 + 1),
        artifact: exactArtifact, params,
      }]));
      expect(item?.recipe).toMatchObject({ kind: null, body: null, artifact: exactArtifact, parameters: null });
    }
    const [overArtifact] = projectMarketplacePublicDocument(document([{
      kind: "recipe", id: "recipe", name: "Recipe", blurb: "Summary",
      artifact: "x".repeat(64 * 1024 + 1),
    }]));
    expect(overArtifact?.recipe?.artifact).toBeNull();
  });

  test("accepts only canonical allowlisted preview and reference URLs", () => {
    const invalid = [
      "http://ralphy.b-cdn.net/blocks/a.png",
      "https://user:pass@ralphy.b-cdn.net/blocks/a.png",
      "https://ralphy.b-cdn.net:444/blocks/a.png",
      "https://ralphy.b-cdn.net/blocks/a.png?q=secret",
      "https://ralphy.b-cdn.net/blocks/a.png#secret",
      "https://evil.example/blocks/a.png",
      "https://ralphy.b-cdn.net/library/a.png",
      "https://ralphy.b-cdn.net//blocks/a.png",
      "https://ralphy.b-cdn.net/blocks/../units/a.png",
      "https://ralphy.b-cdn.net/blocks/%2e%2e/units/a.png",
      "https://ralphy.b-cdn.net/blocks/%252e%252e/units/a.png",
      "https://ralphy.b-cdn.net/blocks/%2Fetc/passwd",
      "https://ralphy.b-cdn.net/blocks/%252fetc/passwd",
      "https://ralphy.b-cdn.net/blocks/%5cetc/passwd",
      "https://ralphy.b-cdn.net/blocks/%00.png",
      "https://ralphy.b-cdn.net/blocks/%zz.png",
      "https://ralphy.b-cdn.net/blocks\\a.png",
    ];
    for (const url of invalid) {
      const [item] = projectMarketplacePublicDocument(document([{
        kind: "recipe", id: "recipe", name: "Recipe", blurb: "Summary",
        refs: [url], demo: { kind: "media", storageUrl: url },
      }]));
      expect(item?.referenceUrls, url).toEqual([]);
      expect(item?.recipe?.demo?.storageUrl, url).toBeNull();
    }
    const [limited] = projectMarketplacePublicDocument(document([{
      kind: "template", id: "template", name: "Template", blurb: "Summary",
      refs: Array.from({ length: 9 }, (_, index) => `https://ralphy.b-cdn.net/blocks/a/${index}.png`),
    }]));
    expect(limited?.referenceUrls).toHaveLength(8);
  });

  test("falls back only to a strict bounded regular-file cache", async () => {
    const live = await loadMarketplacePublicLibrary({
      fetcher: fetcher(response(document())), cachePath, now: () => NOW,
    });
    const cached = await loadMarketplacePublicLibrary({
      fetcher: fetcher(new Error("network token=secret")), cachePath, now: () => NOW + 1,
    });
    expect(cached).toEqual({ ...live, source: "cache" });

    await writeFile(cachePath, "{");
    await expect(loadMarketplacePublicLibrary({ fetcher: fetcher(new Error("network")), cachePath, now: () => NOW }))
      .rejects.toThrow("Marketplace catalog is unavailable");

    await writeFile(cachePath, "x".repeat(2 * 1024 * 1024 + 1));
    await expect(loadMarketplacePublicLibrary({ fetcher: fetcher(new Error("network")), cachePath, now: () => NOW }))
      .rejects.toThrow("Marketplace catalog is unavailable");

    const target = join(directory, "target.json");
    await writeFile(target, JSON.stringify(live));
    await rm(cachePath, { force: true });
    await symlink(target, cachePath);
    await expect(loadMarketplacePublicLibrary({ fetcher: fetcher(new Error("network")), cachePath, now: () => NOW }))
      .rejects.toThrow("Marketplace catalog is unavailable");
  });

  test("keeps a valid live result when atomic cache update fails and redacts every path", async () => {
    const snapshot = await loadMarketplacePublicLibrary({
      fetcher: fetcher(response(document())),
      cachePath: directory,
      now: () => NOW,
    });
    expect(snapshot.source).toBe("live");
    expect(snapshot.warning).toBe("Catalog loaded, but its local cache could not be updated");
    expect(snapshot.warning).not.toContain(directory);

    const missing = join(directory, "private", "catalog.json");
    const error = await loadMarketplacePublicLibrary({
      fetcher: fetcher(new Error(`request failed at ${PUBLIC_LIBRARY_URL}`)),
      cachePath: missing,
      now: () => NOW,
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Marketplace catalog is unavailable");
    expect((error as Error).message).not.toContain(missing);
    expect((error as Error).message).not.toContain(PUBLIC_LIBRARY_URL);
  });
});
