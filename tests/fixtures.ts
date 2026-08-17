import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface LibraryFixture {
  parentPath: string;
  rootPath: string;
  alphaPath: string;
  betaPath: string;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function makeLibraryFixture(): Promise<LibraryFixture> {
  const parentPath = await mkdtemp(join(tmpdir(), "ralphy-desktop-"));
  const rootPath = join(parentPath, ".ralphy");
  const workspacePath = join(rootPath, "workspaces", "studio");
  const alphaPath = join(workspacePath, "projects", "alpha-001");
  const betaPath = join(workspacePath, "projects", "beta-001");

  await mkdir(join(alphaPath, "artifacts", "images", "deep"), { recursive: true });
  await mkdir(join(alphaPath, "artifacts", "refs"), { recursive: true });
  await mkdir(join(alphaPath, "units", "hero"), { recursive: true });
  await mkdir(join(alphaPath, "render"), { recursive: true });
  await mkdir(join(alphaPath, "logs"), { recursive: true });
  await mkdir(join(alphaPath, "scripts"), { recursive: true });
  await mkdir(join(betaPath, "artifacts", "videos"), { recursive: true });
  await mkdir(join(workspacePath, "shared", "brands"), { recursive: true });

  await writeJson(join(rootPath, "registry.json"), {
    projects: {
      "alpha-001": {
        id: "alpha-001",
        workspace: "studio",
        name: "Alpha Launch",
        brief: "Launch the alpha product",
        status: "assets",
        platform: "tiktok",
        aspectRatio: "9:16",
      },
      "beta-001": {
        id: "beta-001",
        workspace: "studio",
        name: "Beta Launch",
        status: "draft",
      },
    },
  });
  await writeJson(join(workspacePath, "workspace.json"), {
    name: "Studio",
    slug: "studio",
    description: "Launch workspace",
    created: "2026-07-01T00:00:00.000Z",
  });
  await writeJson(join(alphaPath, "production-plan.json"), {
    phase: "production",
    platform: "instagram",
    aspect: "4:5",
  });
  await writeJson(join(alphaPath, "asset-manifest.json"), { version: 1, slots: {} });

  await writeFile(join(alphaPath, "BRIEF.md"), "# Alpha\n");
  await writeFile(join(alphaPath, "index.html"), "<main>Alpha</main>\n");
  await writeFile(join(alphaPath, "artifacts", "images", "hero.png"), "png");
  await writeFile(join(alphaPath, "artifacts", "images", "deep", "detail.jpg"), "jpg");
  await writeFile(join(alphaPath, "artifacts", "refs", "mood.jpg"), "jpg");
  await writeFile(join(alphaPath, "units", "hero", "cut.mp4"), "mp4");
  await writeFile(join(alphaPath, "render", "final.mp4"), "mp4");
  await writeFile(join(alphaPath, "scripts", "compose.ts"), "export {};\n");
  await writeFile(join(alphaPath, "misc.bin"), "bin");
  await writeFile(join(betaPath, "artifacts", "videos", "beta.mp4"), "mp4");

  await writeFile(
    join(alphaPath, "logs", "generations.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-07-29T10:00:00.000Z",
        provider: "openrouter",
        model: "openai/gpt-image",
        endpoint: "openrouter/images",
        kind: "image",
        input: { slot: "hero" },
        output: { local: "artifacts/images/hero.png" },
        status: "ok",
        cost_usd: 0.25,
      }),
      "{malformed",
      JSON.stringify({
        timestamp: "2026-07-29T10:01:00.000Z",
        provider: "other",
        endpoint: "legacy-video",
        kind: "video",
        slot: "final",
        output: { local: "render/final.mp4" },
        status: "ok",
        costUsd: 0.75,
      }),
      JSON.stringify({
        timestamp: "2026-07-29T10:02:00.000Z",
        provider: "other",
        endpoint: "bad-cost",
        kind: "other",
        status: "ok",
        cost_usd: "not-a-number",
      }),
      "",
    ].join("\n"),
  );

  await symlink(alphaPath, join(alphaPath, "artifacts", "images", "deep", "loop"));

  return { parentPath, rootPath, alphaPath, betaPath };
}
