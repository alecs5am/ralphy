// Stock source connectors (#596): response parsing, the license filter and
// candidate id round-trips, all through an injected fixture fetch (zero
// network). Fixtures under tests/fixtures/stock/ mirror real API responses
// (the Openverse image and Commons lookup records were captured live).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DomainError } from "../../cli/lib/errors/domain.js";
import { setCredentialTestSource } from "../../cli/lib/providers/credentials.js";
import { archiveConnector, archiveQuery, parseArchiveId, pickArchiveMp4 } from "../../cli/lib/providers/internet-archive.js";
import { openverseConnector, parseOpenverseId } from "../../cli/lib/providers/openverse.js";
import { pexelsConnector, pickPexelsFile } from "../../cli/lib/providers/pexels.js";
import {
  SIMPLE_ICONS_VERSION,
  clearSimpleIconsCache,
  scoreIcon,
  simpleIconsConnector,
  titleToSlug,
  withBrandFill,
} from "../../cli/lib/providers/simple-icons.js";
import { commonsConnector, commonsId, commonsQueryTerms, commonsRelevance, parseCommonsId } from "../../cli/lib/providers/wikimedia-commons.js";
import { StockSourceError, stockDownload, stockGetJson } from "../../cli/lib/stock/http.js";
import {
  UNKNOWN_LICENSE,
  allowsCommercialEdit,
  buildAttribution,
  ccLicense,
  licenseFromShortName,
  licenseFromUrl,
  passesLicenseFilter,
} from "../../cli/lib/stock/license.js";
import { sniffStockMedia, stockFolder } from "../../cli/lib/stock/media.js";
import { defaultStockSlot, slugify } from "../../cli/lib/stock/pull.js";
import { interleave, matchesOrientation, searchStock } from "../../cli/lib/stock/search.js";
import { stockSourceOf } from "../../cli/lib/stock/sources.js";
import { STOCK_USER_AGENT, type StockCandidate, type StockSearchRequest } from "../../cli/lib/stock/types.js";
import { NVIDIA_SVG, bytesResponse, fixtureFetch, jsonResponse, jpegBytes, mp3Bytes, mp4Bytes, stockFixture } from "../helpers/stock-fetch.js";

const request = (over: Partial<StockSearchRequest> = {}): StockSearchRequest => ({
  query: "stock market",
  kind: "image",
  limit: 10,
  orientation: "any",
  license: "commercial",
  ...over,
});

// The preloaded default (tests/helpers/credential-test-source.ts) reads the env
// var; other test files rely on it, so it is restored, never cleared. Pexels
// reads as unset here whatever the runner env holds.
const envSource = (_providerId: string, environmentVariable: string | null) =>
  environmentVariable ? process.env[environmentVariable] ?? null : null;

beforeEach(() => {
  clearSimpleIconsCache();
  setCredentialTestSource((providerId, environmentVariable) => (providerId === "pexels" ? null : envSource(providerId, environmentVariable)));
});

afterEach(() => {
  clearSimpleIconsCache();
  setCredentialTestSource(envSource);
});

// ─── licenses ────────────────────────────────────────────────────────────────

describe("license normalization", () => {
  test("Creative Commons codes carry the NC / ND / SA / BY flags", () => {
    expect(ccLicense("by", "4.0")).toEqual({
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      commercialOk: true,
      modificationOk: true,
      attributionRequired: true,
      shareAlike: false,
    });
    expect(ccLicense("by-nc-sa", "2.0")).toMatchObject({ license: "CC BY-NC-SA 2.0", commercialOk: false, modificationOk: true, shareAlike: true });
    expect(ccLicense("by-nd", "3.0")).toMatchObject({ commercialOk: true, modificationOk: false });
    expect(ccLicense("cc0", "1.0")).toMatchObject({ license: "CC0 1.0", attributionRequired: false, commercialOk: true });
    expect(ccLicense("pdm", "1.0")).toMatchObject({ license: "Public Domain Mark 1.0", attributionRequired: false });
    expect(ccLicense("sampling+", "1.0")).toMatchObject({ commercialOk: false });
    expect(ccLicense("all-rights-reserved")).toMatchObject({ license: "unknown", commercialOk: false, modificationOk: false });
  });

  test("license URLs (Internet Archive licenseurl) parse, unknown hosts do not", () => {
    expect(licenseFromUrl("http://creativecommons.org/publicdomain/mark/1.0/")).toMatchObject({ license: "Public Domain Mark 1.0", commercialOk: true });
    expect(licenseFromUrl("https://creativecommons.org/publicdomain/zero/1.0/")).toMatchObject({ license: "CC0 1.0" });
    expect(licenseFromUrl("http://creativecommons.org/licenses/by-nc-nd/3.0/")).toMatchObject({ license: "CC BY-NC-ND 3.0", commercialOk: false, modificationOk: false });
    expect(licenseFromUrl("https://creativecommons.org/licenses/by/3.0/legalcode")).toMatchObject({ license: "CC BY 3.0", commercialOk: true });
    expect(licenseFromUrl("http://creativecommons.org/licenses/publicdomain/")).toMatchObject({ license: "Public domain" });
    expect(licenseFromUrl("https://rightsstatements.org/vocab/InC/1.0/")).toBeNull();
    expect(licenseFromUrl(null)).toBeNull();
  });

  test("Commons short names: CC, CC0, public domain, GFDL, non-free", () => {
    expect(licenseFromShortName("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0")).toMatchObject({
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      commercialOk: true,
      shareAlike: true,
    });
    expect(licenseFromShortName("CC BY-SA 3.0 de")).toMatchObject({ license: "CC BY-SA 3.0 de", commercialOk: true });
    expect(licenseFromShortName("CC0")).toMatchObject({ license: "CC0 1.0", attributionRequired: false });
    expect(licenseFromShortName("Public domain")).toMatchObject({ license: "Public domain", commercialOk: true, attributionRequired: false });
    expect(licenseFromShortName("GFDL")).toMatchObject({ commercialOk: true, attributionRequired: true });
    expect(licenseFromShortName("Fair use")).toMatchObject({ license: "Fair use", commercialOk: false, modificationOk: false });
    expect(allowsCommercialEdit(UNKNOWN_LICENSE)).toBe(false);
  });

  test("--license filters: commercial drops NC / ND, open also drops ShareAlike, any keeps all", () => {
    const pexels = { commercialOk: true, modificationOk: true, shareAlike: false };
    for (const [license, commercial, open] of [
      [ccLicense("by", "4.0"), true, true],
      [ccLicense("cc0", "1.0"), true, true],
      [licenseFromShortName("Public domain"), true, true],
      [ccLicense("by-sa", "4.0"), true, false],
      [licenseFromShortName("GFDL"), true, false],
      [ccLicense("by-nc", "4.0"), false, false],
      [ccLicense("by-nd", "4.0"), false, false],
      [pexels, true, true],
    ] as const) {
      expect(passesLicenseFilter(license, "commercial")).toBe(commercial);
      expect(passesLicenseFilter(license, "open")).toBe(open);
      expect(passesLicenseFilter(license, "any")).toBe(true);
    }
  });

  test("the attribution line names title, author, license and source", () => {
    expect(buildAttribution({ title: "NYSE floor", author: "Jane Doe", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceLabel: "Wikimedia Commons", pageUrl: "https://example.test/p" }))
      .toBe("\"NYSE floor\" by Jane Doe, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: Wikimedia Commons, https://example.test/p");
    expect(buildAttribution({ title: "X", author: null, license: "CC0 1.0", licenseUrl: null, sourceLabel: "Openverse", pageUrl: "https://example.test/x" }))
      .toBe("\"X\", CC0 1.0. Source: Openverse, https://example.test/x");
  });
});

// ─── http ────────────────────────────────────────────────────────────────────

describe("stock HTTP plumbing", () => {
  test("every request sends the one Ralphy User-Agent", async () => {
    const { fetchImpl, calls } = fixtureFetch([{ match: () => true, respond: () => jsonResponse({ ok: true }) }]);
    await stockGetJson("Test", "https://source.test/a", fetchImpl);
    expect(STOCK_USER_AGENT).toMatch(/^Ralphy\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/alecs5am\/ralphy\)$/);
    expect(calls[0]!.headers["user-agent"]).toBe(STOCK_USER_AGENT);
  });

  test("HTTP 429 becomes a StockSourceError with the Retry-After", async () => {
    const { fetchImpl } = fixtureFetch([{ match: () => true, respond: () => new Response("slow down", { status: 429, headers: { "retry-after": "42" } }) }]);
    const error = await stockGetJson("Openverse", "https://source.test/a", fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(StockSourceError);
    expect(error).toMatchObject({ status: 429, retryAfterSec: 42, source: "Openverse" });
    expect(error.message).toContain("rate-limited");
  });

  test("downloads stop at the byte cap and refuse non-HTTP URLs", async () => {
    const { fetchImpl } = fixtureFetch([{ match: () => true, respond: () => bytesResponse(new Uint8Array(2048), "image/jpeg") }]);
    await expect(stockDownload("X", "https://source.test/big.jpg", fetchImpl, { maxBytes: 1024, timeoutMs: 5000 })).rejects.toThrow(/over the 1 KB limit/);
    await expect(stockDownload("X", "file:///etc/passwd", fetchImpl, { maxBytes: 1024, timeoutMs: 5000 })).rejects.toThrow(/non-HTTP/);
    const ok = await stockDownload("X", "https://source.test/big.jpg", fetchImpl, { maxBytes: 4096, timeoutMs: 5000 });
    expect(ok.bytes.byteLength).toBe(2048);
    expect(ok.contentType).toBe("image/jpeg");
  });
});

// ─── media ───────────────────────────────────────────────────────────────────

describe("downloaded media sniffing and tree folders", () => {
  test("bytes decide the MIME and the Artifact kind", () => {
    expect(sniffStockMedia(jpegBytes("a"), "image")).toEqual({ mime: "image/jpeg", extension: ".jpg", artifactKind: "image" });
    expect(sniffStockMedia(new TextEncoder().encode(NVIDIA_SVG), "logo")).toEqual({ mime: "image/svg+xml", extension: ".svg", artifactKind: "image" });
    expect(sniffStockMedia(mp4Bytes("v"), "video")).toEqual({ mime: "video/mp4", extension: ".mp4", artifactKind: "video" });
    expect(sniffStockMedia(mp3Bytes("s"), "audio")).toEqual({ mime: "audio/mpeg", extension: ".mp3", artifactKind: "audio" });
    expect(sniffStockMedia(new TextEncoder().encode("OggS\u0000rest"), "audio")).toMatchObject({ mime: "audio/ogg", artifactKind: "audio" });
    expect(sniffStockMedia(new TextEncoder().encode("OggS\u0000rest"), "video")).toMatchObject({ mime: "video/ogg", artifactKind: "video" });
    expect(sniffStockMedia(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), "video")).toMatchObject({ mime: "video/webm" });
    expect(sniffStockMedia(new TextEncoder().encode("<!doctype html><html>login</html>"), "image")).toBeNull();
  });

  test("images and logos go to images/, video to videos/, audio to sfx/ or music/", () => {
    expect(stockFolder("image", { durationSec: null })).toBe("images");
    expect(stockFolder("video", { durationSec: 12 })).toBe("videos");
    expect(stockFolder("audio", { category: "sound_effect", durationSec: 45 })).toBe("sfx");
    expect(stockFolder("audio", { category: "music", durationSec: 12 })).toBe("music");
    expect(stockFolder("audio", { durationSec: 95 })).toBe("music");
    expect(stockFolder("audio", { durationSec: 1.2 })).toBe("sfx");
    expect(stockFolder("audio", { durationSec: null })).toBe("sfx");
  });

  test("default slots are kebab-case, stable per id and distinct per item", () => {
    expect(slugify("Philippine Stock Exchange, Inc. - 2015")).toBe("philippine-stock-exchange-inc-2015");
    expect(defaultStockSlot({ id: "simple-icons:nvidia", source: "simple-icons", title: "NVIDIA logo", kind: "logo" })).toBe("logo-nvidia");
    const a = defaultStockSlot({ id: "commons:File:Whoosh.wav", source: "commons", title: "Whoosh", kind: "audio" });
    const b = defaultStockSlot({ id: "openverse:audio:4f8775c9-9ee9-4dea-a936-c921ba8a2005", source: "openverse", title: "Whoosh", kind: "audio" });
    expect(a).toMatch(/^stock-whoosh-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    expect(defaultStockSlot({ id: "commons:File:Whoosh.wav", source: "commons", title: "Whoosh", kind: "audio" })).toBe(a);
  });
});

// ─── openverse ───────────────────────────────────────────────────────────────

describe("openverse connector", () => {
  test("parses image results and asks for commercial + modification licenses server-side", async () => {
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.pathname === "/v1/images/", respond: () => jsonResponse(stockFixture("openverse-images.json")) },
    ]);
    const found = await openverseConnector.search(request({ orientation: "vertical" }), fetchImpl);
    const url = new URL(calls[0]!.url);
    expect(url.host).toBe("api.openverse.org");
    expect(url.searchParams.get("license_type")).toBe("commercial,modification");
    expect(url.searchParams.get("aspect_ratio")).toBe("tall");
    expect(Number(url.searchParams.get("page_size"))).toBeLessThanOrEqual(20);
    expect(found).toHaveLength(3);
    expect(found[0]).toMatchObject({
      id: "openverse:image:1c5442f6-6bb6-4ab7-b603-f598e7579dd2",
      source: "openverse",
      kind: "image",
      title: "Cat Fish 2",
      pageUrl: "https://www.flickr.com/photos/32426194@N00/3481540500",
      mediaUrl: "https://live.staticflickr.com/3313/3481540500_c846c62863_b.jpg",
      previewUrl: "https://api.openverse.org/v1/images/1c5442f6-6bb6-4ab7-b603-f598e7579dd2/thumb/",
      width: 716,
      height: 1024,
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      author: "admiller",
      commercialOk: true,
      attributionRequired: true,
      attribution: "\"Cat Fish 2\" by admiller, CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/). Source: Flickr via Openverse, https://www.flickr.com/photos/32426194@N00/3481540500",
    });
    expect(found[1]).toMatchObject({ license: "CC BY-NC 2.0", commercialOk: false });
    expect(found[2]).toMatchObject({ license: "CC0 1.0", attributionRequired: false, author: null });
  });

  test("--license open asks for public domain, CC0 and CC BY only", async () => {
    const { fetchImpl, calls } = fixtureFetch([{ match: () => true, respond: () => jsonResponse({ results: [] }) }]);
    await openverseConnector.search(request({ license: "open" }), fetchImpl);
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("license")).toBe("by,cc0,pdm");
    expect(url.searchParams.get("license_type")).toBeNull();
    await openverseConnector.search(request({ license: "any" }), fetchImpl);
    const anyUrl = new URL(calls[1]!.url);
    expect(anyUrl.searchParams.get("license")).toBeNull();
    expect(anyUrl.searchParams.get("license_type")).toBeNull();
  });

  test("audio results carry duration in seconds and the category", async () => {
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.pathname === "/v1/audio/", respond: () => jsonResponse(stockFixture("openverse-audio.json")) },
    ]);
    const found = await openverseConnector.search(request({ kind: "audio", query: "whoosh" }), fetchImpl);
    expect(new URL(calls[0]!.url).searchParams.get("aspect_ratio")).toBeNull();
    expect(found.map((c) => [c.id.split(":")[1], c.durationSec, c.extra.category, c.mime])).toEqual([
      ["audio", 1.2, "sound_effect", "audio/mpeg"],
      ["audio", 95, "music", "audio/mpeg"],
      ["audio", 0.8, "sound_effect", "audio/mpeg"],
    ]);
    expect(found[2]).toMatchObject({ license: "CC Sampling+ 1.0", commercialOk: false });
  });

  test("ids round-trip through lookup", async () => {
    const item = stockFixture("openverse-images.json").results[0];
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.pathname === `/v1/images/${item.id}/`, respond: () => jsonResponse(item) },
    ]);
    const id = "openverse:image:1c5442f6-6bb6-4ab7-b603-f598e7579dd2";
    expect(parseOpenverseId(id)).toEqual({ mediaType: "image", uuid: item.id });
    expect(parseOpenverseId(`openverse:${item.id}`)).toEqual({ mediaType: null, uuid: item.id });
    expect(parseOpenverseId("openverse:image:not-a-uuid")).toBeNull();
    expect((await openverseConnector.lookup(id, fetchImpl)).id).toBe(id);
    // The short form tries images first.
    expect((await openverseConnector.lookup(`openverse:${item.id}`, fetchImpl)).id).toBe(id);
    expect(calls).toHaveLength(2);
  });
});

// ─── commons ─────────────────────────────────────────────────────────────────

describe("wikimedia commons connector", () => {
  test("image search: rank order, extmetadata license and author, TIFF via render, non-free kept but flagged", async () => {
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.host === "commons.wikimedia.org", respond: () => jsonResponse(stockFixture("commons-search-image.json")) },
    ]);
    const found = await commonsConnector.search(request({ query: "stock exchange" }), fetchImpl);
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("gsrsearch")).toBe("stock exchange filetype:bitmap");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(url.searchParams.get("prop")).toBe("imageinfo");
    expect(found.map((c) => c.id)).toEqual([
      "commons:File:Stock_certificate_1910.tif",
      "commons:File:NYSE_trading_floor.jpg",
      "commons:File:Company_album_cover.jpg",
    ]);
    const [tiff, jpg, nonFree] = found;
    // Not a browser image: the 1920 px render is downloaded instead.
    expect(tiff).toMatchObject({ mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Stock_certificate_1910.tif/lossy-page1-1920px-Stock_certificate_1910.tif.jpg", width: 1920, height: 1280, license: "Public domain", attributionRequired: false });
    expect(jpg).toMatchObject({
      title: "NYSE trading floor",
      mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/NYSE_trading_floor.jpg",
      previewUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/NYSE_trading_floor.jpg/500px-NYSE_trading_floor.jpg",
      author: "Jane Doe",
      authorUrl: "https://commons.wikimedia.org/wiki/User:Jane_Doe",
      license: "CC BY-SA 4.0",
      commercialOk: true,
      attributionRequired: true,
      shareAlike: true,
    });
    expect(jpg!.notes.some((n) => n.includes("identifiable person"))).toBe(true);
    expect(nonFree).toMatchObject({ commercialOk: false, modificationOk: false });
  });

  test("relevance: a page matching only part of the query outside its title is dropped", async () => {
    // The aurora photo mentions "exchange" in its description but not "stock".
    const { fetchImpl } = fixtureFetch([
      { match: (u) => u.host === "commons.wikimedia.org", respond: () => jsonResponse(stockFixture("commons-search-image.json")) },
    ]);
    const found = await commonsConnector.search(request({ query: "stock exchange" }), fetchImpl);
    expect(found.map((c) => c.id)).not.toContain("commons:File:Aurora_borealis_over_Tromso.jpg");
    expect(commonsQueryTerms("Supercomputer in a data center logo")).toEqual(["supercomputer", "data", "center"]);
    const page = (title: string, description = "") => ({ title, imageinfo: [{ extmetadata: { ImageDescription: { value: description } } }] });
    const terms = commonsQueryTerms("supercomputer data center");
    expect(commonsRelevance(page("File:Frontier supercomputer.jpg"), terms)).toEqual({ score: 3, keep: true });
    expect(commonsRelevance(page("File:Aurora borealis.jpg", "Northern lights near a data center"), terms)).toEqual({ score: 2, keep: false });
    expect(commonsRelevance(page("File:IMG_0042.jpg", "A supercomputer in the data centers hall"), terms)).toEqual({ score: 3, keep: true });
    // Word-start matching: "data" is not found inside "update".
    expect(commonsRelevance(page("File:Software update.png"), commonsQueryTerms("data"))).toEqual({ score: 0, keep: false });
  });

  test("video search picks the best transcode at most 1080 lines and drops Theora-only files", async () => {
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.host === "commons.wikimedia.org", respond: () => jsonResponse(stockFixture("commons-search-video.json")) },
    ]);
    const found = await commonsConnector.search(request({ kind: "video" }), fetchImpl);
    expect(new URL(calls[0]!.url).searchParams.get("prop")).toBe("videoinfo");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "video",
      mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/2/20/Philippine_Stock_Exchange_bell_ringing.webm",
      mime: "video/webm",
      width: 1920,
      height: 1080,
      durationSec: 344.6,
    });
  });

  test("logo search adds 'logo' and filters SVG drawings; ids round-trip through lookup", async () => {
    const lookup = stockFixture("commons-lookup-logo.json");
    const { fetchImpl, calls } = fixtureFetch([
      { match: (u) => u.searchParams.has("gsrsearch"), respond: () => jsonResponse({ query: { pages: [{ ...lookup.query.pages[0], index: 1 }] } }) },
      { match: (u) => u.searchParams.get("titles") === "File:Nvidia logo.svg", respond: () => jsonResponse(lookup) },
    ]);
    const [found] = await commonsConnector.search(request({ kind: "logo", query: "nvidia" }), fetchImpl);
    expect(new URL(calls[0]!.url).searchParams.get("gsrsearch")).toBe("nvidia logo filetype:drawing");
    expect(found).toMatchObject({ id: "commons:File:Nvidia_logo.svg", kind: "logo", mime: "image/svg+xml", license: "Public domain", author: "Nvidia" });
    expect(found!.notes.some((n) => n.startsWith("Trademarked"))).toBe(true);
    expect(commonsId("File:Nvidia logo.svg")).toBe("commons:File:Nvidia_logo.svg");
    expect(parseCommonsId("commons:File:Nvidia_logo.svg")).toBe("File:Nvidia logo.svg");
    expect(parseCommonsId("commons:Category:Logos")).toBeNull();
    const again = await commonsConnector.lookup(found!.id, fetchImpl);
    expect(again).toMatchObject({ id: found!.id, kind: "image", mediaUrl: "https://upload.wikimedia.org/wikipedia/commons/2/21/Nvidia_logo.svg" });
  });
});

// ─── internet archive ────────────────────────────────────────────────────────

describe("internet archive connector", () => {
  const files = stockFixture("archive-files.json");
  const routes = () => fixtureFetch([
    { match: (u) => u.pathname === "/advancedsearch.php", respond: () => jsonResponse(stockFixture("archive-search.json")) },
    { match: (u) => u.pathname.startsWith("/metadata/") && u.pathname.endsWith("/files"), respond: (u) => jsonResponse(files[u.pathname.split("/")[2]!] ?? { result: [] }) },
    {
      match: (u) => u.pathname === "/metadata/capf2022",
      respond: () => jsonResponse({ metadata: { identifier: "capf2022", title: "CAPF 2022", licenseurl: "https://creativecommons.org/licenses/by-sa/4.0/" }, files: files.capf2022.result }),
    },
    {
      match: (u) => u.pathname === "/metadata/EurUsd",
      respond: () => jsonResponse({ metadata: { identifier: "EurUsd", licenseurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/" }, files: [] }),
    },
  ]);

  test("the server query excludes NC / ND without slash wildcards", () => {
    const q = archiveQuery("stock exchange (NYSE)/floor");
    expect(q).toStartWith("(stock exchange NYSE floor) AND mediatype:(movies)");
    expect(q).toContain("NOT licenseurl:*nc*");
    expect(q).toContain("NOT licenseurl:*nd*");
    expect(q.split("licenseurl:").slice(1).every((clause) => !clause.split(" ")[0]!.includes("/"))).toBe(true);
  });

  test("keeps only public domain and commercial + modification CC items with an MP4", async () => {
    const { fetchImpl, calls } = routes();
    const found = await archiveConnector.search(request({ kind: "video", limit: 5, license: "any" }), fetchImpl);
    // NC-ND and unlicensed docs never cost a metadata request.
    expect(calls.filter((c) => c.url.includes("/metadata/")).map((c) => new URL(c.url).pathname.split("/")[2])).toEqual([
      "youtube-7dqZ2-X6TQA",
      "capf2022",
      "prelinger-wall-street",
    ]);
    expect(found.map((c) => c.id)).toEqual(["archive:youtube-7dqZ2-X6TQA", "archive:capf2022"]);
    expect(found[0]).toMatchObject({
      title: "Stock exchange explained",
      author: "Example Channel",
      mediaUrl: "https://archive.org/download/youtube-7dqZ2-X6TQA/7dqZ2-X6TQA.mp4",
      previewUrl: "https://archive.org/services/img/youtube-7dqZ2-X6TQA",
      pageUrl: "https://archive.org/details/youtube-7dqZ2-X6TQA",
      width: 854,
      height: 480,
      durationSec: 1161.8,
      license: "CC BY 3.0",
      commercialOk: true,
    });
    expect(found[1]).toMatchObject({ mediaUrl: "https://archive.org/download/capf2022/mp4/FR-CAPF2022.mp4", height: 1080, durationSec: 5807.4, license: "CC BY-SA 4.0" });
  });

  test("the MP4 pick prefers the largest at most 1080 lines", () => {
    expect(pickArchiveMp4(files.capf2022.result)?.name).toBe("mp4/FR-CAPF2022.mp4");
    expect(pickArchiveMp4(files["prelinger-wall-street"].result)).toBeNull();
  });

  test("ids round-trip through lookup; a non-commercial item is refused", async () => {
    const { fetchImpl } = routes();
    expect(parseArchiveId("archive:capf2022")).toBe("capf2022");
    expect(parseArchiveId("archive:../etc")).toBeNull();
    expect((await archiveConnector.lookup("archive:capf2022", fetchImpl)).id).toBe("archive:capf2022");
    await expect(archiveConnector.lookup("archive:EurUsd", fetchImpl)).rejects.toThrow(/no public domain or commercial-use/);
  });
});

// ─── simple icons ────────────────────────────────────────────────────────────

describe("simple icons connector", () => {
  const data = stockFixture("simple-icons.json");
  const routes = () => fixtureFetch([
    { match: (u) => u.pathname.endsWith("/data/simple-icons.json"), respond: () => jsonResponse(data) },
    { match: (u) => u.pathname.endsWith("/icons/nvidia.svg"), respond: () => bytesResponse(NVIDIA_SVG, "image/svg+xml") },
  ]);

  test("titleToSlug matches the package's own slugs", () => {
    expect(titleToSlug("NVIDIA")).toBe("nvidia");
    expect(titleToSlug(".NET")).toBe("dotnet");
    expect(titleToSlug("C++")).toBe("cplusplus");
    expect(titleToSlug("AT&T")).toBe("atandt");
    expect(titleToSlug("Citro\u00ebn")).toBe("citroen");
  });

  test("search reads the pinned package data and ranks exact matches first", async () => {
    const { fetchImpl, calls } = routes();
    const found = await simpleIconsConnector.search(request({ kind: "logo", query: "nvidia" }), fetchImpl);
    expect(calls[0]!.url).toBe(`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/data/simple-icons.json`);
    expect(found.map((c) => c.id)).toEqual(["simple-icons:nvidia", "simple-icons:nvidiashield"]);
    expect(found[0]).toMatchObject({
      kind: "logo",
      title: "NVIDIA logo",
      mediaUrl: `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/nvidia.svg`,
      mime: "image/svg+xml",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      commercialOk: true,
      attributionRequired: false,
      extra: { hex: "#76B900" },
    });
    expect(found[0]!.license).toContain("trademark");
    expect(found[0]!.notes.some((n) => n.includes("Brand guidelines"))).toBe(true);
    // The data is fetched once per process.
    await simpleIconsConnector.search(request({ kind: "logo", query: "visa" }), fetchImpl);
    expect(calls).toHaveLength(1);
  });

  test("aliases and a brand-stated license are honored", async () => {
    const { fetchImpl } = routes();
    const [att] = await simpleIconsConnector.search(request({ kind: "logo", query: "American Telephone and Telegraph" }), fetchImpl);
    expect(att?.id).toBe("simple-icons:atandt");
    const [visa] = await simpleIconsConnector.search(request({ kind: "logo", query: "visa" }), fetchImpl);
    expect(visa!.notes.some((n) => n.includes("custom"))).toBe(true);
    expect(scoreIcon({ title: "Robinhood", slug: "robinhood" }, "zzz")).toBe(0);
  });

  test("download writes the SVG with the brand hex fill; ids round-trip", async () => {
    const { fetchImpl } = routes();
    const candidate = await simpleIconsConnector.lookup("simple-icons:nvidia", fetchImpl);
    expect(candidate.id).toBe("simple-icons:nvidia");
    const file = await simpleIconsConnector.download!(candidate, fetchImpl, { maxBytes: 100_000, timeoutMs: 5000 });
    const svg = new TextDecoder().decode(file.bytes);
    expect(svg).toStartWith('<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#76B900">');
    expect(withBrandFill('<svg fill="red"><path/></svg>', "#000000")).toBe('<svg fill="red"><path/></svg>');
    await expect(simpleIconsConnector.lookup("simple-icons:nope", fetchImpl)).rejects.toThrow(/no icon 'nope'/);
  });
});

// ─── pexels ──────────────────────────────────────────────────────────────────

describe("pexels connector", () => {
  const routes = () => fixtureFetch([
    { match: (u) => u.pathname === "/v1/search", respond: () => jsonResponse(stockFixture("pexels-photos.json")) },
    { match: (u) => u.pathname === "/videos/search", respond: () => jsonResponse(stockFixture("pexels-videos.json")) },
    { match: (u) => u.pathname === "/v1/photos/6801648", respond: () => jsonResponse(stockFixture("pexels-photos.json").photos[0]) },
    { match: (u) => u.pathname === "/videos/videos/7579577", respond: () => jsonResponse(stockFixture("pexels-videos.json").videos[0]) },
  ]);

  test("without PEXELS_API_KEY the source is skipped with a note and never called", async () => {
    const { fetchImpl, calls } = routes();
    expect(pexelsConnector.unavailableNote()).toContain("PEXELS_API_KEY is not set");
    const result = await searchStock({ query: "stock market", kind: "image", sources: ["pexels"], limit: 5, orientation: "any", license: "commercial", fetchImpl });
    expect(result).toMatchObject({ count: 0, sources: [{ source: "pexels", status: "skipped" }] });
    expect(result.notes[0]).toStartWith("pexels skipped: PEXELS_API_KEY is not set");
    expect(calls).toHaveLength(0);
  });

  test("with a key: photos and video parse, the key goes in Authorization, ids round-trip", async () => {
    setCredentialTestSource((providerId) => (providerId === "pexels" ? "test-pexels-key" : null));
    const { fetchImpl, calls } = routes();
    const photos = await pexelsConnector.search(request({ orientation: "vertical" }), fetchImpl);
    expect(calls[0]!.headers.authorization).toBe("test-pexels-key");
    expect(new URL(calls[0]!.url).searchParams.get("orientation")).toBe("portrait");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      id: "pexels:photo:6801648",
      kind: "image",
      title: "Stock market chart on a phone screen",
      mediaUrl: "https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg",
      author: "Tima Miroshnichenko",
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      commercialOk: true,
      attributionRequired: false,
      attribution: "Photo by Tima Miroshnichenko on Pexels: https://www.pexels.com/photo/stock-market-chart-on-a-phone-6801648/",
    });
    const videos = await pexelsConnector.search(request({ kind: "video" }), fetchImpl);
    expect(videos[0]).toMatchObject({
      id: "pexels:video:7579577",
      title: "Trader looking at charts",
      mediaUrl: "https://videos.pexels.com/video-files/7579577/7579577-hd_1080_1920_25fps.mp4",
      width: 1080,
      height: 1920,
      durationSec: 14,
    });
    expect(pickPexelsFile([{ file_type: "video/mp4", width: 3840, height: 2160, link: "https://x.test/4k.mp4" }])?.link).toBe("https://x.test/4k.mp4");
    expect((await pexelsConnector.lookup("pexels:photo:6801648", fetchImpl)).id).toBe("pexels:photo:6801648");
    expect((await pexelsConnector.lookup("pexels:video:7579577", fetchImpl)).id).toBe("pexels:video:7579577");
  });
});

// ─── search orchestration ────────────────────────────────────────────────────

describe("stock search", () => {
  const candidate = (id: string, over: Partial<StockCandidate> = {}): StockCandidate => ({
    id, source: "commons", kind: "image", title: id, pageUrl: "https://x.test", mediaUrl: "https://x.test/f.jpg", previewUrl: null,
    mime: null, width: null, height: null, durationSec: null, author: null, authorUrl: null, license: "CC0 1.0", licenseUrl: null,
    commercialOk: true, modificationOk: true, attributionRequired: false, shareAlike: false, attribution: "", notes: [], extra: {}, ...over,
  });

  test("the default commercial filter drops NC / ND; --license any keeps them", async () => {
    const routes = () => fixtureFetch([{ match: () => true, respond: () => jsonResponse(stockFixture("openverse-images.json")) }]);
    const strict = await searchStock({ query: "cat", kind: "image", sources: ["openverse"], limit: 10, orientation: "any", license: "commercial", fetchImpl: routes().fetchImpl });
    expect(strict.candidates.map((c) => c.license)).toEqual(["CC BY 2.0", "CC0 1.0"]);
    expect(strict.sources).toEqual([{ source: "openverse", status: "ok", returned: 3, kept: 2 }]);
    const any = await searchStock({ query: "cat", kind: "image", sources: ["openverse"], limit: 10, orientation: "any", license: "any", fetchImpl: routes().fetchImpl });
    expect(any.count).toBe(3);
  });

  test("results interleave across sources; orientation filters known frames only", () => {
    const merged = interleave([[candidate("a1"), candidate("a2"), candidate("a3")], [candidate("b1")], [candidate("a1"), candidate("c2")]], 5);
    expect(merged.map((c) => c.id)).toEqual(["a1", "b1", "a2", "c2", "a3"]);
    expect(matchesOrientation(candidate("v", { width: 1080, height: 1920 }), "vertical")).toBe(true);
    expect(matchesOrientation(candidate("h", { width: 1920, height: 1080 }), "vertical")).toBe(false);
    expect(matchesOrientation(candidate("u"), "horizontal")).toBe(true);
  });

  test("one failing source is reported; all failing raises the first error (429 stays a 429)", async () => {
    const { fetchImpl } = fixtureFetch([
      { match: (u) => u.host === "api.openverse.org", respond: () => new Response("", { status: 429, headers: { "retry-after": "30" } }) },
      { match: (u) => u.host === "commons.wikimedia.org", respond: () => jsonResponse(stockFixture("commons-search-image.json")) },
    ]);
    const partial = await searchStock({ query: "x", kind: "image", sources: ["openverse", "commons"], limit: 10, orientation: "any", license: "commercial", fetchImpl });
    expect(partial.sources.map((s) => [s.source, s.status])).toEqual([["openverse", "error"], ["commons", "ok"]]);
    // A one-letter query has no relevance terms: the 3 commercial-use Commons files all stay.
    expect(partial.count).toBe(3);
    const error = await searchStock({ query: "x", kind: "image", sources: ["openverse"], limit: 10, orientation: "any", license: "commercial", fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(StockSourceError);
    expect(error).toMatchObject({ status: 429, retryAfterSec: 30 });
  });

  test("a source that never answers misses its deadline and is aborted; the others still answer", async () => {
    let hungRequestAborted = false;
    const { fetchImpl } = fixtureFetch([
      { match: (u) => u.host === "api.openverse.org", respond: () => new Promise<Response>(() => undefined) },
      { match: (u) => u.host === "commons.wikimedia.org", respond: () => jsonResponse(stockFixture("commons-search-image.json")) },
    ]);
    const watched: typeof fetchImpl = (url, init) => {
      init?.signal?.addEventListener("abort", () => {
        if (url.includes("openverse")) hungRequestAborted = true;
      });
      return fetchImpl(url, init);
    };
    const started = Date.now();
    const result = await searchStock({ query: "stock exchange", kind: "image", sources: ["openverse", "commons"], limit: 10, orientation: "any", license: "commercial", fetchImpl: watched, timeoutMs: 60 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hungRequestAborted).toBe(true);
    expect(result.sources[0]).toMatchObject({ source: "openverse", status: "error" });
    expect(result.sources[0]!.note).toContain("no answer within");
    expect(result.sources[1]).toMatchObject({ source: "commons", status: "ok" });
    expect(result.count).toBeGreaterThan(0);
    // Every source timing out is an error the command maps (status 0 -> E_PROVIDER_UNAVAILABLE).
    const error = await searchStock({ query: "x", kind: "image", sources: ["openverse"], limit: 5, orientation: "any", license: "commercial", fetchImpl: watched, timeoutMs: 30 }).catch((e) => e);
    expect(error).toBeInstanceOf(StockSourceError);
    expect(error.message).toContain("no answer within");
  });

  test("--license open drops ShareAlike items from the results", async () => {
    const { fetchImpl } = fixtureFetch([{ match: () => true, respond: () => jsonResponse(stockFixture("commons-search-image.json")) }]);
    const commercial = await searchStock({ query: "stock exchange", kind: "image", sources: ["commons"], limit: 10, orientation: "any", license: "commercial", fetchImpl });
    const open = await searchStock({ query: "stock exchange", kind: "image", sources: ["commons"], limit: 10, orientation: "any", license: "open", fetchImpl });
    expect(commercial.candidates.map((c) => c.license)).toContain("CC BY-SA 4.0");
    expect(open.candidates.map((c) => c.license)).toEqual(["Public domain"]);
    expect(open.license).toBe("open");
  });

  test("a source that does not serve the kind is an input error; ids name their source", async () => {
    const { fetchImpl } = fixtureFetch([]);
    const error = await searchStock({ query: "x", kind: "audio", sources: ["archive"], limit: 5, orientation: "any", license: "commercial", fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("E_INPUT_INVALID");
    expect(stockSourceOf("simple-icons:nvidia")).toBe("simple-icons");
    expect(stockSourceOf("commons:File:X.jpg")).toBe("commons");
    expect(stockSourceOf("flickr:123")).toBeNull();
  });
});
