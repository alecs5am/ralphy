// First-class image-pack workflow tests (#429).
//
// Covers the NEW glue: the ImagePackSpec default slot sets per kind, the
// scaffold (folders + pack.json + a batch-ready prompts/pack.jsonl in the
// `generate image --batch` line shape), the `image-pack` kind probe firing on a
// scaffolded project (cli/lib/contract.ts), and the eval rubric (role-coverage
// fail on a bare pack → pass on a complete one). NO paid generation, NO model
// calls — the rubric is deterministic and the scaffold is pure filesystem.
//
// English-only-on-disk: every fixture slug / filename is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { ensureDomainContractProject } from "../helpers/domain-contract";
import {
  defaultSpecForKind,
  parseImagePackSpec,
  IMAGE_PACK_KINDS,
} from "../../cli/lib/schemas/image-pack";
import { scaffoldImagePack, scoreImagePack, readImagePack } from "../../cli/lib/image-pack";
import { evaluateContract } from "../../cli/lib/contract";
import { projectDir, resolveArtifactKindDir } from "../../cli/lib/paths";
import { readBatchJsonl } from "../../cli/lib/generate-batch";

const PROJECT = "image-pack-fixture-429";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-image-pack-429");
  ensureDomainContractProject(tmp.dir, PROJECT, "image-pack");
});

afterEach(() => {
  tmp.cleanup();
});

// ─── Default spec slot sets per kind ────────────────────────────────────────────

describe("defaultSpecForKind — slot sets per kind", () => {
  test("app-store spine: hero → feature callouts → lifestyle → dimensions → comparison → usage → cta", () => {
    const spec = defaultSpecForKind("app-store", 4);
    expect(spec.kind).toBe("app-store");
    expect(spec.aspect).toBe("9:16");
    const roles = spec.slots.map((s) => s.role);
    expect(roles[0]).toBe("hero");
    expect(roles.filter((r) => r === "feature-callout")).toHaveLength(4);
    // The fixed tail roles, in order.
    expect(roles).toContain("lifestyle");
    expect(roles).toContain("dimensions");
    expect(roles).toContain("comparison");
    expect(roles).toContain("usage");
    expect(roles[roles.length - 1]).toBe("cta");
    // hero + 4 features + 5 tail = 10.
    expect(spec.slots).toHaveLength(10);
    // Every slot carries a non-empty composition class.
    for (const s of spec.slots) expect(s.compositionClass.length).toBeGreaterThan(0);
  });

  test("play-store mirrors the app-store spine", () => {
    const app = defaultSpecForKind("app-store", 3);
    const play = defaultSpecForKind("play-store", 3);
    expect(play.kind).toBe("play-store");
    expect(play.slots.map((s) => s.role)).toEqual(app.slots.map((s) => s.role));
  });

  test("ad-creative spine: the fb-creatives A-E 5-set", () => {
    const spec = defaultSpecForKind("ad-creative", 1);
    expect(spec.kind).toBe("ad-creative");
    expect(spec.aspect).toBe("4:5");
    const roles = spec.slots.map((s) => s.role);
    expect(roles).toEqual(["real-people", "graphic", "proof", "meme", "niche"]);
    // Slot ids prefixed a1/b1/c1/d1/e1.
    expect(spec.slots.map((s) => s.id)).toEqual(["a1", "b1", "c1", "d1", "e1"]);
  });

  test("ad-creative --count repeats each of the 5 sets", () => {
    const spec = defaultSpecForKind("ad-creative", 2);
    expect(spec.slots).toHaveLength(10); // 5 sets × 2
    expect(spec.slots.map((s) => s.id)).toContain("a2");
    expect(spec.slots.map((s) => s.id)).toContain("e2");
  });

  test("social spine: cover + N feed stills", () => {
    const spec = defaultSpecForKind("social", 4);
    expect(spec.kind).toBe("social");
    expect(spec.aspect).toBe("1:1");
    expect(spec.slots[0]!.role).toBe("cover");
    expect(spec.slots.filter((s) => s.role === "feed")).toHaveLength(4);
  });

  test("count is clamped (defends against a typo'd huge fan-out)", () => {
    const huge = defaultSpecForKind("app-store", 9999);
    expect(huge.slots.filter((s) => s.role === "feature-callout").length).toBeLessThanOrEqual(8);
    const zero = defaultSpecForKind("app-store", 0);
    expect(zero.slots.filter((s) => s.role === "feature-callout").length).toBeGreaterThanOrEqual(1);
  });

  test("every default spec round-trips through parseImagePackSpec", () => {
    for (const kind of IMAGE_PACK_KINDS) {
      const spec = defaultSpecForKind(kind);
      expect(() => parseImagePackSpec(spec)).not.toThrow();
    }
  });
});

// ─── Scaffold ──────────────────────────────────────────────────────────────────

describe("scaffoldImagePack", () => {
  test("creates the folders, pack.json, and a valid batch jsonl", async () => {
    const result = await scaffoldImagePack({ projectId: PROJECT, kind: "app-store", count: 4 });
    const dir = projectDir(PROJECT);

    // Folders.
    expect(fs.existsSync(resolveArtifactKindDir(PROJECT, "images"))).toBe(true);
    expect(fs.existsSync(resolveArtifactKindDir(PROJECT, "refs"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "selected"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "prompts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "logs"))).toBe(true);

    // pack.json — valid manifest with the spec.
    const manifest = readImagePack(PROJECT);
    expect(manifest).not.toBeNull();
    expect(manifest!.kind).toBe("app-store");
    expect(manifest!.spec.slots).toHaveLength(10);

    // prompts/pack.jsonl — parses through the SAME reader generate image --batch
    // uses, one BatchItem per spec slot, each with a slot + a non-empty prompt.
    const items = await readBatchJsonl(result.promptsJsonl);
    expect(items).toHaveLength(10);
    expect(items.map((i) => i.slot)).toEqual(result.spec.slots.map((s) => s.id));
    for (const it of items) {
      expect(it.slot.length).toBeGreaterThan(0);
      expect(it.prompt.length).toBeGreaterThan(0);
    }

    // The emitted batch command targets the jsonl.
    expect(result.batchCommand).toContain("--batch prompts/pack.jsonl");
  });

  test("append-only: re-scaffold auto-versions the prior pack.json (#14)", async () => {
    await scaffoldImagePack({ projectId: PROJECT, kind: "social", count: 2 });
    const second = await scaffoldImagePack({ projectId: PROJECT, kind: "app-store", count: 4 });
    // The prior pack.json was archived, not clobbered.
    expect(second.archivedPackJson).toBeDefined();
    expect(fs.existsSync(second.archivedPackJson!)).toBe(true);
    // The live pack.json now reflects the second scaffold.
    expect(readImagePack(PROJECT)!.kind).toBe("app-store");
  });

  test("--force overwrites without archiving", async () => {
    await scaffoldImagePack({ projectId: PROJECT, kind: "social", count: 2 });
    const forced = await scaffoldImagePack({ projectId: PROJECT, kind: "app-store", count: 4, force: true });
    expect(forced.archivedPackJson).toBeUndefined();
  });

  test("the scaffolded project is typed image-pack by the contract probe", async () => {
    await scaffoldImagePack({ projectId: PROJECT, kind: "app-store", count: 4 });
    const contract = evaluateContract(PROJECT);
    expect(contract.kind).toBe("image-pack");
    // image-pack relaxes the scenario requirement — scenario.json is not missing-required.
    expect(contract.missingRequired).not.toContain("scenario.json");
  });
});

// ─── Eval rubric ────────────────────────────────────────────────────────────────

describe("scoreImagePack — the eval rubric", () => {
  test("no pack.json → a fail finding pointing at the scaffold verb", () => {
    fs.mkdirSync(projectDir(PROJECT), { recursive: true });
    const r = scoreImagePack({ projectId: PROJECT });
    expect(r.scoring.verdict).toBe("fail");
    expect(r.findings.map((f) => f.category)).toContain("image-pack.missing-spec");
  });

  test("bare pack (no generated images) → role-coverage fail", async () => {
    await scaffoldImagePack({ projectId: PROJECT, kind: "ad-creative", count: 1 });
    const r = scoreImagePack({ projectId: PROJECT });
    expect(r.expectedSlots).toBe(5);
    expect(r.coveredSlots).toBe(0);
    expect(r.scoring.verdict).toBe("fail");
    const coverage = r.findings.find((f) => f.category === "image-pack.role-coverage");
    expect(coverage).toBeDefined();
    expect(coverage!.severity).toBe("fail");
  });

  test("complete pack (every slot generated + full selected set) passes", async () => {
    const scaffold = await scaffoldImagePack({ projectId: PROJECT, kind: "ad-creative", count: 1 });
    const imagesDir = resolveArtifactKindDir(PROJECT, "images");
    const selectedDir = path.join(projectDir(PROJECT), "selected");
    // Generate a file per slot (in images/ + a curated copy in selected/).
    for (const slot of scaffold.spec.slots) {
      fs.writeFileSync(path.join(imagesDir, `${slot.id}.png`), "x");
      fs.writeFileSync(path.join(selectedDir, `${slot.id}.png`), "x");
    }
    const r = scoreImagePack({ projectId: PROJECT });
    expect(r.coveredSlots).toBe(r.expectedSlots);
    expect(r.selectedCount).toBe(r.expectedSlots);
    expect(r.scoring.verdict).toBe("pass");
    expect(r.findings).toHaveLength(0);
  });

  test("generated but selected/ empty → role coverage OK but a cohesion warn", async () => {
    const scaffold = await scaffoldImagePack({ projectId: PROJECT, kind: "ad-creative", count: 1 });
    const imagesDir = resolveArtifactKindDir(PROJECT, "images");
    for (const slot of scaffold.spec.slots) {
      fs.writeFileSync(path.join(imagesDir, `${slot.id}.png`), "x");
    }
    const r = scoreImagePack({ projectId: PROJECT });
    expect(r.coveredSlots).toBe(r.expectedSlots);
    expect(r.findings.map((f) => f.category)).not.toContain("image-pack.role-coverage");
    expect(r.findings.map((f) => f.category)).toContain("image-pack.selected-empty");
    // A warn-only pack does not fail.
    expect(r.scoring.verdict).not.toBe("fail");
  });

  test("auto-versioned / variant slot files still count as coverage", async () => {
    const scaffold = await scaffoldImagePack({ projectId: PROJECT, kind: "social", count: 1 });
    const imagesDir = resolveArtifactKindDir(PROJECT, "images");
    // cover via a re-rolled .v2; feed-01 via a -v1 variant.
    fs.writeFileSync(path.join(imagesDir, "cover.v2.png"), "x");
    fs.writeFileSync(path.join(imagesDir, "feed-01-v1.png"), "x");
    const r = scoreImagePack({ projectId: PROJECT });
    expect(r.coveredSlots).toBe(scaffold.spec.slots.length);
    expect(r.findings.map((f) => f.category)).not.toContain("image-pack.role-coverage");
  });
});
