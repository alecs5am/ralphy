// Pure-parser coverage for cli/lib/meme-sites.ts (no network).
// Fixtures mirror the real WP REST / page markup observed on the two sites.

import { describe, expect, test } from "bun:test";
import {
  decodeEntities,
  extractDriveUrl,
  extractMediaUrls,
  pickAttachment,
  parseTrendingPage,
  parseMemeRef,
} from "../../cli/lib/meme-sites.js";
import { buildChromaKeyFilter } from "../../cli/lib/ffmpeg-recipes.js";

const SOUND_CONTENT = `<ul class="wpuf_customs"><li><label>Upload Sound:</label>
<a href="https://media.memesoundeffects.com/2026/07/ya-vadalas.mp3">ya-vadalas</a></li></ul>
<audio class="mse-audio" preload="none">
<source src="https://media.memesoundeffects.com/2026/07/ya-vadalas.mp3" type="audio/mpeg"></audio>`;

describe("extractMediaUrls", () => {
  test("pulls the mp3 out of WP content.rendered and dedupes", () => {
    const urls = extractMediaUrls(SOUND_CONTENT, "media.memesoundeffects.com");
    expect(urls).toEqual(["https://media.memesoundeffects.com/2026/07/ya-vadalas.mp3"]);
  });

  test("ignores other hosts and non-media links", () => {
    const html = `<a href="https://memesoundeffects.com/ya-vadalas/">page</a>
      <a href="https://evil.example.com/x.mp3">nope</a>`;
    expect(extractMediaUrls(html, "media.memesoundeffects.com")).toEqual([]);
  });
});

describe("pickAttachment", () => {
  test("prefers the HD file over the -1 4K variant, skips thumbnails", () => {
    const picked = pickAttachment([
      { mime_type: "image/webp", source_url: "https://greenscreenmemes.com/wp-content/uploads/thumb.webp" },
      { mime_type: "video/mp4", source_url: "https://media.greenscreenmemes.com/2026/07/Clip-1.mp4" },
      { mime_type: "video/mp4", source_url: "https://media.greenscreenmemes.com/2026/07/Clip.mp4", media_details: { length: 13, width: 1080, height: 1920 } },
    ], "video");
    expect(picked?.source_url).toBe("https://media.greenscreenmemes.com/2026/07/Clip.mp4");
  });

  test("falls back to the 4K variant when it is the only video", () => {
    const picked = pickAttachment([
      { mime_type: "video/mp4", source_url: "https://media.greenscreenmemes.com/2026/07/Clip-1.mp4" },
    ], "video");
    expect(picked?.source_url).toBe("https://media.greenscreenmemes.com/2026/07/Clip-1.mp4");
  });

  test("picks the audio attachment for sounds (pre-2023 posts have empty content)", () => {
    const picked = pickAttachment([
      { mime_type: "image/svg+xml", source_url: "https://memesoundeffects.com/wp-content/uploads/2021/01/Website-SVG-4.svg" },
      { mime_type: "audio/mpeg", source_url: "https://media.memesoundeffects.com/2021/01/Perfect-Street-Fighter-Sound-Effect.mp3" },
    ], "audio");
    expect(picked?.source_url).toBe("https://media.memesoundeffects.com/2021/01/Perfect-Street-Fighter-Sound-Effect.mp3");
  });

  test("returns null when there is no attachment of the wanted kind", () => {
    expect(pickAttachment([{ mime_type: "image/webp", source_url: "https://x/y.webp" }], "video")).toBeNull();
  });
});

describe("parseTrendingPage", () => {
  test("maps media anchors to hits with filename-derived slugs/titles", () => {
    const html = `${SOUND_CONTENT}
      <a href="https://media.memesoundeffects.com/2023/08/nope-sound-effect.mp3">Download</a>`;
    const hits = parseTrendingPage(html, "sounds");
    expect(hits.map((h) => h.slug)).toEqual(["ya-vadalas", "nope-sound-effect"]);
    expect(hits[1].title).toBe("nope sound effect");
    expect(hits[1].mediaUrl).toBe("https://media.memesoundeffects.com/2023/08/nope-sound-effect.mp3");
    expect(hits[1].source).toBe("sounds");
  });
});

describe("parseMemeRef", () => {
  test("short form", () => {
    expect(parseMemeRef("sounds/nope-meme")).toEqual({ source: "sounds", slug: "nope-meme" });
  });
  test("page URL", () => {
    expect(parseMemeRef("https://greenscreenmemes.com/haaland-brazilian-dance-green-screen/")).toEqual({
      source: "greenscreen",
      slug: "haaland-brazilian-dance-green-screen",
    });
  });
  test("direct media URL", () => {
    expect(parseMemeRef("https://media.memesoundeffects.com/2026/07/ya-vadalas.mp3")).toEqual({
      source: "sounds",
      mediaUrl: "https://media.memesoundeffects.com/2026/07/ya-vadalas.mp3",
    });
  });
  test("unrelated input", () => {
    expect(parseMemeRef("https://example.com/whatever")).toBeNull();
    expect(parseMemeRef("not-a-ref")).toBeNull();
  });
});

describe("extractDriveUrl", () => {
  test("finds the Drive uc download link and unescapes the amp entity", () => {
    const html = `<a class="elementor-button" href="https://drive.google.com/uc?id=1u5LvLSiFtcm1lRWp_knpVgUDElfQQI7w&#038;export=download" target="_blank">`;
    expect(extractDriveUrl(html)).toBe("https://drive.google.com/uc?id=1u5LvLSiFtcm1lRWp_knpVgUDElfQQI7w&export=download");
  });
  test("null when absent", () => {
    expect(extractDriveUrl("<p>no drive here</p>")).toBeNull();
  });
});

describe("decodeEntities", () => {
  test("named + numeric entities", () => {
    expect(decodeEntities("Tom &amp; Jerry&#8217;s &quot;NOPE&quot;")).toBe(`Tom & Jerry’s "NOPE"`);
  });
});

describe("buildChromaKeyFilter", () => {
  test("soft key + despill + alpha pixel format", () => {
    expect(buildChromaKeyFilter({ color: "0x00b140", similarity: 0.24, blend: 0.08 })).toBe(
      "chromakey=0x00b140:0.24:0.08,despill=type=green,format=yuva420p",
    );
  });
});
