// `ralphy clone <url-or-ref>` — front-stage style-clone verb (01.01.03).
//
// Thin wrapper that chains four existing back-stage verbs:
//   1. ref pull           — yt-dlp into workspace/references/<slug>/
//   2. ref frames         — sample keyframes
//   3. ref analyze        — vision LLM over frames → analysis.json
//   4. ref blueprint      — synthesize blueprint.md
// then writes a new vibe-style template under workspace/templates/<id>/.
//
// Acceptance (01.01.03):
//   • URL or registered ref slug both work; slug skips the pull step.
//   • --strict-look mirrors palette / grading / hook.
//   • --prompt-only skips music / voice extraction.
//   • --as-template <id> overrides the default derived id.
//   • Exit JSON: { template_id, source_url, blueprint_path }.

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { workspace } from "../lib/paths.js";
import {
  pullReference,
  sampleFrames,
  analyzeFrames,
  synthesizeBlueprint,
  audioDescribeRef,
  refPaths,
  slugFromUrl,
} from "../lib/research.js";

function refDirExists(slug: string): boolean {
  return fs.existsSync(refPaths(slug).dir);
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Build the "lift the style of a public clip → vibe-style template" verb.
 * Exported as the underlying builder so the same logic can mount as both
 * `ralphy clone` (deprecation alias) and `ralphy template clone` (canonical).
 *
 * #030: the verb was renamed to remove the name collision with `voice clone`
 * (Instant Voice Cloning) — agents kept conflating "clone this video's style"
 * with "clone this person's voice". The deprecation alias emits a stderr
 * warning + remains in place for one release.
 */
export function buildCloneCommand(name: string, opts?: { deprecated?: boolean }): Command {
  const cmd = new Command(name)
    .argument("<url-or-ref>", "Public source URL (TikTok / Reels / Shorts / X) OR a registered ref slug")
    .description(
      "Lift the style of a public clip into a reusable vibe-style template. Chains ref pull → frames → analyze → blueprint → template create.",
    )
    .option("--as-template <id>", "Output template id (default: derived from source slug)")
    .option("--strict-look", "Mirror palette + grading + hook in the blueprint")
    .option("--prompt-only", "Skip music / voice extraction (faster; visual prompts only)")
    .option(
      "--analyze-model <id>",
      "Vision model id for frame analysis (default google/gemini-2.5-flash)",
    )
    .action(async (input: string, opts) => {
      if ((cmd as Command & { _deprecated?: boolean })._deprecated) {
        // eslint-disable-next-line no-console
        console.error(
          "ralphy: `ralphy clone` is deprecated — use `ralphy template clone` instead (renamed to remove the name collision with `ralphy voice clone`). The old verb will be removed in the next minor release.",
        );
      }
      // 1. Pull (or detect existing slug)
      let slug: string;
      let sourceUrl: string | null = null;
      if (isUrl(input)) {
        sourceUrl = input;
        const r = await pullReference({ url: input }).catch((e: Error) => {
          raiseError("E_PROVIDER_HTTP", { provider: "yt-dlp", status: 0, detail: e.message });
        });
        slug = (r as { slug: string }).slug;
        ok(`Pulled ${slug}`);
      } else {
        slug = input;
        if (!refDirExists(slug)) {
          raiseError("E_NOT_FOUND", { kind: "Reference", id: slug });
        }
      }

      // 2. Sample frames
      await sampleFrames({ slug }).catch((e: Error) => {
        raiseError("E_INTERNAL", { detail: `frames sampling failed: ${e.message}` });
      });

      // 3. Analyze frames (vision LLM)
      const analyzePrompt = opts.strictLook
        ? "Extract a strict-look blueprint emphasizing palette, color grading, hook composition, and shot list."
        : undefined;
      await analyzeFrames({ slug, prompt: analyzePrompt, model: opts.analyzeModel }).catch(
        (e: Error) => {
          raiseError("E_PROVIDER_HTTP", { provider: "OpenRouter", status: 0, detail: e.message });
        },
      );

      // 4. Audio describe (skipped with --prompt-only)
      if (!opts.promptOnly) {
        try {
          await audioDescribeRef({ slug });
        } catch {
          // Best-effort: a failed audio pass doesn't kill the clone — the
          // blueprint can still be built from visuals + transcript.
        }
      }

      // 5. Blueprint
      const blueprint = await synthesizeBlueprint(slug).catch((e: Error) => {
        raiseError("E_INTERNAL", { detail: `blueprint failed: ${e.message}` });
      });

      // 6. Template scaffold (we write the template dir directly rather than
      // shelling out to `template create` — that command's API is more about
      // brand/persona templates, not vibe-style clone templates).
      const templateId = (opts.asTemplate as string | undefined) ?? `clone-${slug}`;
      const templateDir = path.join(workspace(), "templates", templateId);
      if (fs.existsSync(templateDir)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Template", id: templateId });
      }
      fs.mkdirSync(templateDir, { recursive: true });
      const blueprintPath = (blueprint as { path: string }).path;
      fs.copyFileSync(blueprintPath, path.join(templateDir, "composition.md"));
      const manifest = {
        version: 1,
        kind: "vibe-style",
        slug: templateId,
        source_slug: slug,
        source_url: sourceUrl,
        strict_look: !!opts.strictLook,
        prompt_only: !!opts.promptOnly,
        created_at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(templateDir, "template.yaml"), yamlify(manifest));

      out({
        template_id: templateId,
        source_url: sourceUrl,
        source_slug: slug,
        blueprint_path: blueprintPath,
        template_dir: templateDir,
      });
    });
  const prefix = name === "clone" ? "ralphy clone" : "ralphy template clone";
  cmd.addHelpText(
    "after",
    `
Examples:
  ${prefix} https://tiktok.com/@x/video/72939...
  ${prefix} https://www.instagram.com/reel/Cabc123 --as-template winter-vibe-002
  ${prefix} existing-ref-slug --strict-look --prompt-only
`,
  );
  if (opts?.deprecated) {
    (cmd as Command & { _deprecated?: boolean })._deprecated = true;
  }
  return cmd;
}

/**
 * Deprecation alias mounted as `ralphy clone`. Will be removed in the next
 * minor release; users should switch to `ralphy template clone` (#030).
 */
export function cloneCmd(): Command {
  return buildCloneCommand("clone", { deprecated: true });
}

/** Canonical mount: `ralphy template clone`. */
export function templateCloneCmd(): Command {
  return buildCloneCommand("clone");
}

/** Minimal YAML serializer (flat key:value + booleans + nulls). Avoids a yaml dep. */
function yamlify(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) lines.push(`${k}: null`);
    else if (typeof v === "boolean") lines.push(`${k}: ${v}`);
    else if (typeof v === "number") lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  return lines.join("\n") + "\n";
}

// Re-export the URL-slug helper for symmetry with `ref pull`'s implicit derivation.
export { slugFromUrl };
