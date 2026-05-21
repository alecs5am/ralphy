// HyperFrames render adapter — invokes `bunx hyperframes render <dir>` against
// a workspace project that ships an `index.html` (+ optional `meta.json` +
// `compositions/`) at its root.
//
// HyperFrames is now the default render engine (default engine flag in
// `cli/commands/render.ts`). Remotion remains as a fallback for legacy projects
// authored under `src/videos/` + `composition-props.json`.
//
// See:
// - https://hyperframes.heygen.com/
// - https://github.com/heygen-com/hyperframes
// - docs/playbooks/hyperframes.md (project playbook)
// - .agents/skills/hyperframes/ (skill body — install via `bunx hyperframes skills`)

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type HyperframesRenderArgs = {
  /** Absolute path to the HyperFrames project dir (has `index.html`). */
  projectDir: string;
  /** Absolute output mp4 path. */
  outputPath: string;
  /** Optional composition file relative to projectDir (e.g. `compositions/intro.html`). Defaults to `index.html`. */
  composition?: string;
  /** Optional fps override. */
  fps?: number;
  /** Optional quality preset. */
  quality?: "draft" | "standard" | "high";
  /** Optional output format. */
  format?: "mp4" | "webm" | "mov" | "png-sequence";
  /** Optional resolution preset (e.g. `portrait`, `landscape`, `1080p`). */
  resolution?: string;
  /** Optional variables JSON object — merged over composition defaults. */
  variables?: Record<string, unknown>;
  /** Suppress noisy hyperframes log lines. */
  quiet?: boolean;
};

export type HyperframesRenderResult = {
  exitCode: number;
  stderr: string;
};

/** Heuristic: does this project ship a HyperFrames composition at its root? */
export function looksLikeHyperframesProject(projectDir: string): boolean {
  return existsSync(path.join(projectDir, "index.html"));
}

export async function runHyperframesRender(
  args: HyperframesRenderArgs,
): Promise<HyperframesRenderResult> {
  const argv: string[] = ["hyperframes", "render", args.projectDir, "--output", args.outputPath];

  if (args.composition) {
    argv.push("--composition", args.composition);
  }
  if (args.fps !== undefined) {
    argv.push("--fps", String(args.fps));
  }
  if (args.quality) {
    argv.push("--quality", args.quality);
  }
  if (args.format) {
    argv.push("--format", args.format);
  }
  if (args.resolution) {
    argv.push("--resolution", args.resolution);
  }
  if (args.variables && Object.keys(args.variables).length > 0) {
    argv.push("--variables", JSON.stringify(args.variables));
  }
  if (args.quiet) {
    argv.push("--quiet");
  }

  return new Promise((resolve) => {
    const proc = spawn("bunx", argv, {
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (c) => {
      const chunk = c.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}
