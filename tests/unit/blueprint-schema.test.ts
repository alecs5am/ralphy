// Blueprint Zod schema validation (#074).
//
// Locks that `BlueprintSchema` accepts a representative, reproduction-grade
// payload for a real shipped unit (choose-silenthill — a branching POV
// fog-horror video), and that its load-bearing invariants hold:
//   - a full six-axis payload parses;
//   - `unitId` is required (a payload without it is rejected);
//   - `scenario: null` (scenario-less still project) is accepted;
//   - `composition: null` (non-HyperFrames output) is accepted.
//
// English-only-on-disk discipline: all VO lines / labels / prompts below are
// plain English — no Cyrillic, no real-creator tokens. Model ids are the actual
// stack the project used (see logs/generations.jsonl), all OpenRouter/ElevenLabs.

import { describe, test, expect } from "bun:test";
import { BlueprintSchema, type Blueprint } from "../../cli/lib/schemas/blueprint";

/** A representative choose-silenthill blueprint — covers all six payload axes. */
const sample: Blueprint = {
  unitId: "choose-silenthill",
  schemaVersion: 1,
  // axis 1 — scenario / scene table (a branching fork beat included)
  scenario: {
    scenes: [
      {
        id: "scene-01",
        label: "Foggy street hub",
        durationSec: 4,
        vo: "Two figures wait in the fog. Pick your guide.",
        sfx: ["radio-static", "distant-siren"],
        notes: "Establishing hub, both guides visible.",
      },
      {
        id: "scene-02",
        label: "Fork: nurse or madman",
        durationSec: 5,
        vo: "Trust the bandaged nurse, or the armed man?",
        fork: {
          label: "Choose your guide",
          options: ["follow-nurse", "follow-madman"],
        },
      },
    ],
    storyboardMd: "# Storyboard\n\n10 scenes, ~30s, 9:16. PS1 fog-horror.",
  },
  // axis 2 — per-stage prompts, verbatim, with slots noted
  prompts: [
    {
      stage: "image",
      slot: "hub-image",
      model: "openai/gpt-5.4-image-2",
      text: "PS1 voxel fog-horror street, two figures in the haze, {{guide_a}} and {{guide_b}}, low-poly, dithered.",
      slots: ["guide_a", "guide_b"],
    },
    {
      stage: "i2v",
      slot: "scene-02-i2v",
      model: "bytedance/seedance-2.0",
      text: "Camera drifts forward through the fog, the two guides twitch, flashlight jitter persists.",
    },
    {
      stage: "vo",
      slot: "narrator",
      model: "elevenlabs/eleven_multilingual_v2",
      text: "Two figures wait in the fog. Pick your guide.",
    },
    {
      stage: "music",
      model: "elevenlabs/music",
      text: "Slow dread drone, low sub rumble, no melody, no named artists.",
    },
  ],
  // axis 3 — composition
  composition: {
    file: "index.html",
    timing: { A: [0, 4, 9, 13], SEG: [4, 5, 4, 5] },
    components: ["VhsPauseFreeze", "ChromaSplit", "BurnedCaptions"],
  },
  // axis 4 — hard assets, by ref
  assets: [
    {
      slot: "char-nurse",
      path: "assets/char-nurse-master.png",
      kind: "master",
      bytes: 1_482_311,
    },
    {
      slot: "soundtrack",
      path: "assets/choosepath-soundtrack.mp3",
      kind: "music",
      storageUrl:
        "https://ralphy.b-cdn.net/units/choose-silenthill/soundtrack.mp3",
    },
  ],
  // axis 5 — model stack + params + cost
  modelStack: [
    {
      stage: "image",
      model: "openai/gpt-5.4-image-2",
      params: { size: "1024x1024", n: 1 },
      costUsd: 0.04,
    },
    {
      stage: "i2v",
      model: "bytedance/seedance-2.0",
      params: { durationSec: 5, resolution: "720p" },
      costUsd: 0.45,
    },
    {
      stage: "vo",
      model: "elevenlabs/eleven_multilingual_v2",
      voiceId: "choosepath-narrator-clone",
      costUsd: 0.01,
    },
  ],
  // axis 6 — concrete recipes / effects, with values
  recipes: [
    {
      name: "ffmpeg-xfade-master",
      kind: "ffmpeg",
      command:
        "ffmpeg -i a.mp4 -i b.mp4 -filter_complex xfade=transition=fade:duration=0.5:offset=4 out.mp4",
    },
    {
      name: "film-grain-encode",
      kind: "encode",
      params: { tune: "grain", crf: 30 },
    },
    {
      name: "chroma-split",
      kind: "overlay",
      params: { offsetPx: 3, layers: 5 },
    },
  ],
  costRollupUsd: 0.51,
  createdAt: "2026-06-03T16:31:21.006Z",
  notes: "Branching POV fog-horror, EN VO, voxel/PS1 register.",
};

describe("BlueprintSchema", () => {
  test("accepts a full six-axis choose-silenthill payload", () => {
    const parsed = BlueprintSchema.parse(sample);
    expect(parsed.unitId).toBe("choose-silenthill");
    expect(parsed.scenario?.scenes).toHaveLength(2);
    expect(parsed.prompts).toHaveLength(4);
    expect(parsed.composition?.timing?.A).toEqual([0, 4, 9, 13]);
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.modelStack).toHaveLength(3);
    expect(parsed.recipes).toHaveLength(3);
    expect(parsed.costRollupUsd).toBeCloseTo(0.51);
  });

  test("rejects a payload missing unitId", () => {
    const { unitId: _omit, ...withoutUnitId } = sample;
    const result = BlueprintSchema.safeParse(withoutUnitId);
    expect(result.success).toBe(false);
  });

  test("accepts a scenario-less still project (scenario: null)", () => {
    const still: Blueprint = {
      ...sample,
      scenario: null,
      composition: null,
      prompts: [
        {
          stage: "image",
          model: "google/gemini-3-pro-image-preview",
          text: "Single key-art poster, no scene table.",
        },
      ],
    };
    const result = BlueprintSchema.safeParse(still);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenario).toBeNull();
      expect(result.data.composition).toBeNull();
    }
  });
});
