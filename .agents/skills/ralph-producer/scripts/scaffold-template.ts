// Scaffold a new dir-template directory with stub files.
//
// Reads metadata from the source project (composition-props.json, scenario.json),
// creates workspace/templates/<slug>/ with template.json + 5 stub MD files
// containing inline guidance comments for what to write where.
//
// Does NOT register the template — that's a separate manual step (`ralph template register`)
// after the chat has filled in the docs.
//
// Usage:
//   npx tsx .agents/skills/ralph-ugc-create-template/scripts/scaffold-template.ts \
//     --slug <kebab-slug> --name "<Human Name>" --from-project <project-id>

import fs from "node:fs/promises";
import path from "node:path";

type Args = { slug?: string; name?: string; fromProject?: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--from-project") out.fromProject = argv[++i];
  }
  return out;
}

async function readJsonSafe(p: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

async function main() {
  const { slug, name, fromProject } = parseArgs();
  if (!slug || !name) {
    console.error("Usage: --slug <kebab-slug> --name \"<Human Name>\" [--from-project <id>]");
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`Slug must be kebab-case lowercase: ${slug}`);
    process.exit(1);
  }

  const templateDir = path.resolve("workspace/templates", slug);
  try {
    await fs.access(templateDir);
    console.error(`Template dir already exists: ${templateDir}`);
    process.exit(1);
  } catch { /* good, doesn't exist */ }

  await fs.mkdir(templateDir, { recursive: true });
  await fs.mkdir(path.join(templateDir, "assets"), { recursive: true });

  // Pull metadata from source project if provided
  let composition: any = null;
  let scenario: any = null;
  let costEstimate: number | null = null;
  let modelsUsed: string[] = [];
  if (fromProject) {
    const projDir = path.resolve("workspace/projects", fromProject);
    composition = await readJsonSafe(path.join(projDir, "composition-props.json"));
    scenario = await readJsonSafe(path.join(projDir, "scenario.json"));

    // Walk generations.jsonl to extract cost + models
    try {
      const gens = await fs.readFile(path.join(projDir, "logs", "generations.jsonl"), "utf-8");
      const seen = new Set<string>();
      let total = 0;
      for (const line of gens.split("\n").filter(Boolean)) {
        try {
          const e = JSON.parse(line);
          if (e.endpoint) seen.add(e.endpoint);
          if (typeof e.cost_usd === "number") total += e.cost_usd;
        } catch { /* skip bad line */ }
      }
      modelsUsed = Array.from(seen);
      costEstimate = total > 0 ? total : null;
    } catch { /* no logs */ }
  }

  const tpl = {
    name,
    slug,
    kind: "vibe-reference",
    description: "TODO — one long sentence: what this format is, who it's for, what the recognizable signature is. Write last after TEMPLATE.md is done.",
    tags: [] as string[],
    platform: composition?.platform ?? "tiktok",
    aspectRatio: composition?.aspectRatio ?? "9:16",
    fps: composition?.fps ?? 30,
    width: composition?.width ?? 1080,
    height: composition?.height ?? 1920,
    typicalDurationSec: scenario?.totalDurationSec ? [Math.floor(scenario.totalDurationSec * 0.85), Math.ceil(scenario.totalDurationSec * 1.2)] : [45, 75],
    typicalClipCount: scenario?.scenes?.length ? [Math.max(4, scenario.scenes.length - 2), scenario.scenes.length + 2] : [6, 10],
    extractedFrom: fromProject ?? null,
    createdAt: new Date().toISOString(),
    docs: {
      main: "TEMPLATE.md",
      referenceExample: "reference-example.md",
      promptFragments: "fragments.md",
      modelStack: "model-stack.md",
      composition: "composition.md",
    },
    stackSummary: {
      __TODO__: "Fill from logs/generations.jsonl after reviewing the source project.",
      modelsObserved: modelsUsed,
      observedCostUsd: costEstimate,
    },
    assets: {
      __TODO__: "Declare any required assets here. Pattern: { '<key>': { path: 'assets/<file>', required: true, note: '...' } }. Files declared with required:true are auto-copied into new projects at `ralph template use`.",
    },
    constants: {
      __TODO__: "Hardcoded params critical to format identity (e.g. narratorLanguage, musicSplit). Empty object if none.",
    },
    doNotCopyLiterally: "TODO — one sentence: what specifically should NOT be reused literally between videos of this format (e.g. exact VO lines, per-clip durations, tagline).",
  };

  await fs.writeFile(path.join(templateDir, "template.json"), JSON.stringify(tpl, null, 2) + "\n");

  const stubs: Record<string, string> = {
    "TEMPLATE.md": `# ${name} — Template

<!-- Top-level vibe reference. Read soviet-nostalgic/TEMPLATE.md as the gold-standard structure. Sections to fill in order: -->

## Why the format works

<!-- 3-5 bullets on hook / retention / recognition. WHY do viewers stop scrolling and stay? Be specific (not "engaging visuals" — say what specifically). -->

## Vibe anchors — keep these constant

<!-- What MUST stay the same across every video of this format. Voice profile, language, visual contrast, music signature, narrator stance, etc. Anything you change moves it into a different format. -->

## What varies project-to-project

<!-- Decision axes per new project: product, character, year, setting, tagline shape, etc. List as bullets. -->

## Required inputs from user before you start

<!-- Reference photos, voice_id, brand brief, music tracks. Whatever the chat MUST have before kicking off generation. Include \`ralph project log-prompt\` / \`log-asset\` patterns for capturing them. -->

## Narrative arc as a shape, not a prescription

<!-- Beat structure as prose, not a numbered scene table. Example beats from reference, but emphasize "scenes can be 6-10, durations vary by VO, trust the story." -->

## Music

<!-- If there's a REQUIRED trend track that MUST be reused (audio recognition is part of the format), say so explicitly. Path, duration, "do not generate substitute". Otherwise note "any track in style X works". -->

## Workflow

<!-- Steps from scaffold to render, calling out which skills handle each step. -->

## Cost ballpark (per video)

<!-- Pulled from source project's logs/generations.jsonl. -->

## When NOT to use this template

<!-- Where this format breaks: wrong audience, wrong product type, wrong tone. Saves the chat from misapplying. -->

## Files in this template

- \`TEMPLATE.md\` (this file)
- [reference-example.md](reference-example.md)
- [fragments.md](fragments.md)
- [model-stack.md](model-stack.md)
- [composition.md](composition.md)
- \`template.json\`
`,

    "reference-example.md": `# Reference example — from project \`${fromProject ?? "<source>"}\`

<!-- Concrete example with REAL values from the source project. The chat reads this to understand the vibe on specifics. Sections: -->

## Brief

<!-- The original brief that produced this video. Pull from BRIEF.md or logs/user-prompts.jsonl[stage=brief]. -->

## Final scenario

<!-- All clips with VO lines, durations, scene names. Pull from scenario.json. Annotate "what to notice" — why a 25-word line followed by a 1-word line lands harder than two 13-word lines, etc. -->

## Per-clip generation

<!-- For each clip: keyframe prompt, motion prompt for i2v, model used, any regeneration notes. Pull from prompts.json + scripts/. -->

## Voiceover

<!-- VO file paths, ElevenLabs voice_id used, settings, any iteration notes. -->

## Music

<!-- Track paths, source (canonical/generated), any ducking/split decisions. -->

## What I'd change next time

<!-- Optional: notes from logs/user-prompts.jsonl about what got fixed during iteration. Future-self notes. -->
`,

    "fragments.md": `# Prompt fragment library

<!-- Reusable building blocks. NOT Mad Libs blanks. These are proven phrases the chat copies/adapts. Read soviet-nostalgic/fragments.md for the structure. -->

## Style

<!-- Named style fragments (e.g. SOVIET_STYLE, MODERN_STYLE) — full prose phrases, not parameterized. -->

## Characters

<!-- Pattern + 1-2 examples from reference. Adaptation rule: "describe 2-3 features visible in ref photo, do not invent." -->

## Product

<!-- Pattern + examples. Rule: "physical material + observable properties + one analogy." -->

## Quality guards

<!-- ANATOMY, NEGATIVE_VIDEO_BASE, etc. Copied verbatim. -->

## Music

<!-- Generation prompts + negatives if applicable. If trend track is canonical, link to TEMPLATE.md Music section. -->

## Voiceover

<!-- TTS settings JSON + voice character description + writing-the-VO guidance (vibe, not exact lines). -->
`,

    "model-stack.md": `# Model stack rationale

<!-- What to use, in what order, with prices and failure modes. Read source project's logs/generations.jsonl for actual cost + endpoint data. -->

## Order of operations

\`\`\`
<!-- Numbered list with model + cost per stage -->
\`\`\`

## Per-stage rationale

<!-- For each model: why this one (vs alternatives tested), config, failure modes (what was tried that didn't work — pull from any error entries in logs and from user-prompts.jsonl where the user changed approach). -->

## Pinned versions

<!-- Library/package versions critical for reproducibility (e.g. Remotion 4.0.441). -->

## Cost estimate per video

<!-- Table from logs. -->
`,

    "composition.md": `# Remotion composition

<!-- TSX skeleton + key patterns. Read src/videos/${fromProject ?? "<source>"}/index.tsx as starting reference. -->

## Composition structure

<!-- TransitionSeries, Sequence layout, dual-music split if applicable. -->

## VO sync pattern

<!-- How VO timestamps line up with scene starts. CLIP_STARTS pattern. -->

## Music split / audio handling

<!-- Volume curves, fade frames, ducking. -->

## Quirks

<!-- Studio preview vs render differences. Bundler version pinning. -->

## TSX reference

\`\`\`tsx
// Skeleton from src/videos/${fromProject ?? "<source>"}/index.tsx
\`\`\`
`,
  };

  for (const [filename, content] of Object.entries(stubs)) {
    await fs.writeFile(path.join(templateDir, filename), content);
  }

  console.log(JSON.stringify({
    slug,
    name,
    dir: path.relative(process.cwd(), templateDir),
    extracted_from: fromProject ?? null,
    stub_files: Object.keys(stubs),
    template_json: "template.json",
    next_steps: [
      "Fill in the 5 MD files (start with reference-example.md, end with TEMPLATE.md)",
      "Update template.json: description, tags, stackSummary, assets, constants, doNotCopyLiterally",
      "Copy required assets into assets/ subdir, declare them in template.json.assets",
      `Register: npm run ralph -- template register ${slug}`,
      `Smoke-test: npm run ralph -- template use ${slug} --project test-${slug}-001 --name "Test"`,
    ],
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
