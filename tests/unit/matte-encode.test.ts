// Alpha output naming, versioning and encode arguments (issue #560).

import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  alphaEncodeArgs,
  defaultMatteOut,
  formatFromOut,
  isImagePath,
  nextFreeFile,
  rgbToOutputTail,
  subjectMergeGraph,
  VP9_CRF,
} from "../../cli/lib/matte/encode.js";

describe("nextFreeFile (append-only)", () => {
  test("free name is used as is", () => {
    expect(nextFreeFile("/a/b.matte-key.webm", () => false)).toBe("/a/b.matte-key.webm");
  });

  test("taken names move to .v2, .v3, ... and never reuse an existing file", () => {
    const taken = new Set(["/a/b.matte-key.webm", "/a/b.matte-key.v2.webm"]);
    expect(nextFreeFile("/a/b.matte-key.webm", (p) => taken.has(p))).toBe("/a/b.matte-key.v3.webm");
  });
});

describe("defaultMatteOut", () => {
  test("next to the source by default", () => {
    expect(defaultMatteOut("/clips/shot.mp4", "key", "webm")).toBe("/clips/shot.matte-key.webm");
    expect(defaultMatteOut("/clips/shot.mp4", "subject", "mov")).toBe("/clips/shot.matte-subject.mov");
  });

  test("project artifacts: videos/ for video, images/ for a still", () => {
    const art = "/p/artifacts";
    expect(defaultMatteOut("/x/shot.mp4", "subject", "webm", art)).toBe(path.join(art, "videos", "shot.matte-subject.webm"));
    expect(defaultMatteOut("/x/char.png", "key", "png", art)).toBe(path.join(art, "images", "char.matte-key.png"));
  });
});

describe("format helpers", () => {
  test("formatFromOut accepts only alpha-capable outputs", () => {
    expect(formatFromOut("/a/x.WEBM")).toBe("webm");
    expect(formatFromOut("/a/x.mov")).toBe("mov");
    expect(formatFromOut("/a/x.png")).toBe("png");
    expect(formatFromOut("/a/x.mp4")).toBeNull();
  });

  test("isImagePath", () => {
    expect(isImagePath("a.PNG")).toBe(true);
    expect(isImagePath("a.jpeg")).toBe(true);
    expect(isImagePath("a.mp4")).toBe(false);
  });
});

describe("alphaEncodeArgs", () => {
  test("webm is VP9 with a real alpha plane", () => {
    const a = alphaEncodeArgs("webm", "best");
    const at = (flag: string) => a[a.indexOf(flag) + 1];
    expect(at("-c:v")).toBe("libvpx-vp9");
    expect(at("-pix_fmt")).toBe("yuva420p");
    expect(at("-auto-alt-ref")).toBe("0");
    expect(at("-metadata:s:v:0")).toBe("alpha_mode=1");
    expect(at("-crf")).toBe(String(VP9_CRF.best));
    expect(at("-colorspace")).toBe("bt709");
  });

  test("mov is ProRes 4444 with alpha", () => {
    const a = alphaEncodeArgs("mov");
    expect(a).toContain("prores_ks");
    expect(a[a.indexOf("-profile:v") + 1]).toBe("4444");
    expect(a[a.indexOf("-pix_fmt") + 1]).toBe("yuva444p10le");
  });

  test("png is a single RGBA frame", () => {
    expect(alphaEncodeArgs("png")).toEqual(["-frames:v", "1", "-pix_fmt", "rgba", "-update", "1"]);
  });

  test("quality presets mirror hyperframes remove-background", () => {
    expect(VP9_CRF).toEqual({ fast: 30, balanced: 18, best: 12 });
  });
});

describe("graph tails", () => {
  test("RGB key output converts with the BT.709 matrix the tags declare", () => {
    expect(rgbToOutputTail("webm")).toBe("scale=out_color_matrix=bt709:out_range=tv,format=yuva420p");
    expect(rgbToOutputTail("mov")).toContain("format=yuva444p10le");
    expect(rgbToOutputTail("png")).toBe("format=rgba");
  });

  test("subject merge attaches the matte without an RGB round trip", () => {
    expect(subjectMergeGraph("webm")).toBe("[1:v]format=gray[m];[0:v]format=yuv420p[c];[c][m]alphamerge,format=yuva420p[out]");
    expect(subjectMergeGraph("mov")).toContain("alphamerge,format=yuva444p10le[out]");
    expect(subjectMergeGraph("png")).toContain("format=rgba[out]");
  });
});
