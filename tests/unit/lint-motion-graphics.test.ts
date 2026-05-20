// Unit tests for scripts/lint-motion-graphics.ts (04.0A.02).

import { describe, test, expect } from "bun:test";
import {
  scanPromptsBlob,
  MOTION_GRAPHICS_TELLS,
} from "../../scripts/lint-motion-graphics.js";

describe("scanPromptsBlob", () => {
  test("flags 'animated text' inside a video prompt", () => {
    const blob = {
      "scene-01": {
        video: { prompt: "Animated text slams in over a dark backdrop" },
      },
    };
    const hits = scanPromptsBlob(blob, "test-001");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.phrase).toBe("animated text");
    expect(hits[0]!.field).toContain("scene-01.video.prompt");
  });

  test("flags 'kinetic typography' in nested array structure", () => {
    const blob = {
      scenes: [
        { id: "scene-01", prompt: "kinetic typography style hook" },
        { id: "scene-02", prompt: "normal product shot" },
      ],
    };
    const hits = scanPromptsBlob(blob, "test-001");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.slot).toBe("scene-01");
  });

  test("flags 'lower third' as motion graphics", () => {
    const blob = {
      "scene-03": { video: { prompt: "lower third with name and title" } },
    };
    const hits = scanPromptsBlob(blob, "test-001");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.phrase).toBe("lower third");
  });

  test("honors the <!-- motion-graphics-allow --> marker", () => {
    const blob = {
      "scene-01": {
        video: {
          prompt: "animated text on screen <!-- motion-graphics-allow -->",
        },
      },
    };
    const hits = scanPromptsBlob(blob, "test-001");
    expect(hits).toHaveLength(0);
  });

  test("passes a clean live-action video prompt", () => {
    const blob = {
      "scene-01": {
        video: { prompt: "Steady handheld shot of a barista pulling espresso" },
      },
    };
    const hits = scanPromptsBlob(blob, "test-001");
    expect(hits).toHaveLength(0);
  });

  test("MOTION_GRAPHICS_TELLS covers the canonical set", () => {
    expect(MOTION_GRAPHICS_TELLS).toContain("animated text");
    expect(MOTION_GRAPHICS_TELLS).toContain("kinetic typography");
    expect(MOTION_GRAPHICS_TELLS).toContain("lower third");
    expect(MOTION_GRAPHICS_TELLS).toContain("transition wipe");
  });
});
