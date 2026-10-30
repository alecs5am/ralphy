// Animated, sticker and icon stock sources (#597): Noto Animated Emoji, Fluent
// UI Emoji, Iconify, Commons animations, Pixabay and the Pinterest importer.
// Parsing, license mapping and kind filtering, all through an injected fixture
// fetch or a fake yt-dlp runner (zero network). Fixtures under
// tests/fixtures/stock/: the Noto index, the Fluent tree and metadata, the
// Iconify collections and search, and the Commons animation responses are
// trimmed live captures; the Pixabay and yt-dlp JSON follow the documented
// shapes.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DomainError } from "../../cli/lib/errors/domain.js";
import { setCredentialTestSource } from "../../cli/lib/providers/credentials.js";
import {
  FLUENT_EMOJI_COMMIT,
  FLUENT_INDEX_CACHE_KEY,
  clearFluentEmojiCache,
  fluentEmojiConnector,
  fluentFoldersFromTree,
  fluentSlug,
  parseFluentId,
  scoreFluentEntry,
} from "../../cli/lib/providers/fluent-emoji.js";
import { animatedSets, clearIconifyCache, iconifyConnector, parseIconifyId } from "../../cli/lib/providers/iconify.js";
import { clearNotoEmojiCache, notoEmojiConnector, parseNotoId, scoreNotoIcon } from "../../cli/lib/providers/noto-emoji.js";
import {
  clearPinterestCache,
  parsePinterestRef,
  pickPinImage,
  pinterestCandidate,
  pinterestConnector,
  setPinterestRunnerForTesting,
} from "../../cli/lib/providers/pinterest.js";
import { pickPixabayFile, pixabayConnector } from "../../cli/lib/providers/pixabay.js";
import { commonsConnector, isCommonsAnimation, parseCommonsRef } from "../../cli/lib/providers/wikimedia-commons.js";
import { readStockCache, setStockCacheDirForTesting } from "../../cli/lib/stock/cache.js";
import { stockCreditsMarkdown, type StockCredit } from "../../cli/lib/stock/credits.js";
import { passesLicenseFilter, spdxLicense, licenseNotes } from "../../cli/lib/stock/license.js";
import { artifactKindFor, mediaFitsKind, sniffStockMedia, stockFolderFor } from "../../cli/lib/stock/media.js";
import { connectorForId, expandStockIds } from "../../cli/lib/stock/pull.js";
import { matchesOrientation, searchStock } from "../../cli/lib/stock/search.js";
import { DEFAULT_STOCK_SOURCES, stockSourceOf } from "../../cli/lib/stock/sources.js";
import type { StockSearchRequest } from "../../cli/lib/stock/types.js";
import {
  STAR_SVG,
  bytesResponse,
  fakeYtdlp,
  fixtureFetch,
  gifBytes,
  jsonResponse,
  lottieJson,
  pngBytes,
  stockFixture,
} from "../helpers/stock-fetch.js";

const request = (over: Partial<StockSearchRequest> = {}): StockSearchRequest => ({
  query: "dog",
  kind: "animation",
  limit: 10,
  orientation: "any",
  license: "commercial",
  ...over,
});

const envSource = (_providerId: string, environmentVariable: string | null) =>
  environmentVariable ? process.env[environmentVariable] ?? null : null;

let cacheDir: string;

function resetCaches() {
  clearNotoEmojiCache();
  clearFluentEmojiCache();
  clearIconifyCache();
  clearPinterestCache();
}

beforeEach(() => {
  resetCaches();
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stock-cache-597-"));
  setStockCacheDirForTesting(cacheDir);
  // Keyed sources read as unset unless a test sets a key.
  setCredentialTestSource((providerId, environmentVariable) => (providerId === "pexels" || providerId === "pixabay" ? null : envSource(providerId, environmentVariable)));
});

afterEach(() => {
  resetCaches();
  setStockCacheDirForTesting(undefined);
  setPinterestRunnerForTesting(null);
  setCredentialTestSource(envSource);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

// ─── kinds, media, licenses ──────────────────────────────────────────────────

describe("new kinds: media sniffing, folders, orientation", () => {
  test("a Lottie JSON sniffs as data only when an animation was asked for", () => {
    const lottie = new TextEncoder().encode(lottieJson());
    expect(sniffStockMedia(lottie, "animation")).toEqual({ mime: "application/json", extension: ".json", artifactKind: "data", lottie: true });
    expect(sniffStockMedia(lottie, "image")).toBeNull();
    expect(sniffStockMedia(new TextEncoder().encode('{"layers": "no"}'), "animation")).toBeNull();
    expect(sniffStockMedia(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), "animation")).toMatchObject({ mime: "video/webm", artifactKind: "video" });
  });

  test("each kind accepts only its media", () => {
    const anim = { kind: "animation" as const };
    const sticker = { kind: "sticker" as const };
    const lottie = sniffStockMedia(new TextEncoder().encode(lottieJson()), "animation")!;
    const gif = sniffStockMedia(gifBytes("a"), "animation")!;
    const png = sniffStockMedia(pngBytes("a"), "sticker")!;
    const svg = sniffStockMedia(new TextEncoder().encode(STAR_SVG), "icon")!;
    expect([lottie, gif, svg].every((m) => mediaFitsKind(m, anim))).toBe(true);
    expect(mediaFitsKind(png, anim)).toBe(false);
    expect(mediaFitsKind(png, sticker) && mediaFitsKind(svg, sticker)).toBe(true);
    expect(mediaFitsKind(lottie, sticker)).toBe(false);
  });

  test("animations land in animations/, stickers and icons in images/", () => {
    const base = { durationSec: null, extra: {} };
    expect(stockFolderFor({ kind: "animation", mime: "application/json", ...base })).toBe("animations");
    expect(stockFolderFor({ kind: "animation", mime: "video/webm", ...base })).toBe("animations");
    expect(stockFolderFor({ kind: "sticker", mime: "image/png", ...base })).toBe("images");
    expect(stockFolderFor({ kind: "icon", mime: "image/svg+xml", ...base })).toBe("images");
    expect(artifactKindFor("animation", "application/json")).toBe("data");
    expect(artifactKindFor("animation", "video/webm")).toBe("video");
    expect(artifactKindFor("animation", "image/gif")).toBe("image");
    expect(artifactKindFor("sticker")).toBe("image");
  });

  test("stickers and icons ignore --orientation; animations of known size honor it", () => {
    expect(matchesOrientation({ kind: "sticker", width: 1920, height: 1080 }, "vertical")).toBe(true);
    expect(matchesOrientation({ kind: "icon", width: 24, height: 12 }, "vertical")).toBe(true);
    expect(matchesOrientation({ kind: "animation", width: 1920, height: 1080 }, "vertical")).toBe(false);
  });

  test("default sources per new kind; Pinterest is never a default", () => {
    expect(DEFAULT_STOCK_SOURCES.animation).toEqual(["noto-emoji", "iconify", "commons"]);
    expect(DEFAULT_STOCK_SOURCES.sticker).toEqual(["fluent-emoji", "noto-emoji", "pixabay"]);
    expect(DEFAULT_STOCK_SOURCES.icon).toEqual(["iconify"]);
    expect(Object.values(DEFAULT_STOCK_SOURCES).flat()).not.toContain("pinterest");
    expect(stockSourceOf("noto-emoji:lottie:1f415")).toBe("noto-emoji");
    expect(stockSourceOf("pinterest:pin:1")).toBe("pinterest");
  });
});

describe("SPDX licenses (Iconify icon sets)", () => {
  test("permissive and CC licenses pass; GPL / OFL / NC / unknown fail commercial; BY-SA and MPL fail open", () => {
    const cases: Array<[string, string, boolean, boolean, boolean]> = [
      // spdx, title, commercial, open, attributionRequired
      ["MIT", "MIT", true, true, true],
      ["Apache-2.0", "Apache 2.0", true, true, true],
      ["ISC", "ISC", true, true, true],
      ["CC0-1.0", "CC0", true, true, false],
      ["Unlicense", "Unlicense", true, true, false],
      ["CC-BY-4.0", "CC BY 4.0", true, true, true],
      ["CC-BY-SA-4.0", "CC BY-SA 4.0", true, false, true],
      ["MPL-2.0", "Mozilla Public License 2.0", true, false, true],
      ["CC-BY-NC-4.0", "CC BY-NC 4.0", false, false, true],
      ["GPL-3.0", "GPL", false, false, true],
      ["GPL-2.0-only", "GPL 2.0", false, false, true],
      ["OFL-1.1", "Open Font License", false, false, true],
      ["", "", false, false, true],
    ];
    for (const [spdx, title, commercial, open, attribution] of cases) {
      const license = spdxLicense(spdx, title, null);
      expect([spdx, passesLicenseFilter(license, "commercial"), passesLicenseFilter(license, "open"), license.attributionRequired]).toEqual([spdx, commercial, open, attribution]);
    }
    expect(spdxLicense("CC-BY-SA-3.0", "CC BY SA", null).license).toBe("CC BY-SA 3.0");
    expect(spdxLicense("", "", null).license).toBe("unknown");
    expect(licenseNotes(spdxLicense("GPL-3.0", "GPL", null)).join(" ")).toContain("copyleft software license");
    expect(licenseNotes(spdxLicense("OFL-1.1", "Open Font License", null)).join(" ")).toContain("font license");
  });
});

// ─── noto emoji ──────────────────────────────────────────────────────────────

describe("noto-emoji connector", () => {
  const routes = () => fixtureFetch([
    { match: (u) => u.host === "googlefonts.github.io" && u.pathname === "/noto-emoji-animation/data/api.json", respond: () => jsonResponse(stockFixture("noto-emoji-index.json")) },
  ]);

  test("animation search reads the project's index and returns Lottie candidates, best match first", async () => {
    const { fetchImpl, calls } = routes();
    const found = await notoEmojiConnector.search(request({ query: "dog" }), fetchImpl);
    expect(calls.map((c) => c.url)).toEqual(["https://googlefonts.github.io/noto-emoji-animation/data/api.json"]);
    expect(found.map((c) => c.id)).toEqual(["noto-emoji:lottie:1f415", "noto-emoji:lottie:1f9ae", "noto-emoji:lottie:1f415_200d_1f9ba"]);
    expect(found[0]).toMatchObject({
      source: "noto-emoji",
      kind: "animation",
      title: "Dog animated emoji",
      mediaUrl: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/lottie.json",
      previewUrl: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/512.webp",
      pageUrl: "https://googlefonts.github.io/noto-emoji-animation/?selected=Animated%20Emoji%3Aemoji_u1f415",
      mime: "application/json",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      author: "Google",
      commercialOk: true,
      attributionRequired: true,
      extra: { codepoint: "1f415", format: "lottie", webpId: "noto-emoji:webp:1f415", gifId: "noto-emoji:gif:1f415" },
    });
    expect(found[0]!.attribution).toBe("\"Dog (Noto Animated Emoji)\" by Google, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: Noto Animated Emoji, https://googlefonts.github.io/noto-emoji-animation/?selected=Animated%20Emoji%3Aemoji_u1f415");
  });

  test("sticker search returns the static SVG frame; other kinds return nothing", async () => {
    const { fetchImpl } = routes();
    const [sticker] = await notoEmojiConnector.search(request({ kind: "sticker", query: "smiley cat" }), fetchImpl);
    expect(sticker).toMatchObject({ id: "noto-emoji:svg:1f63a", kind: "sticker", mime: "image/svg+xml", mediaUrl: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f63a/emoji.svg" });
    expect(await notoEmojiConnector.search(request({ kind: "icon" }), fetchImpl)).toEqual([]);
  });

  test("scoring: a phrase tag wins, a category alone never matches", () => {
    const smiley = { codepoint: "1f63a", tags: [":smiley-cat:"], categories: ["Smileys and emotions"] };
    const smile = { codepoint: "1f638", tags: [":smile-cat:"], categories: ["Smileys and emotions"] };
    expect(scoreNotoIcon(smiley, "smiley cat")).toBeGreaterThan(scoreNotoIcon(smile, "smiley cat"));
    expect(scoreNotoIcon(smile, "smileys")).toBe(0);
    expect(scoreNotoIcon(smile, "")).toBe(0);
  });

  test("the index is cached on disk for a day; ids round-trip through lookup", async () => {
    const { fetchImpl, calls } = routes();
    await notoEmojiConnector.search(request(), fetchImpl);
    clearNotoEmojiCache();
    const again = await notoEmojiConnector.lookup("noto-emoji:webp:1f415", fetchImpl);
    expect(calls).toHaveLength(1);
    expect(again).toMatchObject({ id: "noto-emoji:webp:1f415", kind: "animation", mime: "image/webp", mediaUrl: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/512.webp" });
    expect((await notoEmojiConnector.lookup("noto-emoji:png:1f415", fetchImpl)).kind).toBe("sticker");
    await expect(notoEmojiConnector.lookup("noto-emoji:lottie:1f999", fetchImpl)).rejects.toThrow(/no animated emoji/);
    expect(parseNotoId("noto-emoji:mp4:1f415")).toBeNull();
    expect(parseNotoId("noto-emoji:gif:1F415")).toBeNull();
  });
});

// ─── fluent emoji ────────────────────────────────────────────────────────────

describe("fluent-emoji connector", () => {
  const metadata = stockFixture<Record<string, unknown>>("fluent-metadata.json");
  const routes = (failMetadataFor: string | null = null) => fixtureFetch([
    { match: (u) => u.host === "api.github.com", respond: () => jsonResponse(stockFixture("fluent-tree.json")) },
    {
      match: (u) => u.host === "cdn.jsdelivr.net" && u.pathname.endsWith("/metadata.json"),
      respond: (u) => {
        const folder = decodeURIComponent(u.pathname.split("/").slice(-2)[0]!);
        if (folder === failMetadataFor) return new Response("upstream error", { status: 502 });
        return metadata[folder] ? jsonResponse(metadata[folder]) : new Response("missing", { status: 404 });
      },
    },
  ]);

  test("the tree gives one entry per emoji folder; skin-tone emoji use the Default tone", () => {
    const folders = fluentFoldersFromTree(stockFixture("fluent-tree.json").tree);
    expect(folders.get("Waving hand")).toEqual({
      metadata: "assets/Waving hand/metadata.json",
      png3d: "assets/Waving hand/Default/3D/waving_hand_3d_default.png",
      flatSvg: "assets/Waving hand/Default/Flat/waving_hand_flat_default.svg",
    });
    expect(folders.get("Cat")?.png3d).toBe("assets/Cat/3D/cat_3d.png");
    expect(fluentSlug("Pi\u00f1ata")).toBe("pinata");
    expect(fluentSlug("O button (blood type)")).toBe("o-button-blood-type");
  });

  test("the first search builds the keyword index from the pinned tree and metadata, then caches it", async () => {
    expect(fluentEmojiConnector.coldStartTimeoutMs!()).toBe(120_000);
    const { fetchImpl, calls } = routes();
    const found = await fluentEmojiConnector.search(request({ kind: "sticker", query: "cat" }), fetchImpl);
    expect(calls[0]!.url).toBe(`https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/${FLUENT_EMOJI_COMMIT}?recursive=1`);
    expect(calls.slice(1).every((c) => c.url.startsWith(`https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${FLUENT_EMOJI_COMMIT}/assets/`))).toBe(true);
    expect(calls).toHaveLength(6);
    expect(found.map((c) => c.id)).toEqual(["fluent-emoji:3d:cat", "fluent-emoji:3d:cat-face"]);
    expect(found[0]).toMatchObject({
      source: "fluent-emoji",
      kind: "sticker",
      title: "Cat 3D emoji",
      mediaUrl: `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${FLUENT_EMOJI_COMMIT}/assets/Cat/3D/cat_3d.png`,
      pageUrl: `https://github.com/microsoft/fluentui-emoji/tree/${FLUENT_EMOJI_COMMIT}/assets/Cat`,
      mime: "image/png",
      width: 256,
      license: "MIT",
      licenseUrl: `https://github.com/microsoft/fluentui-emoji/blob/${FLUENT_EMOJI_COMMIT}/LICENSE`,
      commercialOk: true,
      modificationOk: true,
      attributionRequired: true,
      shareAlike: false,
      extra: { unicode: "1f408", flatId: "fluent-emoji:flat:cat" },
    });
    // Keywords count: "pet" finds the cat, the cat face and the dog.
    const pets = await fluentEmojiConnector.search(request({ kind: "sticker", query: "pet" }), fetchImpl);
    expect(pets.map((c) => c.id).sort()).toEqual(["fluent-emoji:3d:cat", "fluent-emoji:3d:cat-face", "fluent-emoji:3d:dog"]);
    expect(calls).toHaveLength(6);
    expect(readStockCache<unknown[]>(FLUENT_INDEX_CACHE_KEY, null)).toHaveLength(5);
    clearFluentEmojiCache();
    expect(fluentEmojiConnector.coldStartTimeoutMs!()).toBeNull();
  });

  test("a failed metadata.json keeps the emoji searchable by name but leaves the index uncached", async () => {
    const { fetchImpl } = routes("Dog");
    const found = await fluentEmojiConnector.search(request({ kind: "sticker", query: "dog" }), fetchImpl);
    expect(found.map((c) => c.id)).toEqual(["fluent-emoji:3d:dog"]);
    expect(found[0]!.extra.unicode).toBeNull();
    expect(readStockCache(FLUENT_INDEX_CACHE_KEY, null)).toBeNull();
  });

  test("flat ids round-trip as SVG; scoring needs a name or keyword hit; other kinds return nothing", async () => {
    const { fetchImpl } = routes();
    const flat = await fluentEmojiConnector.lookup("fluent-emoji:flat:waving-hand", fetchImpl);
    expect(flat).toMatchObject({ id: "fluent-emoji:flat:waving-hand", mime: "image/svg+xml", mediaUrl: `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${FLUENT_EMOJI_COMMIT}/assets/Waving%20hand/Default/Flat/waving_hand_flat_default.svg` });
    expect((await fluentEmojiConnector.lookup("fluent-emoji:3d:pinata", fetchImpl)).title).toBe("Pi\u00f1ata 3D emoji");
    await expect(fluentEmojiConnector.lookup("fluent-emoji:3d:unicorn", fetchImpl)).rejects.toThrow(/no 3d emoji 'unicorn'/);
    expect(scoreFluentEntry({ cldr: "cat face", keywords: ["cat"], group: "Animals & Nature" }, "animals")).toBe(0);
    expect(parseFluentId("fluent-emoji:color:cat")).toBeNull();
    expect(await fluentEmojiConnector.search(request({ kind: "animation" }), fetchImpl)).toEqual([]);
  });
});

// ─── iconify ─────────────────────────────────────────────────────────────────

describe("iconify connector", () => {
  const routes = () => fixtureFetch([
    { match: (u) => u.pathname === "/collections", respond: () => jsonResponse(stockFixture("iconify-collections.json")) },
    {
      match: (u) => u.pathname === "/search" && u.searchParams.has("prefixes"),
      respond: () => jsonResponse({ icons: ["line-md:star", "svg-spinners:90-ring", "mdi:star"], total: 3, limit: 32, start: 0 }),
    },
    { match: (u) => u.pathname === "/search", respond: () => jsonResponse(stockFixture("iconify-search-star.json")) },
    {
      match: (u) => u.pathname.endsWith(".json") && u.pathname !== "/collections",
      respond: (u) => {
        const name = u.searchParams.get("icons")!;
        const known = name === "star" || name === "loading-loop";
        return jsonResponse({ prefix: u.pathname.slice(1, -5), icons: known ? { [name]: { body: "<path/>" } } : {}, ...(known ? {} : { not_found: [name] }) });
      },
    },
  ]);

  test("icon search maps each set's license from the collections endpoint", async () => {
    const { fetchImpl, calls } = routes();
    const found = await iconifyConnector.search(request({ kind: "icon", query: "star" }), fetchImpl);
    const search = new URL(calls.find((c) => c.url.includes("/search"))!.url);
    expect(search.host).toBe("api.iconify.design");
    expect(Number(search.searchParams.get("limit"))).toBeGreaterThanOrEqual(32);
    expect(search.searchParams.get("prefixes")).toBeNull();
    const byId = Object.fromEntries(found.map((c) => [c.id, c]));
    expect(byId["iconify:mdi:star"]).toMatchObject({
      kind: "icon",
      title: "Star icon (Material Design Icons)",
      mediaUrl: "https://api.iconify.design/mdi/star.svg?height=auto",
      pageUrl: "https://icon-sets.iconify.design/mdi/star/",
      mime: "image/svg+xml",
      license: "Apache 2.0",
      author: "Pictogrammers",
      commercialOk: true,
      attributionRequired: true,
    });
    expect(byId["iconify:mdi:star"]!.notes.some((n) => n.includes("currentColor"))).toBe(true);
    expect(byId["iconify:typcn:star"]).toMatchObject({ license: "CC BY-SA 4.0", shareAlike: true, commercialOk: true });
    expect(byId["iconify:gridicons:star"]).toMatchObject({ commercialOk: false });
    expect(byId["iconify:mdi-light:star"]).toMatchObject({ commercialOk: false });
    expect(byId["iconify:circum:star"]).toMatchObject({ shareAlike: true });
    expect(byId["iconify:unlisted:star"]).toMatchObject({ license: "unknown", commercialOk: false });
    expect(byId["iconify:line-md:star"]).toMatchObject({ kind: "icon", extra: { animated: true } });
  });

  test("the commercial and open filters drop GPL / OFL / unknown, then ShareAlike and MPL", async () => {
    const commercial = await searchStock({ query: "star", kind: "icon", sources: ["iconify"], limit: 20, orientation: "any", license: "commercial", fetchImpl: routes().fetchImpl });
    expect(commercial.candidates.map((c) => c.id).sort()).toEqual(["iconify:circum:star", "iconify:line-md:star", "iconify:mdi:star", "iconify:solar:star-bold", "iconify:tabler:star", "iconify:typcn:star"]);
    clearIconifyCache();
    const open = await searchStock({ query: "star", kind: "icon", sources: ["iconify"], limit: 20, orientation: "any", license: "open", fetchImpl: routes().fetchImpl });
    expect(open.candidates.map((c) => c.id).sort()).toEqual(["iconify:line-md:star", "iconify:mdi:star", "iconify:solar:star-bold", "iconify:tabler:star"]);
  });

  test("animation search asks only the animated sets and returns iconify:animation: ids", async () => {
    const { fetchImpl, calls } = routes();
    const collections = stockFixture("iconify-collections.json");
    expect(animatedSets(collections)).toEqual(["line-md", "meteocons", "svg-spinners"]);
    const found = await iconifyConnector.search(request({ kind: "animation", query: "star" }), fetchImpl);
    const search = new URL(calls.find((c) => c.url.includes("/search"))!.url);
    expect(search.searchParams.get("prefixes")).toBe("line-md,meteocons,svg-spinners");
    // mdi:star is not an animated set and is dropped even if the API returned it.
    expect(found.map((c) => [c.id, c.kind])).toEqual([
      ["iconify:animation:line-md:star", "animation"],
      ["iconify:animation:svg-spinners:90-ring", "animation"],
    ]);
    expect(found[0]!.notes.some((n) => n.startsWith("Animated SVG"))).toBe(true);
  });

  test("ids round-trip through lookup; missing icons and static sets as animation are refused", async () => {
    const { fetchImpl } = routes();
    expect(parseIconifyId("iconify:animation:line-md:loading-loop")).toEqual({ prefix: "line-md", name: "loading-loop", animation: true });
    expect(parseIconifyId("iconify:mdi")).toBeNull();
    expect((await iconifyConnector.lookup("iconify:mdi:star", fetchImpl)).id).toBe("iconify:mdi:star");
    expect((await iconifyConnector.lookup("iconify:animation:line-md:loading-loop", fetchImpl)).kind).toBe("animation");
    await expect(iconifyConnector.lookup("iconify:mdi:nope", fetchImpl)).rejects.toThrow(/no icon 'nope'/);
    await expect(iconifyConnector.lookup("iconify:animation:mdi:star", fetchImpl)).rejects.toThrow(/has no animated icons/);
    await expect(iconifyConnector.lookup("iconify:nosuchset:star", fetchImpl)).rejects.toThrow(/no icon set/);
  });
});

// ─── commons animations ──────────────────────────────────────────────────────

describe("commons animations", () => {
  const fixture = stockFixture("commons-search-animation.json");
  const routes = () => fixtureFetch([
    {
      match: (u) => u.host === "commons.wikimedia.org" && u.searchParams.has("gsrsearch"),
      respond: (u) => {
        const q = u.searchParams.get("gsrsearch")!;
        return jsonResponse(q.includes("image/gif") ? fixture.gif : q.includes("image/webp") ? fixture.webp : fixture.webm);
      },
    },
    {
      match: (u) => u.host === "commons.wikimedia.org" && u.searchParams.has("titles"),
      respond: (u) => {
        const title = u.searchParams.get("titles")!;
        const page = [...fixture.gif.query.pages, ...fixture.webm.query.pages, ...fixture.webp.query.pages].find((p: { title: string }) => p.title === title);
        return jsonResponse({ query: { pages: [page ?? { title, missing: true }] } });
      },
    },
  ]);

  test("one filemime search per container; static GIFs and long WebMs are dropped", async () => {
    const { fetchImpl, calls } = routes();
    const found = await commonsConnector.search(request({ query: "dog" }), fetchImpl);
    const searches = calls.map((c) => new URL(c.url).searchParams.get("gsrsearch"));
    expect(searches).toEqual(["dog filemime:image/gif", "dog filemime:image/webp", "dog filemime:video/webm filesize:<30000"]);
    expect(calls.every((c) => new URL(c.url).searchParams.get("viprop")!.includes("metadata"))).toBe(true);
    const ids = found.map((c) => c.id);
    expect(ids).toContain("commons:animation:File:Dog_galloping.gif");
    expect(ids).toContain("commons:animation:File:Dog_wagging_tail.webm");
    expect(ids).not.toContain("commons:animation:File:Measures-for-preventing-dog-bites_CDC_m226a1b.gif");
    expect(ids).not.toContain("commons:animation:File:Angry_dog.webm");
    expect(found.every((c) => c.kind === "animation")).toBe(true);
    expect(found.find((c) => c.id.endsWith("Dog_galloping.gif"))).toMatchObject({ mime: "image/gif", license: "Public domain", mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/9/91/Dog_galloping.gif" });
    expect(found.find((c) => c.id.endsWith("Dog_wagging_tail.webm"))).toMatchObject({ mime: "video/webm", durationSec: 3.6 });
  });

  test("animated WebP passes, a still WebP does not", () => {
    const [still, animated] = fixture.webp.query.pages;
    expect(isCommonsAnimation(animated.videoinfo[0])).toBe(true);
    expect(isCommonsAnimation(still.videoinfo[0])).toBe(false);
  });

  test("an animation id round-trips as an animation; the plain id of the same file is an image", async () => {
    const { fetchImpl, calls } = routes();
    expect(parseCommonsRef("commons:animation:File:Dog_galloping.gif")).toEqual({ title: "File:Dog galloping.gif", animation: true });
    const anim = await commonsConnector.lookup("commons:animation:File:Dog_galloping.gif", fetchImpl);
    expect(new URL(calls[0]!.url).searchParams.get("viprop")).toContain("metadata");
    expect(anim).toMatchObject({ id: "commons:animation:File:Dog_galloping.gif", kind: "animation" });
    const still = await commonsConnector.lookup("commons:File:Dog_galloping.gif", fetchImpl);
    expect(still).toMatchObject({ id: "commons:File:Dog_galloping.gif", kind: "image" });
    await expect(commonsConnector.lookup("commons:animation:File:Angry_dog.webm", fetchImpl)).rejects.toThrow(/at most 20 s/);
  });
});

// ─── pixabay ─────────────────────────────────────────────────────────────────

describe("pixabay connector", () => {
  const routes = () => fixtureFetch([
    { match: (u) => u.host === "pixabay.com" && u.pathname === "/api/videos/", respond: () => jsonResponse(stockFixture("pixabay-videos.json")) },
    {
      match: (u) => u.host === "pixabay.com" && u.pathname === "/api/",
      respond: (u) => {
        const body = stockFixture("pixabay-images.json");
        const id = u.searchParams.get("id");
        return jsonResponse(id ? { ...body, hits: body.hits.filter((h: { id: number }) => String(h.id) === id) } : body);
      },
    },
  ]);

  test("without PIXABAY_API_KEY the source is skipped with a note and never called", async () => {
    const { fetchImpl, calls } = routes();
    const result = await searchStock({ query: "flower", kind: "image", sources: ["pixabay"], limit: 5, orientation: "any", license: "commercial", fetchImpl });
    expect(result).toMatchObject({ count: 0, sources: [{ source: "pixabay", status: "skipped" }] });
    expect(result.notes[0]).toStartWith("pixabay skipped: PIXABAY_API_KEY is not set");
    expect(calls).toHaveLength(0);
  });

  test("with a key: the key rides the documented query parameter, responses are cached without it", async () => {
    setCredentialTestSource((providerId) => (providerId === "pixabay" ? "test-pixabay-key" : null));
    const { fetchImpl, calls } = routes();
    const photos = await pixabayConnector.search(request({ kind: "image", query: "flower", orientation: "horizontal" }), fetchImpl);
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("key")).toBe("test-pixabay-key");
    expect(url.searchParams.get("image_type")).toBe("all");
    expect(url.searchParams.get("orientation")).toBe("horizontal");
    expect(url.searchParams.get("safesearch")).toBe("true");
    expect(photos.map((c) => [c.id, c.kind])).toEqual([["pixabay:image:195893", "image"], ["pixabay:image:1295324", "image"]]);
    expect(photos[0]).toMatchObject({
      title: "Blossom, bloom, flower",
      mediaUrl: "https://pixabay.com/get/ed6a99fd0a76647_1280.jpg",
      width: 1280,
      height: 720,
      license: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/",
      commercialOk: true,
      attributionRequired: false,
      author: "Josch13",
      authorUrl: "https://pixabay.com/users/Josch13-48777/",
      attribution: "Photo by Josch13 on Pixabay: https://pixabay.com/en/blossom-bloom-flower-195893/",
    });
    // The 24 h cache answers the same search again; no cached file holds the key.
    await pixabayConnector.search(request({ kind: "image", query: "flower", orientation: "horizontal" }), fetchImpl);
    expect(calls).toHaveLength(1);
    for (const file of fs.readdirSync(cacheDir)) expect(fs.readFileSync(path.join(cacheDir, file), "utf8")).not.toContain("test-pixabay-key");
  });

  test("stickers ask for vectors; video picks the largest file at most 1080 lines; ids round-trip", async () => {
    setCredentialTestSource((providerId) => (providerId === "pixabay" ? "test-pixabay-key" : null));
    const { fetchImpl, calls } = routes();
    const stickers = await pixabayConnector.search(request({ kind: "sticker", query: "cat" }), fetchImpl);
    expect(new URL(calls[0]!.url).searchParams.get("image_type")).toBe("vector");
    expect(stickers.every((c) => c.kind === "sticker")).toBe(true);
    const [video] = await pixabayConnector.search(request({ kind: "video", query: "flowers" }), fetchImpl);
    expect(video).toMatchObject({ id: "pixabay:video:125", kind: "video", mediaUrl: "https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.mp4", width: 1920, height: 1080, durationSec: 12 });
    expect(pickPixabayFile({ large: { url: "https://x.test/4k.mp4", width: 3840, height: 2160 } })?.url).toBe("https://x.test/4k.mp4");
    expect((await pixabayConnector.lookup("pixabay:image:1295324", fetchImpl)).kind).toBe("sticker");
    await expect(pixabayConnector.lookup("pixabay:image:999", fetchImpl)).rejects.toThrow(/not found/);
  });
});

// ─── pinterest ───────────────────────────────────────────────────────────────

describe("pinterest importer", () => {
  const pins = stockFixture("pinterest-ytdlp.json");
  const BOARD = "https://www.pinterest.com/doodlestudio/sticker-ideas/";
  const IMAGE_PIN = "https://www.pinterest.com/pin/112233445566778899/";

  test("references: pins (any slug, any country domain), boards and short links; nothing else", () => {
    expect(parsePinterestRef("pinterest:pin:112233445566778899")).toEqual({ type: "pin", pinId: "112233445566778899", url: IMAGE_PIN });
    expect(parsePinterestRef("pinterest:https://www.pinterest.co.uk/pin/some-title--112233445566778899/")).toMatchObject({ type: "pin", pinId: "112233445566778899" });
    expect(parsePinterestRef("pinterest:https://pinterest.com/doodlestudio/sticker-ideas")).toEqual({ type: "board", url: BOARD });
    expect(parsePinterestRef("pinterest:https://pin.it/4AbCdEf")).toEqual({ type: "short", url: "https://pin.it/4AbCdEf" });
    expect(parsePinterestRef("pinterest:https://www.pinterest.com/search/pins/")).toBeNull();
    expect(parsePinterestRef("pinterest:https://example.test/pin/1/")).toBeNull();
    expect(parsePinterestRef("pinterest:123")).toBeNull();
  });

  test("an image pin keeps the original pinimg file, has no license and is reference only", () => {
    const pin = pinterestCandidate(pins.imagePin)!;
    expect(pin).toMatchObject({
      id: "pinterest:pin:112233445566778899",
      source: "pinterest",
      kind: "image",
      title: "Hand-drawn doodle sticker sheet",
      pageUrl: IMAGE_PIN,
      mediaUrl: "https://i.pinimg.com/originals/ab/cd/ef/abcdef0123456789.png",
      width: 1000,
      height: 1500,
      author: "Doodle Studio",
      commercialOk: false,
      modificationOk: false,
      attributionRequired: true,
      extra: { referenceOnly: true, pinId: "112233445566778899", video: false },
    });
    expect(pin.license).toContain("rights belong to the pin's creator");
    expect(passesLicenseFilter(pin, "commercial")).toBe(false);
    expect(passesLicenseFilter(pin, "open")).toBe(false);
    expect(passesLicenseFilter(pin, "any")).toBe(true);
    expect(pin.notes.some((n) => n.includes("terms restrict automated access"))).toBe(true);
    // A larger image on another host is never chosen.
    expect(pickPinImage(pins.imagePin.thumbnails)?.url).toContain("i.pinimg.com/originals/");
  });

  test("a video pin downloads through yt-dlp from its page; an embed of another site is skipped", () => {
    expect(pinterestCandidate(pins.videoPin)).toMatchObject({ id: "pinterest:pin:664281013778109217", kind: "video", mediaUrl: "https://www.pinterest.com/pin/664281013778109217/", durationSec: 57.7, width: 720, height: 1280 });
    expect(pinterestCandidate(pins.embedPin)).toBeNull();
  });

  test("a board expands logged out, capped by --max; its pins resolve without asking again", async () => {
    const fake = fakeYtdlp({ [BOARD]: { stdout: pins.board } });
    setPinterestRunnerForTesting(fake.run);
    const { fetchImpl } = fixtureFetch([]);
    const ids = await expandStockIds([`pinterest:${BOARD}`], fetchImpl, { max: 2 });
    expect(ids).toEqual(["pinterest:pin:200000000000000001", "pinterest:pin:200000000000000002"]);
    const args = fake.calls[0]!;
    expect(args).toEqual(["-J", "--no-warnings", "--ignore-no-formats-error", "--socket-timeout", "15", "--playlist-end", "2", BOARD]);
    expect(args.some((a) => /cookie|username|password|netrc|proxy/i.test(a))).toBe(false);
    const second = await pinterestConnector.lookup(ids[1]!, fetchImpl);
    expect(second).toMatchObject({ title: "Heart sticker with a white border", mediaUrl: "https://i.pinimg.com/originals/02/02/02/0202.png" });
    expect(fake.calls).toHaveLength(1);
    // A pin URL is one item: expand leaves it as given.
    expect(await expandStockIds([`pinterest:${IMAGE_PIN}`], fetchImpl, { max: 5 })).toEqual([`pinterest:${IMAGE_PIN}`]);
  });

  test("a pin lookup runs yt-dlp -J with --no-playlist; a failed read explains private pins", async () => {
    const fake = fakeYtdlp({ [IMAGE_PIN]: { stdout: pins.imagePin }, "https://www.pinterest.com/pin/1/": { code: 1, stderr: "ERROR: [Pinterest] 1: HTTP Error 404: Not Found" } });
    setPinterestRunnerForTesting(fake.run);
    const { fetchImpl } = fixtureFetch([]);
    expect((await pinterestConnector.lookup(`pinterest:${IMAGE_PIN}`, fetchImpl)).id).toBe("pinterest:pin:112233445566778899");
    expect(fake.calls[0]).toContain("--no-playlist");
    const error = await pinterestConnector.lookup("pinterest:pin:1", fetchImpl).catch((e) => e);
    expect(error.status).toBe(404);
    expect(error.message).toContain("Private pins and boards");
  });

  test("video pins download through yt-dlp into scratch", async () => {
    const fake = fakeYtdlp({ "https://www.pinterest.com/pin/664281013778109217/": { writeBytes: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]) } });
    setPinterestRunnerForTesting(fake.run);
    const candidate = pinterestCandidate(pins.videoPin)!;
    const file = await pinterestConnector.download!(candidate, fixtureFetch([]).fetchImpl, { maxBytes: 1_000_000, timeoutMs: 5000 });
    expect(sniffStockMedia(file.bytes, "video")).toMatchObject({ mime: "video/mp4" });
    const args = fake.calls[0]!;
    expect(args).toContain("--no-playlist");
    expect(args[args.indexOf("-f") + 1]).toBe("b[ext=mp4][height<=1080]/b[height<=1080]/b");
    expect(fs.existsSync(path.dirname(args[args.indexOf("-o") + 1]!))).toBe(false);
  });

  test("pinterest has no search; malformed ids are refused before any request", async () => {
    const error = await searchStock({ query: "stickers", kind: "image", sources: ["pinterest"], limit: 5, orientation: "any", license: "any", fetchImpl: fixtureFetch([]).fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.details.detail).toContain("pinterest has no search");
    for (const bad of ["pinterest:123", "noto-emoji:lottie:XYZ", "fluent-emoji:3d:", "iconify:mdi", "pixabay:photo:1"]) {
      const refused = (() => {
        try {
          connectorForId(bad);
          return null;
        } catch (e) {
          return e as DomainError;
        }
      })();
      expect(refused?.code).toBe("E_INPUT_INVALID");
    }
  });
});

// ─── credits ─────────────────────────────────────────────────────────────────

describe("credits with reference-only items", () => {
  const credit = (id: string, over: Partial<StockCredit>): StockCredit => ({
    candidateId: id, source: id.split(":")[0]!, title: id, slot: "s", revisionId: "r", path: null, license: "CC BY 4.0", licenseUrl: null,
    author: null, pageUrl: "https://x.test", attribution: `credit for ${id}`, attributionRequired: true, referenceOnly: false, ...over,
  });

  test("reference-only items get their own heading after the publishable credits", () => {
    const markdown = stockCreditsMarkdown([
      credit("pinterest:pin:1", { referenceOnly: true }),
      credit("noto-emoji:lottie:1f415", {}),
      credit("simple-icons:nvidia", { attributionRequired: false }),
    ]);
    expect(markdown).toBe([
      "**Credits**",
      "",
      "- credit for noto-emoji:lottie:1f415",
      "",
      "Also used (no attribution required):",
      "- credit for simple-icons:nvidia",
      "",
      "Reference only, not cleared for publishing:",
      "- credit for pinterest:pin:1",
      "",
    ].join("\n"));
    expect(stockCreditsMarkdown([credit("pinterest:pin:2", { referenceOnly: true })])).toBe("**Credits**\n\nReference only, not cleared for publishing:\n- credit for pinterest:pin:2\n");
  });
});
