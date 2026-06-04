// `ralphy blueprint` smoke + invariant tests (#076).
//
// Exercises the capture command via the live CLI (spawn `bun run cli/index.ts
// blueprint ...`) against a throwaway workspace fixture project. Locks the
// load-bearing behaviors from issue #076:
//   1. `create --unit <slug>` writes a blueprint/blueprint.json that
//      `BlueprintSchema.parse` accepts.
//   2. The index.html `A[]`/`SEG[]` arrays + components are captured in
//      `composition.timing` / `composition.components`.
//   3. Append-only — a re-`create` on the same slug lands in `blueprint.v2/`,
//      leaving the first capture intact.
//   4. `list` reports the unit; `show --unit <slug>` returns the manifest.
//
// English-only-on-disk discipline: every fixture slug / filename / prompt /
// scenario line is plain English — no Cyrillic, no real-creator tokens.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BlueprintSchema } from "../../cli/lib/schemas/blueprint";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "blueprint-fixture-076";
const SLUG = "fog-horror";

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function projDir(): string {
  return path.join(tmpRoot, "workspace", "projects", PROJECT);
}

function unitDir(): string {
  return path.join(projDir(), "units", SLUG);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-blueprint-076-"));
  const proj = projDir();

  // A minimal unit (no media needed for the blueprint capture — just unit.json).
  fs.mkdirSync(unitDir(), { recursive: true });
  fs.writeFileSync(
    path.join(unitDir(), "unit.json"),
    JSON.stringify(
      {
        slug: SLUG,
        format: "video",
        media: ["showcase.mp4"],
        provenance: {
          template: "choose-your-path-gauntlet",
          style: "analog-horror",
          recipes: ["ffmpeg-xfade-master", "chroma-split", "film-grain-encode"],
          assets: ["fog-soundtrack"],
        },
        created: new Date().toISOString(),
        title: "Fog Horror",
      },
      null,
      2,
    ),
  );

  // index.html with the timing arrays + a couple of class/component markers.
  fs.writeFileSync(
    path.join(proj, "index.html"),
    [
      '<div id="root" data-composition-id="blueprint-fixture-076" data-duration="6.0">',
      '  <div class="tint"></div><div class="grain"></div>',
      "  <script>",
      "    const A=[0,3.9];",
      "    const SEG=[3.9,2.0];",
      "    function drawCaptions(){}",
      '    window.__timelines = window.__timelines || {};',
      '    window.__timelines["blueprint-fixture-076"] = tl;',
      "  </script>",
      "</div>",
    ].join("\n"),
  );

  // A prompt file (image stage inferred from the char- prefix).
  fs.mkdirSync(path.join(proj, "prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(proj, "prompts", "char-guide.txt"),
    "PS1 fog-horror guide reference, {{guide_name}}, low-poly, dithered textures.",
  );

  // A scene jsonl row (scenario axis).
  fs.writeFileSync(
    path.join(proj, "scenes.jsonl"),
    JSON.stringify({
      id: "scene-01",
      label: "Foggy hub",
      duration_sec: 4,
      vo: "Pick your guide.",
      sfx: ["radio-static"],
    }) + "\n",
  );

  // A generations.jsonl with: an ERRORED image re-roll then an OK image re-roll
  // for the SAME slot (the harvest must pick the ok one + collapse to one
  // entry), plus an i2v row with a first_frame anchor (tagged stage:"i2v").
  fs.mkdirSync(path.join(proj, "logs"), { recursive: true });
  fs.writeFileSync(
    path.join(proj, "logs", "generations.jsonl"),
    [
      {
        timestamp: "2026-06-01T00:00:00.000Z",
        provider: "openrouter",
        model: "openai/gpt-5.4-image-2",
        endpoint: "openai/gpt-5.4-image-2",
        kind: "image",
        status: "error",
        input: {
          slot: "char-guide",
          project: PROJECT,
          prompt: "ERRORED image prompt — first attempt, must not be captured.",
          size: "1024x1024",
        },
      },
      {
        timestamp: "2026-06-01T00:01:00.000Z",
        provider: "openrouter",
        model: "openai/gpt-5.4-image-2",
        endpoint: "openai/gpt-5.4-image-2",
        kind: "image",
        status: "ok",
        input: {
          slot: "char-guide",
          project: PROJECT,
          prompt: "WINNING image prompt — the ok re-roll, this is the one to capture.",
          size: "1024x1024",
        },
        output: { local: path.join(proj, "index.html") },
        cost_usd: 0.2,
      },
      {
        timestamp: "2026-06-01T00:02:00.000Z",
        provider: "openrouter",
        model: "bytedance/seedance-2.0",
        endpoint: "bytedance/seedance-2.0",
        kind: "video",
        status: "ok",
        input: {
          slot: "scene-01-follow-vid",
          project: PROJECT,
          prompt: "i2v motion prompt — slow push-in through the fog.",
          duration_sec: 5,
          preprocess: { first_frame: { out_mime: "image/png" } },
        },
        output: { local: path.join(proj, "index.html") },
        cost_usd: 0.4,
      },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );

  // An asset-manifest.json with one real local hard asset (the index.html, so a
  // copy actually lands without needing a binary fixture).
  fs.writeFileSync(
    path.join(proj, "asset-manifest.json"),
    JSON.stringify(
      {
        slots: {
          "char-guide": {
            kind: "image",
            path: path.join(proj, "index.html"),
            model: "openai/gpt-5.4-image-2",
          },
        },
      },
      null,
      2,
    ),
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy blueprint (#076)", () => {
  test("create writes a blueprint.json that BlueprintSchema accepts", () => {
    const r = ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.dir).toBe(`${SLUG}/blueprint`);
    expect(r.json?.versioned).toBe(false);

    const bpPath = path.join(unitDir(), "blueprint", "blueprint.json");
    expect(fs.existsSync(bpPath)).toBe(true);
    const parsed = BlueprintSchema.parse(JSON.parse(fs.readFileSync(bpPath, "utf8")));
    expect(parsed.unitId).toBe(SLUG);
    // index.html copied into the payload.
    expect(fs.existsSync(path.join(unitDir(), "blueprint", "index.html"))).toBe(true);
    // prompt file copied verbatim.
    expect(
      fs.existsSync(path.join(unitDir(), "blueprint", "prompts", "char-guide.txt")),
    ).toBe(true);
  });

  test("captures the index.html A/SEG timing arrays + components", () => {
    ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    const bp = BlueprintSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(unitDir(), "blueprint", "blueprint.json"), "utf8"),
      ),
    );
    expect(bp.composition?.timing?.A).toEqual([0, 3.9]);
    expect(bp.composition?.timing?.SEG).toEqual([3.9, 2.0]);
    expect(bp.composition?.components).toContain("tint");
    expect(bp.composition?.components).toContain("grain");
    expect(bp.composition?.components).toContain("drawCaptions");
    expect(bp.composition?.components).toContain("blueprint-fixture-076");
  });

  test("captures scenario, prompts, model stack, recipes + cost rollup", () => {
    ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    const bp = BlueprintSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(unitDir(), "blueprint", "blueprint.json"), "utf8"),
      ),
    );
    expect(bp.scenario?.scenes[0]?.id).toBe("scene-01");
    expect(bp.scenario?.scenes[0]?.vo).toBe("Pick your guide.");
    // The dir-sourced char-guide image prompt (carries the {{guide_name}} slot)
    // sorts first (slot "char-guide", stage "image").
    const charGuideDir = bp.prompts.find(
      (p) => p.slot === "char-guide" && p.slots?.includes("guide_name"),
    );
    expect(charGuideDir?.stage).toBe("image");
    expect(bp.modelStack.some((m) => m.model === "openai/gpt-5.4-image-2")).toBe(true);
    // cost rollup now sums the ok image (0.2) + the i2v (0.4).
    expect(bp.costRollupUsd).toBeCloseTo(0.6);
    expect(bp.recipes.map((rc) => rc.name)).toEqual([
      "ffmpeg-xfade-master",
      "chroma-split",
      "film-grain-encode",
    ]);
  });

  test("harvests verbatim per-slot prompts from generations.jsonl (#081)", () => {
    ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    const bp = BlueprintSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(unitDir(), "blueprint", "blueprint.json"), "utf8"),
      ),
    );

    // The OK image re-roll prompt is captured, tagged stage "image".
    const winning = bp.prompts.find((p) => p.text.startsWith("WINNING image prompt"));
    expect(winning).toBeDefined();
    expect(winning?.stage).toBe("image");
    expect(winning?.slot).toBe("char-guide");
    expect(winning?.model).toBe("openai/gpt-5.4-image-2");

    // The ERRORED earlier re-roll is NOT captured (winning row wins).
    expect(bp.prompts.some((p) => p.text.startsWith("ERRORED image prompt"))).toBe(false);

    // Re-rolls collapse to ONE gen-log entry per (slot, stage): exactly one
    // gen-log-sourced char-guide image prompt (the dir prompt is a separate
    // text and is allowed to coexist).
    const charGuideFromLog = bp.prompts.filter(
      (p) => p.slot === "char-guide" && p.stage === "image" && p.text.includes("re-roll"),
    );
    expect(charGuideFromLog.length).toBe(1);

    // The video row with a first_frame anchor is tagged stage "i2v".
    const i2v = bp.prompts.find((p) => p.slot === "scene-01-follow-vid");
    expect(i2v?.stage).toBe("i2v");
    expect(i2v?.text).toContain("push-in through the fog");
  });

  test("append-only — re-create lands in blueprint.v2/, leaving the first intact", () => {
    const first = ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    expect(first.json?.dir).toBe(`${SLUG}/blueprint`);

    const second = ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    expect(second.exitCode).toBe(0);
    expect(second.json?.dir).toBe(`${SLUG}/blueprint.v2`);
    expect(second.json?.versioned).toBe(true);

    // v1 still on disk with a valid manifest.
    expect(fs.existsSync(path.join(unitDir(), "blueprint", "blueprint.json"))).toBe(true);
    expect(fs.existsSync(path.join(unitDir(), "blueprint.v2", "blueprint.json"))).toBe(true);
  });

  test("list reports the unit + versions; show returns the latest manifest", () => {
    ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);
    ralphy(["blueprint", "create", PROJECT, "--unit", SLUG]);

    const list = ralphy(["blueprint", "list", PROJECT]);
    expect(list.exitCode).toBe(0);
    expect(Array.isArray(list.json)).toBe(true);
    expect(list.json[0].slug).toBe(SLUG);
    expect(list.json[0].versions).toEqual(["blueprint", "blueprint.v2"]);
    expect(list.json[0].latest).toBe("blueprint.v2");

    const show = ralphy(["blueprint", "show", PROJECT, "--unit", SLUG]);
    expect(show.exitCode).toBe(0);
    expect(show.json.unitId).toBe(SLUG);
    expect(show.json.schemaVersion).toBe(1);
  });

  test("degrades gracefully when the unit has no source axes", () => {
    // A second bare unit with only unit.json (no scenario / prompts / index /
    // manifest / logs in a fresh project). Re-use the same project but a new
    // slug, and remove the project-level source files first.
    const bareSlug = "bare-unit";
    const bareDir = path.join(projDir(), "units", bareSlug);
    fs.mkdirSync(bareDir, { recursive: true });
    fs.writeFileSync(
      path.join(bareDir, "unit.json"),
      JSON.stringify({ slug: bareSlug, format: "image", media: [], created: new Date().toISOString() }, null, 2),
    );
    // Strip the project-level source files so all axes degrade.
    fs.rmSync(path.join(projDir(), "index.html"));
    fs.rmSync(path.join(projDir(), "prompts"), { recursive: true });
    fs.rmSync(path.join(projDir(), "scenes.jsonl"));
    fs.rmSync(path.join(projDir(), "asset-manifest.json"));
    fs.rmSync(path.join(projDir(), "logs"), { recursive: true });

    const r = ralphy(["blueprint", "create", PROJECT, "--unit", bareSlug]);
    expect(r.exitCode).toBe(0);
    const bp = BlueprintSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(bareDir, "blueprint", "blueprint.json"), "utf8"),
      ),
    );
    expect(bp.scenario).toBeNull();
    expect(bp.composition).toBeNull();
    expect(bp.prompts).toEqual([]);
    expect(bp.assets).toEqual([]);
    expect(typeof bp.notes).toBe("string");
  });
});
