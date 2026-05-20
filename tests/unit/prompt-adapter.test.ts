import { describe, test, expect } from "bun:test";
import {
  adapterFor,
  shapePrompt,
  klingAdapter,
  lumaAdapter,
  veoAdapter,
  runwayAdapter,
  pikaAdapter,
  soraAdapter,
  seedanceAdapter,
  hailuoAdapter,
} from "../../cli/lib/providers/prompt-adapter/index.ts";
import type { NormalizedPrompt } from "../../cli/lib/providers/prompt-adapter/types.ts";

const CANONICAL: NormalizedPrompt = {
  subject: "Sasha, 28, freckled barista in a navy apron",
  action: "looks straight into the lens and laughs",
  setting: "third-wave coffee bar, morning",
  camera: "selfie 35mm, eye-level, handheld",
  lighting: "soft window light from screen-left",
  style: "Kodak Portra 400, naturalistic NOT glossy",
  dialogue: "I tried it for thirty days",
  dialogueTone: "deadpan",
  motion: "slow push-in",
  gesture: "lean-in",
  durationS: 5,
  aspectRatio: "9:16",
  notes: "lock identity to ref, do not invent earrings",
};

describe("Prompt adapter dispatcher (02.01.01)", () => {
  test("Kling family routes to klingAdapter", () => {
    expect(adapterFor("kwaivgi/kling-v3.0-pro")).toBe(klingAdapter);
    expect(adapterFor("kwaivgi/kling-v3.0-std")).toBe(klingAdapter);
  });

  test("Veo routes to veoAdapter", () => {
    expect(adapterFor("google/veo-3.1")).toBe(veoAdapter);
  });

  test("Luma routes to lumaAdapter", () => {
    expect(adapterFor("luma/ray-2-1080p")).toBe(lumaAdapter);
  });

  test("Runway routes to runwayAdapter", () => {
    expect(adapterFor("runway/gen-4-turbo")).toBe(runwayAdapter);
  });

  test("Pika routes to pikaAdapter", () => {
    expect(adapterFor("pika/pika-2-turbo")).toBe(pikaAdapter);
  });

  test("Sora routes to soraAdapter", () => {
    expect(adapterFor("openai/sora-2")).toBe(soraAdapter);
  });

  test("Seedance routes to seedanceAdapter", () => {
    expect(adapterFor("bytedance/seedance-2.0")).toBe(seedanceAdapter);
  });

  test("Hailuo routes to hailuoAdapter", () => {
    expect(adapterFor("minimax/hailuo-02")).toBe(hailuoAdapter);
  });

  test("Unknown model falls back to pika shape", () => {
    expect(adapterFor("some/unknown-model")).toBe(pikaAdapter);
  });
});

describe("Kling adapter (02.01.02)", () => {
  test("emits the canonical Scene→Character→Shot→Motion→Dialogue→Progression order", () => {
    const { prompt } = klingAdapter(CANONICAL);
    expect(prompt.startsWith("Scene:")).toBe(true);
    expect(prompt.indexOf("Scene:")).toBeLessThan(prompt.indexOf("Character:"));
    expect(prompt.indexOf("Character:")).toBeLessThan(prompt.indexOf("Shot:"));
    expect(prompt.indexOf("Shot:")).toBeLessThan(prompt.indexOf("Motion:"));
    expect(prompt.indexOf("Motion:")).toBeLessThan(prompt.indexOf("Dialogue:"));
    expect(prompt.indexOf("Dialogue:")).toBeLessThan(prompt.indexOf("Progression:"));
  });

  test("dialogue is bracketed `[Speaker, tone]: \"line\"`", () => {
    const { prompt } = klingAdapter(CANONICAL);
    expect(prompt).toContain('[Sasha, deadpan]: "I tried it for thirty days"');
  });

  test("falls back to neutral tone when dialogueTone is missing", () => {
    const { prompt } = klingAdapter({ ...CANONICAL, dialogueTone: undefined });
    expect(prompt).toContain('[Sasha, neutral]:');
  });

  test("always bans background music in the Progression block", () => {
    const { prompt } = klingAdapter(CANONICAL);
    expect(prompt.toLowerCase()).toContain("no background music");
  });

  test("emits exact string for canonical scene", () => {
    const { prompt, adapter } = klingAdapter(CANONICAL);
    expect(adapter).toBe("kling-v3");
    expect(prompt).toBe(
      `Scene: third-wave coffee bar, morning. ` +
        `Character: Sasha, 28, freckled barista in a navy apron. ` +
        `Shot: selfie 35mm, eye-level, handheld. Lighting: soft window light from screen-left. Style: Kodak Portra 400, naturalistic NOT glossy. ` +
        `Motion: slow push-in; Upper body tilts toward camera, head slightly forward — confidential / intimate beat.; looks straight into the lens and laughs. ` +
        `Dialogue: [Sasha, deadpan]: "I tried it for thirty days" ` +
        `Progression: 5s clip, 9:16, no background music, SFX only. ` +
        `Director notes: lock identity to ref, do not invent earrings.`,
    );
  });
});

describe("Luma adapter (02.01.03)", () => {
  test("appends a trailing reinforcer sentence", () => {
    const { prompt } = lumaAdapter(CANONICAL);
    expect(prompt).toMatch(/stays the focus/u);
    // The reinforcer comes last.
    const lastSentenceIdx = prompt.lastIndexOf(". ");
    expect(prompt.slice(lastSentenceIdx + 2)).toMatch(/stays the focus/u);
  });
});

describe("Veo adapter (02.01.04)", () => {
  test("applies the 7-part skeleton in order", () => {
    const { prompt } = veoAdapter(CANONICAL);
    const order = ["Shot:", "Style:", "Lighting:", "Character:", "Location:", "Action:", "Dialogue"];
    let last = -1;
    for (const tag of order) {
      const idx = prompt.indexOf(tag);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });
});

describe("Runway / Pika / Sora adapters (02.01.05)", () => {
  test("Runway emits temporal-consistency reminder", () => {
    const { prompt } = runwayAdapter(CANONICAL);
    expect(prompt.toLowerCase()).toContain("temporal consistency");
  });

  test("Pika is comma-delimited subject-first", () => {
    const { prompt } = pikaAdapter(CANONICAL);
    expect(prompt.startsWith(CANONICAL.subject)).toBe(true);
    expect(prompt.split(",").length).toBeGreaterThan(4);
  });

  test("Sora translates 'selfie' into 'selfie perspective'", () => {
    const { prompt } = soraAdapter(CANONICAL);
    expect(prompt.toLowerCase()).toContain("selfie perspective");
  });

  test("Sora maps bodycam → 'bodycam perspective'", () => {
    const { prompt } = soraAdapter({ ...CANONICAL, camera: "bodycam, low angle" });
    expect(prompt.toLowerCase()).toContain("bodycam perspective");
  });
});

describe("shapePrompt convenience (02.01.01)", () => {
  test("dispatches via id", () => {
    const r = shapePrompt("kwaivgi/kling-v3.0-pro", CANONICAL);
    expect(r.adapter).toBe("kling-v3");
  });
});

describe("Adapter — unknown gesture is silently omitted (D-06)", () => {
  test("Kling adapter omits the unknown-gesture clause without throwing", () => {
    const { prompt } = klingAdapter({ ...CANONICAL, gesture: "moonwalk" as never });
    // Motion line is present but doesn't contain the unknown gesture phrase.
    expect(prompt).toContain("Motion:");
    expect(prompt).not.toContain("moonwalk");
  });
});
