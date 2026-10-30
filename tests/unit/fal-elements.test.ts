// #592 — Kling O3 `elements` on the fal connector (`--element`).
//
// fal schema (KlingV3ComboElementInput, fetched 2026-10-30): an element is
// `{ frontal_image_url, reference_image_urls: 1-3 extra angles }`, referenced as
// @Element1, @Element2, … in the prompt. No live call: fetch is mocked.

import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  buildFalVideoBody,
  falModelAcceptsElements,
  generateVideo,
  parseElementFlag,
} from "../../cli/lib/providers/fal.js";
import { TerminalProviderError } from "../../cli/lib/providers/shared.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const KLING_O3 = "fal-ai/kling-video/o3/pro/reference-to-video";
const SEEDANCE_R2V = "bytedance/seedance-2.0/reference-to-video";

const originalFetch = globalThis.fetch;
const originalKey = process.env.FAL_KEY;
let tmp: TmpRoot | undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = originalKey;
  tmp?.cleanup();
  tmp = undefined;
});

describe("parseElementFlag", () => {
  test("first image is the frontal view, the rest are extra angles", () => {
    expect(parseElementFlag("front.png, left.png ,right.png")).toEqual({
      frontal: "front.png",
      references: ["left.png", "right.png"],
    });
    expect(parseElementFlag("a.png,b.png,c.png,d.png").references).toHaveLength(3);
  });

  test("an element needs 2-4 images", () => {
    expect(() => parseElementFlag("only.png")).toThrow(/2-4/);
    expect(() => parseElementFlag("a,b,c,d,e")).toThrow(/got 5/);
    expect(() => parseElementFlag(" , ")).toThrow(/got 0/);
  });
});

describe("buildFalVideoBody", () => {
  test("Kling O3 maps elements and refs to their fal fields", () => {
    const body = buildFalVideoBody(KLING_O3, {
      prompt: "@Element1 waves at @Element2 in the style of @Image1",
      durationSec: 5.4,
      aspectRatio: "9:16",
      resolution: "720p",
      generateAudio: false,
      imageUrls: ["https://cdn/style.png"],
      startImageUrl: "https://cdn/first.png",
      elements: [
        { frontal: "https://cdn/a-front.png", references: ["https://cdn/a-left.png"] },
        { frontal: "https://cdn/b-front.png", references: ["https://cdn/b-left.png", "https://cdn/b-back.png"] },
      ],
    });
    expect(body).toEqual({
      prompt: "@Element1 waves at @Element2 in the style of @Image1",
      duration: "5",
      aspect_ratio: "9:16",
      generate_audio: false,
      resolution: "720p",
      image_urls: ["https://cdn/style.png"],
      start_image_url: "https://cdn/first.png",
      elements: [
        { frontal_image_url: "https://cdn/a-front.png", reference_image_urls: ["https://cdn/a-left.png"] },
        { frontal_image_url: "https://cdn/b-front.png", reference_image_urls: ["https://cdn/b-left.png", "https://cdn/b-back.png"] },
      ],
    });
  });

  test("no elements → no elements key; seedance r2v refuses elements", () => {
    const base = { prompt: "p", durationSec: 5, aspectRatio: "9:16", resolution: "720p", generateAudio: false };
    expect("elements" in buildFalVideoBody(KLING_O3, base)).toBe(false);
    expect(() =>
      buildFalVideoBody(SEEDANCE_R2V, { ...base, elements: [{ frontal: "a.png", references: ["b.png"] }] }),
    ).toThrow(TerminalProviderError);
    expect(falModelAcceptsElements(KLING_O3)).toBe(true);
    expect(falModelAcceptsElements(SEEDANCE_R2V)).toBe(false);
    expect(falModelAcceptsElements("kwaivgi/kling-v3.0-pro")).toBe(false);
  });
});

describe("generateVideo with elements (mocked fal)", () => {
  function seedImages(names: string[]): string[] {
    return names.map((n) => {
      const p = path.join(tmp!.dir, n);
      fs.writeFileSync(p, "png");
      return p;
    });
  }

  test("uploads each element image and submits the elements body", async () => {
    tmp = makeTmpRoot("ralphy-fal-elements");
    process.env.FAL_KEY = "fixture-fal-key";
    const [front, left, right] = seedImages(["front.png", "left.png", "right.png"]);
    let uploads = 0;
    let submitted: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/storage/upload/initiate")) {
        uploads += 1;
        return Response.json({ upload_url: `https://upload.test/${uploads}`, file_url: `https://cdn.test/file-${uploads}.png` });
      }
      if (u.startsWith("https://upload.test/")) return new Response("", { status: 200 });
      if (u.endsWith(`/${KLING_O3}`) && init?.method === "POST") {
        submitted = JSON.parse(String(init.body));
        return Response.json({ request_id: "req-1", status_url: "https://queue.test/status", response_url: "https://queue.test/result" });
      }
      if (u === "https://queue.test/status") return Response.json({ status: "COMPLETED", response_url: "https://queue.test/result" });
      if (u === "https://queue.test/result") return Response.json({ video: { url: "https://cdn.test/out.mp4" } });
      if (u === "https://cdn.test/out.mp4") return new Response("mp4-bytes");
      return new Response("unexpected " + u, { status: 500 });
    }) as typeof fetch;

    const result = await generateVideo({
      runId: "el", outputPath: path.join(tmp.dir, ".ralphy/tmp/el/scene-01-vid.mp4"),
      slot: "scene-01-vid", prompt: "@Element1 turns to camera", model: KLING_O3,
      durationSec: 5, aspectRatio: "9:16", pollIntervalMs: 0, noRetry: true,
      elements: [{ frontal: front!, references: [left!, right!] }],
    });

    expect(uploads).toBe(3);
    expect(submitted!.elements).toEqual([
      { frontal_image_url: "https://cdn.test/file-1.png", reference_image_urls: ["https://cdn.test/file-2.png", "https://cdn.test/file-3.png"] },
    ]);
    expect(submitted!.image_urls).toBeUndefined();
    expect(fs.readFileSync(result.localPath, "utf8")).toBe("mp4-bytes");
  });

  test("elements on a model without them refuse before any network call", async () => {
    tmp = makeTmpRoot("ralphy-fal-elements-refuse");
    process.env.FAL_KEY = "fixture-fal-key";
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response(""); }) as typeof fetch;
    const [a, b] = seedImages(["a.png", "b.png"]);
    await expect(generateVideo({
      runId: "el", outputPath: path.join(tmp.dir, ".ralphy/tmp/el/x.mp4"),
      slot: "x", prompt: "p", model: SEEDANCE_R2V, durationSec: 5,
      elements: [{ frontal: a!, references: [b!] }],
    })).rejects.toThrow(/does not accept Kling elements/);
    expect(calls).toBe(0);
  });
});
