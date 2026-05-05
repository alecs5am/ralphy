import { Hono } from "hono";
import fs from "fs/promises";
import path from "path";

function safeJson(filepath: string) {
  return fs
    .readFile(filepath, "utf-8")
    .then((d) => JSON.parse(d))
    .catch(() => null);
}

async function readDir(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listFiles(
  dir: string,
  extensions?: string[],
  excludeDirs?: string[]
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, {
      withFileTypes: true,
      recursive: true,
    });
    return entries
      .filter((e) => {
        if (!e.isFile()) return false;
        if (extensions && !extensions.some((ext) => e.name.endsWith(ext))) return false;
        if (excludeDirs) {
          const parent = (e.parentPath || (e as any).path) as string;
          const rel = path.relative(dir, parent);
          if (excludeDirs.some((d) => rel === d || rel.startsWith(d + path.sep))) {
            return false;
          }
        }
        return true;
      })
      .map((e) => path.join(e.parentPath || (e as any).path, e.name));
  } catch {
    return [];
  }
}

const MEDIA_EXTS = [
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".mp4", ".mov", ".webm",
  ".mp3", ".wav", ".m4a", ".aiff", ".ogg",
  ".srt", ".vtt",
];

// Scan whole project directory for media, excluding the render output folder.
// This catches assets in non-standard subdirs (image-samples, keyframes, etc.)
// while skipping the final video under render/.
function scanProjectAssets(projectDir: string) {
  return listFiles(projectDir, MEDIA_EXTS, ["render"]);
}

export function createApiRoutes(projectRoot: string, workspace: string) {
  const app = new Hono();

  // Project root info
  app.get("/info", (c) =>
    c.json({ projectRoot, workspace, timestamp: new Date().toISOString() })
  );

  // Registry
  app.get("/registry", async (c) => {
    const reg = await safeJson(path.join(workspace, ".ralph", "registry.json"));
    return c.json(reg || { brands: {}, personas: {}, projects: {}, refs: {}, templates: {}, batches: {} });
  });

  // Projects
  app.get("/projects", async (c) => {
    const dirs = await readDir(path.join(workspace, "projects"));
    const projects = await Promise.all(
      dirs.map(async (id) => {
        const projectDir = path.join(workspace, "projects", id);
        const scenario = await safeJson(
          path.join(projectDir, "scenario.json")
        );
        const manifest = await safeJson(
          path.join(projectDir, "asset-manifest.json")
        );
        const hasRender = await fs
          .access(path.join(projectDir, "render", "final.mp4"))
          .then(() => true)
          .catch(() => false);

        // Scan asset files (entire project dir, minus render output)
        const assetFiles = await scanProjectAssets(projectDir);

        return {
          id,
          name: scenario?.metadata?.title || scenario?.name || id,
          scenario: scenario || null,
          manifest: manifest || null,
          hasRender,
          status: hasRender
            ? "done"
            : manifest
              ? "assets"
              : scenario
                ? "scenario"
                : "draft",
          assetFiles: assetFiles.map((f) => path.relative(projectRoot, f)),
          assetCount: assetFiles.length,
        };
      })
    );
    return c.json(projects);
  });

  app.get("/projects/:id", async (c) => {
    const id = c.req.param("id");
    const projectDir = path.join(workspace, "projects", id);
    const scenario = await safeJson(path.join(projectDir, "scenario.json"));
    const prompts = await safeJson(path.join(projectDir, "prompts.json"));
    const manifest = await safeJson(
      path.join(projectDir, "asset-manifest.json")
    );
    const compositionProps = await safeJson(
      path.join(projectDir, "composition-props.json")
    );
    const hasRender = await fs
      .access(path.join(projectDir, "render", "final.mp4"))
      .then(() => true)
      .catch(() => false);

    const assetFiles = await scanProjectAssets(projectDir);

    return c.json({
      id,
      scenario,
      prompts,
      manifest,
      compositionProps,
      hasRender,
      renderPath: hasRender
        ? `workspace/projects/${id}/render/final.mp4`
        : null,
      assetFiles: assetFiles.map((f) => path.relative(projectRoot, f)),
    });
  });

  // Brands
  app.get("/brands", async (c) => {
    const brandsDir = path.join(workspace, ".ralph", "brands");
    const files = await fs
      .readdir(brandsDir)
      .catch(() => [] as string[]);
    const brands = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => safeJson(path.join(brandsDir, f)))
    );
    return c.json(brands.filter(Boolean));
  });

  app.get("/brands/:id", async (c) => {
    const id = c.req.param("id");
    const brand = await safeJson(
      path.join(workspace, ".ralph", "brands", `${id}.json`)
    );
    if (!brand) return c.json({ error: "not found" }, 404);

    // Get design tokens if available
    const tokensPath = brand.tokensPath
      ? path.join(projectRoot, brand.tokensPath)
      : path.join(workspace, "references", brand.slug || id, "design-tokens.json");
    const tokens = await safeJson(tokensPath);

    // Get screenshots
    const screenshotsDir = path.join(
      workspace,
      "references",
      brand.slug || id,
      "screenshots"
    );
    const screenshots = await listFiles(screenshotsDir, [".png", ".jpg", ".webp"]);

    return c.json({
      ...brand,
      tokens,
      screenshots: screenshots.map((f) => path.relative(projectRoot, f)),
    });
  });

  // Personas
  app.get("/personas", async (c) => {
    const dir = path.join(workspace, ".ralph", "personas");
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const personas = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => safeJson(path.join(dir, f)))
    );
    return c.json(personas.filter(Boolean));
  });

  // Refs
  app.get("/refs", async (c) => {
    const dir = path.join(workspace, ".ralph", "refs");
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const refs = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => safeJson(path.join(dir, f)))
    );
    return c.json(refs.filter(Boolean));
  });

  // References (raw workspace/references directory)
  app.get("/references", async (c) => {
    const dirs = await readDir(path.join(workspace, "references"));
    const refs = await Promise.all(
      dirs.map(async (name) => {
        const refDir = path.join(workspace, "references", name);
        const tokens = await safeJson(
          path.join(refDir, "design-tokens.json")
        );
        const files = await listFiles(refDir, [
          ".png", ".jpg", ".webp", ".mp4", ".json",
        ]);
        return {
          name,
          hasTokens: !!tokens,
          fileCount: files.length,
          files: files.map((f) => path.relative(projectRoot, f)),
        };
      })
    );
    return c.json(refs);
  });

  // Batches
  app.get("/batches", async (c) => {
    const dirs = await readDir(path.join(workspace, "batches"));
    const batches = await Promise.all(
      dirs.map(async (id) => {
        const state = await safeJson(
          path.join(workspace, "batches", id, "state.json")
        );
        const config = await safeJson(
          path.join(workspace, "batches", id, "batch-config.json")
        );
        return { id, state, config };
      })
    );
    return c.json(batches);
  });

  // Templates
  app.get("/templates", async (c) => {
    const dir = path.join(workspace, "templates");
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as any[]);
    const templates = await Promise.all(
      entries.map(async (e: any) => {
        if (e.isFile() && e.name.endsWith(".json")) {
          const data = await safeJson(path.join(dir, e.name));
          if (!data) return null;
          return { ...data, id: e.name.replace(".json", ""), kind: "flat" };
        }
        if (e.isDirectory()) {
          const data = await safeJson(path.join(dir, e.name, "template.json"));
          if (!data) return null;
          return { ...data, id: e.name, kind: "dir", subKind: data.kind };
        }
        return null;
      })
    );
    return c.json(templates.filter(Boolean));
  });

  app.get("/templates/:id", async (c) => {
    const id = c.req.param("id");
    const dir = path.join(workspace, "templates");
    const dirPath = path.join(dir, id);
    const flatPath = path.join(dir, `${id}.json`);
    const dirStat = await fs.stat(dirPath).catch(() => null);
    if (dirStat?.isDirectory()) {
      const meta = await safeJson(path.join(dirPath, "template.json"));
      const docs: Record<string, string> = {};
      const docFiles = ["TEMPLATE.md", "reference-example.md", "fragments.md", "model-stack.md", "composition.md"];
      for (const f of docFiles) {
        const content = await fs.readFile(path.join(dirPath, f), "utf-8").catch(() => null);
        if (content) docs[f] = content;
      }
      const assetsDir = path.join(dirPath, "assets");
      const assetFiles = await listFiles(assetsDir, MEDIA_EXTS).catch(() => []);
      const assets = assetFiles.map((p) => path.relative(projectRoot, p));
      return c.json({ ...meta, id, kind: "dir", subKind: meta?.kind, docs, assets });
    }
    const flat = await safeJson(flatPath);
    if (flat) return c.json({ ...flat, id, kind: "flat" });
    return c.json({ error: "template not found" }, 404);
  });

  // Workspace stats
  app.get("/workspace/stats", async (c) => {
    const projectDirs = await readDir(path.join(workspace, "projects"));
    const allAssets = await listFiles(path.join(workspace, "projects"), [
      ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".mp3", ".wav", ".m4a", ".srt",
    ]);

    let totalSize = 0;
    for (const f of allAssets) {
      const stat = await fs.stat(f).catch(() => null);
      if (stat) totalSize += stat.size;
    }

    return c.json({
      projectCount: projectDirs.length,
      assetCount: allAssets.length,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
    });
  });

  return app;
}
