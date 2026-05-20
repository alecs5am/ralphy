import { describe, test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import { loadTemplateManifest } from "../../cli/lib/templater/loader.ts";
import { walkRepoTemplates } from "../../scripts/migrate-templates-to-yaml.ts";
import { validateSlug } from "../../cli/lib/schemas/template.ts";

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");

describe("Template migration (02.05.04)", () => {
  test("every dir under templates/<category>/ has a template.yaml", async () => {
    let total = 0;
    let withYaml = 0;
    for await (const { dir } of walkRepoTemplates(REPO_ROOT)) {
      total += 1;
      try {
        await fs.access(path.join(dir, "template.yaml"));
        withYaml += 1;
      } catch { /* missing */ }
    }
    expect(total).toBeGreaterThan(0);
    expect(withYaml).toBe(total);
  });

  test("every template.yaml parses through the v1 loader", async () => {
    const failures: Array<{ dir: string; err: string }> = [];
    for await (const { dir, slug } of walkRepoTemplates(REPO_ROOT)) {
      try {
        const loaded = await loadTemplateManifest(dir, slug);
        if (!loaded) failures.push({ dir, err: "loader returned null" });
        else if (loaded.version !== 1) failures.push({ dir, err: `bad version ${loaded.version}` });
      } catch (e) {
        failures.push({ dir, err: (e as Error).message });
      }
    }
    if (failures.length > 0) {
      console.error("Loader failures:", failures);
    }
    expect(failures).toEqual([]);
  });
});

describe("Slug audit (02.06.02 / D-05)", () => {
  test("no shipped template carries a banned creator/brand token", async () => {
    const offenders: Array<{ slug: string; reason: string }> = [];
    for await (const { slug } of walkRepoTemplates(REPO_ROOT)) {
      const r = validateSlug(slug);
      if (!r.ok) offenders.push({ slug, reason: r.reason });
    }
    if (offenders.length > 0) {
      console.error("Slug offenders:", offenders);
    }
    expect(offenders).toEqual([]);
  });
});
