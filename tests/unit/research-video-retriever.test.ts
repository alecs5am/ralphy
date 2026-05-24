// `cli/lib/research/retrievers/video.ts` — yt-dlp + ffmpeg wrapper that
// turns a video URL (TikTok / YouTube / Instagram / Twitter / Reddit-hosted)
// into structured analysis input: metadata, sampled frames, transcript text.
//
// Unit tests stay on the pure helpers — URL detection and metadata
// normalization. The actual yt-dlp + ffmpeg invocations are exercised by
// the live end-to-end run.

import { describe, test, expect } from "bun:test";
import {
  detectVideoUrl,
  normalizeVideoMeta,
  computeViralityScore,
  type VideoMeta,
  type RawVideoMeta,
} from "../../cli/lib/research/retrievers/video.js";

describe("detectVideoUrl", () => {
  test("returns the platform for known short-form video hosts", () => {
    expect(detectVideoUrl("https://www.tiktok.com/@user/video/1234567890")).toBe("tiktok");
    expect(detectVideoUrl("https://vm.tiktok.com/ZGabc/")).toBe("tiktok");
    expect(detectVideoUrl("https://www.youtube.com/shorts/abc123")).toBe("youtube-shorts");
    expect(detectVideoUrl("https://youtube.com/watch?v=abc123")).toBe("youtube");
    expect(detectVideoUrl("https://youtu.be/abc123")).toBe("youtube");
    expect(detectVideoUrl("https://www.instagram.com/reel/Cabc/")).toBe("instagram-reel");
    expect(detectVideoUrl("https://www.instagram.com/p/Cabc/")).toBe("instagram-post");
    expect(detectVideoUrl("https://x.com/user/status/1234567890")).toBe("x");
    expect(detectVideoUrl("https://twitter.com/user/status/1234567890")).toBe("x");
  });

  test("returns null for non-video URLs", () => {
    expect(detectVideoUrl("https://www.anthropic.com/engineering/multi-agent-research-system")).toBeNull();
    expect(detectVideoUrl("https://example.com/article")).toBeNull();
    expect(detectVideoUrl("https://www.tiktok.com/")).toBeNull(); // root page
    expect(detectVideoUrl("https://www.tiktok.com/@user")).toBeNull(); // profile page
    expect(detectVideoUrl("https://www.instagram.com/user/")).toBeNull(); // profile page
    expect(detectVideoUrl("https://www.youtube.com/feed/trending")).toBeNull();
  });

  test("handles bare-host and protocol variants", () => {
    expect(detectVideoUrl("http://www.tiktok.com/@user/video/123")).toBe("tiktok");
    expect(detectVideoUrl("https://m.youtube.com/shorts/abc")).toBe("youtube-shorts");
  });

  test("returns null on malformed URLs", () => {
    expect(detectVideoUrl("not a url")).toBeNull();
    expect(detectVideoUrl("")).toBeNull();
  });
});

describe("normalizeVideoMeta", () => {
  test("maps a yt-dlp YouTube --dump-json payload to the canonical shape", () => {
    const raw: RawVideoMeta = {
      id: "abc123",
      title: "How to learn English fast",
      webpage_url: "https://www.youtube.com/watch?v=abc123",
      uploader: "English Lucy",
      uploader_id: "@englishlucy",
      channel_url: "https://www.youtube.com/@englishlucy",
      duration: 32,
      view_count: 1_200_000,
      like_count: 95_000,
      comment_count: 1_400,
      upload_date: "20250712",
      description: "Hook with mistake-pattern interrupt and 3 corrections.",
      tags: ["english", "shorts"],
      thumbnail: "https://i.ytimg.com/vi/abc123/maxresdefault.jpg",
    };
    const m = normalizeVideoMeta(raw, "https://www.youtube.com/shorts/abc123");
    expect(m.platform).toBe("youtube-shorts");
    expect(m.id).toBe("abc123");
    expect(m.title).toBe("How to learn English fast");
    expect(m.url).toBe("https://www.youtube.com/shorts/abc123");
    expect(m.uploaderHandle).toBe("@englishlucy");
    expect(m.durationSec).toBe(32);
    expect(m.views).toBe(1_200_000);
    expect(m.likes).toBe(95_000);
    expect(m.comments).toBe(1_400);
    expect(m.uploadedAt).toBe("2025-07-12");
    expect(m.engagementRate).toBeCloseTo((95_000 + 1_400) / 1_200_000, 5);
  });

  test("handles TikTok-flavored fields (heart_count, share_count)", () => {
    const raw: RawVideoMeta = {
      id: "7400000000000000000",
      title: "POV: native English speakers",
      webpage_url: "https://www.tiktok.com/@user/video/7400000000000000000",
      uploader: "Lucy",
      uploader_id: "user",
      duration: 18,
      view_count: 5_000_000,
      like_count: 800_000,
      heart_count: 800_000,
      repost_count: 12_000,
      comment_count: 6_500,
      upload_date: "20260301",
    };
    const m = normalizeVideoMeta(raw, "https://www.tiktok.com/@user/video/7400000000000000000");
    expect(m.platform).toBe("tiktok");
    expect(m.views).toBe(5_000_000);
    expect(m.likes).toBe(800_000);
    expect(m.shares).toBe(12_000);
    expect(m.uploadedAt).toBe("2026-03-01");
  });

  test("tolerates missing numeric fields", () => {
    const raw: RawVideoMeta = {
      id: "x",
      title: "t",
      webpage_url: "https://www.youtube.com/shorts/x",
      duration: 10,
    };
    const m = normalizeVideoMeta(raw, "https://www.youtube.com/shorts/x");
    expect(m.views).toBe(0);
    expect(m.likes).toBe(0);
    expect(m.comments).toBe(0);
    expect(m.shares).toBe(0);
    expect(m.engagementRate).toBe(0);
  });

  test("computes ageDays from upload_date relative to a clock", () => {
    const raw: RawVideoMeta = {
      id: "x",
      title: "t",
      webpage_url: "https://www.youtube.com/shorts/x",
      duration: 10,
      upload_date: "20260501",
    };
    const m = normalizeVideoMeta(raw, "https://www.youtube.com/shorts/x", {
      now: new Date("2026-05-25T00:00:00Z"),
    });
    expect(m.ageDays).toBe(24);
  });
});

describe("computeViralityScore", () => {
  test("higher views/day + higher engagement → higher score", () => {
    const fresh: VideoMeta = {
      platform: "tiktok",
      id: "a",
      title: "",
      url: "https://www.tiktok.com/@u/video/a",
      uploaderHandle: "u",
      uploaderName: "",
      durationSec: 20,
      views: 2_000_000,
      likes: 300_000,
      comments: 5_000,
      shares: 8_000,
      uploadedAt: "2026-05-20",
      ageDays: 5,
      engagementRate: (300_000 + 5_000 + 8_000) / 2_000_000,
    };
    const old: VideoMeta = {
      ...fresh,
      id: "b",
      url: "https://www.tiktok.com/@u/video/b",
      views: 2_000_000,
      ageDays: 800,
    };
    expect(computeViralityScore(fresh)).toBeGreaterThan(computeViralityScore(old));
  });

  test("zero views → zero score", () => {
    const meta: VideoMeta = {
      platform: "tiktok",
      id: "a",
      title: "",
      url: "https://www.tiktok.com/@u/video/a",
      uploaderHandle: "u",
      uploaderName: "",
      durationSec: 20,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      uploadedAt: "2026-05-20",
      ageDays: 5,
      engagementRate: 0,
    };
    expect(computeViralityScore(meta)).toBe(0);
  });

  test("guards against division-by-zero on ageDays=0", () => {
    const meta: VideoMeta = {
      platform: "tiktok",
      id: "a",
      title: "",
      url: "https://www.tiktok.com/@u/video/a",
      uploaderHandle: "u",
      uploaderName: "",
      durationSec: 20,
      views: 1_000_000,
      likes: 100_000,
      comments: 1_000,
      shares: 1_000,
      uploadedAt: "2026-05-25",
      ageDays: 0,
      engagementRate: 0.102,
    };
    const score = computeViralityScore(meta);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });
});
