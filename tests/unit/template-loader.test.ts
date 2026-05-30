import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  locateTemplateManifest,
  parseTemplateManifest,
  loadTemplateManifest,
  diagnoseRequiredInputs,
  findStyleTemplates,
} from "../../cli/lib/templater/loader.ts";
import type { TemplateYaml } from "../../cli/lib/schemas/template.ts";

let tmpDir = "";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-template-loader-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("Template loader (02.05.01)", () => {
  test("locateTemplateManifest prefers template.yaml over template.json", async () => {
    await fs.writeFile(path.join(tmpDir, "template.yaml"), "version: 1\nid: x");
    await fs.writeFile(path.join(tmpDir, "template.json"), "{}");
    const r = await locateTemplateManifest(tmpDir);
    expect(r?.format).toBe("yaml");
  });

  test("locateTemplateManifest falls back to template.json", async () => {
    await fs.writeFile(path.join(tmpDir, "template.json"), "{}");
    const r = await locateTemplateManifest(tmpDir);
    expect(r?.format).toBe("json");
  });

  test("locateTemplateManifest returns null when neither present", async () => {
    const r = await locateTemplateManifest(tmpDir);
    expect(r).toBeNull();
  });

  test("parseTemplateManifest accepts a valid v1 YAML", () => {
    const raw =
      "version: 1\n" +
      "id: yap-talking-head\n" +
      "kind: vibe-style\n" +
      "category: b2b-saas\n" +
      "format: video\n" +
      "name: YAP Talking-Head\n" +
      "description: single-idea direct-to-camera monologue\n";
    const parsed = parseTemplateManifest(raw, "yaml", "yap-talking-head");
    expect(parsed.version).toBe(1);
    expect(parsed.kind).toBe("vibe-style");
    expect(parsed.format).toBe("video");
  });

  test("loadTemplateManifest round-trip from disk", async () => {
    const raw =
      "version: 1\n" +
      "id: my-test\n" +
      "kind: vibe-style\n" +
      "category: b2b-saas\n" +
      "format: video\n" +
      "name: My Test\n" +
      "description: test\n";
    await fs.writeFile(path.join(tmpDir, "template.yaml"), raw);
    const loaded = await loadTemplateManifest(tmpDir);
    expect(loaded?.id).toBe("my-test");
  });

  test("loadTemplateManifest returns null for empty dir", async () => {
    const loaded = await loadTemplateManifest(tmpDir);
    expect(loaded).toBeNull();
  });

  test("diagnoseRequiredInputs reports the first missing requirement", () => {
    const tmpl: TemplateYaml = {
      version: 1 as const,
      id: "x",
      aliases: [],
      kind: "vibe-style" as const,
      category: "b2b-saas" as const,
      format: "video" as const,
      name: "x",
      description: "x",
      tags: [],
      requires: { brand: true, persona: true, refs: 1 },
      scenes: [],
      references: [],
    };
    const r1 = diagnoseRequiredInputs(tmpl, {});
    expect(r1?.requirement).toBe("brand");
    const r2 = diagnoseRequiredInputs(tmpl, { brand: "acme" });
    expect(r2?.requirement).toBe("persona");
    const r3 = diagnoseRequiredInputs(tmpl, { brand: "acme", persona: "p" });
    expect(r3?.requirement).toContain("ref");
    const r4 = diagnoseRequiredInputs(tmpl, { brand: "acme", persona: "p", refCount: 1 });
    expect(r4).toBeNull();
  });

  test("findStyleTemplates returns children pointing at the general slug (052)", () => {
    const mk = (id: string, style_of?: string): TemplateYaml => ({
      version: 1,
      id,
      aliases: [],
      kind: "vibe-style",
      category: "b2b-saas",
      format: "video",
      style_of,
      name: id,
      description: id,
      tags: [],
      requires: {},
      scenes: [],
      references: [],
    });
    const all = [mk("general-video"), mk("style-a", "general-video"), mk("style-b", "general-video"), mk("loner")];
    const styles = findStyleTemplates("general-video", all);
    expect(styles.map((t) => t.id).sort()).toEqual(["style-a", "style-b"]);
    expect(findStyleTemplates("loner", all)).toEqual([]);
  });
});
