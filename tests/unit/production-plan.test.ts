// Production-plan builder + `ralphy project plan` tests (#407).
//
// The plan is the contract phase-7 artifact (`PRODUCTION_PLAN.md`, see
// `cli/lib/contract.ts` + `docs/playbooks/agent-production-contract.md`). The
// builder turns a brief into a schema-valid ProductionPlan: deterministic
// content-mode + template match + cost estimate in-process, LLM enrichment
// injected. Tests STUB the enrichment fn (no live network, no mock.module on a
// shared lib — #072) and assert the four issue brief types route differently.
//
// English-only-on-disk: every fixture brief / slug is plain English; the
// "no-template freeform" case uses an off-domain English string (the worked
// pattern from template-suggest.test.ts), not a Russian utterance.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { ensureDomainContractProject, setDomainContractDocumentStage } from "../helpers/domain-contract";
import { buildProductionPlan } from "../../cli/lib/plan/build";
import {
  parseProductionPlan,
  type LlmEnrichment,
} from "../../cli/lib/schemas/production-plan";
import type { Candidate } from "../../cli/lib/templater/suggest";
import { projectDir } from "../../cli/lib/paths";
import { evaluateContract } from "../../cli/lib/contract";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// A compact two-tier-ish catalog the ranker scores against. Each carries a
// `format` in meta (the suggest results pass it through to formatTemplate).
const CANDIDATES: Candidate[] = [
  {
    slug: "unboxing-general",
    name: "Unboxing General",
    description: "A creator unboxing / first-impressions UGC video revealing a product from its packaging.",
    tags: ["unboxing", "reveal", "first-impressions", "ugc", "video"],
    doc: "",
    meta: { source: "public", kind: "template", format: "video" },
  },
  {
    slug: "broadcast-caught-on-tv-square",
    name: "Broadcast Caught-on-TV (Square)",
    description: "Square 1:1 caught-on-live-broadcast realism — audience-cam reaction beat.",
    tags: ["broadcast", "sports", "square", "audience-cam", "video"],
    doc: "",
    meta: { source: "public", kind: "template", format: "video" },
  },
  {
    slug: "clean-dtc-product-shot",
    name: "Clean DTC Product Shot",
    description: "A clean studio still of a product on a controlled background — e-commerce hero.",
    tags: ["product-shot", "studio", "e-commerce", "still", "image"],
    doc: "",
    meta: { source: "public", kind: "template", format: "image" },
  },
];

// A canned enrichment payload — what a stubbed LLM returns. Valid against
// LlmEnrichmentSchema.
function cannedEnrichment(over: Partial<LlmEnrichment> = {}): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "photoreal UGC selfie",
    sceneCount: 6,
    durationSec: 30,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "fast, authentic, scroll-stopping",
    ...over,
  };
}

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-plan-407");
});
afterEach(() => {
  tmp.cleanup();
});

// ─── buildProductionPlan — the four brief types ─────────────────────────────

describe("buildProductionPlan — brief routing", () => {
  test("(a) minimal brief: low-detail still yields a schema-valid plan", async () => {
    const enrich = async () => cannedEnrichment({ sceneCount: 4, durationSec: 20 });
    const { plan } = await buildProductionPlan(
      { projectId: "plan-minimal", brief: "make me a short video" },
      { candidates: CANDIDATES, enrich },
    );
    // Always schema-valid.
    expect(() => parseProductionPlan(plan)).not.toThrow();
    expect(plan.projectId).toBe("plan-minimal");
    // A vague brief shouldn't confidently lock a content mode → ambiguous / null.
    expect(plan.contentMode.mode === null || plan.contentMode.ambiguous).toBe(true);
    // Enrichment fields flow through.
    expect(plan.sceneCount).toBe(4);
    expect(plan.durationSec).toBe(20);
    // A video stack carries a video + VO model.
    expect(plan.modelStack.some((m) => m.role === "video")).toBe(true);
    expect(plan.estimate.costHighUsd).toBeGreaterThanOrEqual(plan.estimate.costLowUsd);
  });

  test("(b) URL/brand brief: classifies an ad pack + carries required refs", async () => {
    const enrich = async () => cannedEnrichment({ sceneCount: 1, durationSec: 0 });
    const { plan } = await buildProductionPlan(
      {
        projectId: "plan-brand",
        brief: "make a set of facebook creatives / ad pack for acme.example.com cold traffic",
      },
      { candidates: CANDIDATES, enrich },
    );
    expect(() => parseProductionPlan(plan)).not.toThrow();
    // ad-creative-pack mode → fb-creatives craft overlay + brand-ref requirement.
    expect(plan.contentMode.mode).toBe("ad-creative-pack");
    expect(plan.craftOverlay).toContain("fb-creatives");
    expect(plan.requiredRefs.length).toBeGreaterThan(0);
    // No video model in an image/fb-creative stack.
    expect(plan.modelStack.some((m) => m.role === "video")).toBe(false);
  });

  test("(c) remix/template brief: names a template kind → matched template, video stack", async () => {
    const enrich = async () => cannedEnrichment();
    const { plan } = await buildProductionPlan(
      { projectId: "plan-remix", brief: "an unboxing video for my new skincare product" },
      { candidates: CANDIDATES, enrich },
    );
    expect(() => parseProductionPlan(plan)).not.toThrow();
    // The unboxing template should win and be recorded with a non-null slug.
    expect(plan.formatTemplate.templateSlug).toBe("unboxing-general");
    expect(plan.formatTemplate.format).toBe("video");
    expect(plan.formatTemplate.source).not.toBe("freeform");
    expect(plan.formatTemplate.confidence).toBeGreaterThan(0);
    // unboxing-ugc content mode + craft overlay.
    expect(plan.contentMode.mode).toBe("unboxing-ugc");
    expect(plan.craftOverlay).toContain("ugc-unboxing");
  });

  test("(d) no-template freeform brief: off-domain string → freeform, null template", async () => {
    const enrich = async () => cannedEnrichment();
    const { plan } = await buildProductionPlan(
      { projectId: "plan-freeform", brief: "crispy midnight bleachers vibe with quiet rivers" },
      { candidates: CANDIDATES, enrich },
    );
    expect(() => parseProductionPlan(plan)).not.toThrow();
    // Nothing scores above the weak floor → freeform.
    expect(plan.formatTemplate.templateSlug).toBeNull();
    expect(plan.formatTemplate.source).toBe("freeform");
    expect(plan.formatTemplate.confidence).toBe(0);
  });

  test("content_mode differs appropriately across the four briefs", async () => {
    const enrich = async () => cannedEnrichment();
    const [minimal, brand, remix, freeform] = await Promise.all([
      buildProductionPlan({ projectId: "m", brief: "make me a short video" }, { candidates: CANDIDATES, enrich }),
      buildProductionPlan({ projectId: "b", brief: "make a set of facebook creatives ad pack for acme.example.com" }, { candidates: CANDIDATES, enrich }),
      buildProductionPlan({ projectId: "r", brief: "an unboxing video for my skincare product" }, { candidates: CANDIDATES, enrich }),
      buildProductionPlan({ projectId: "f", brief: "crispy midnight bleachers vibe" }, { candidates: CANDIDATES, enrich }),
    ]);
    // Brand → ad-creative-pack, remix → unboxing-ugc; minimal/freeform don't lock a confident mode.
    expect(brand.plan.contentMode.mode).toBe("ad-creative-pack");
    expect(remix.plan.contentMode.mode).toBe("unboxing-ugc");
    expect(brand.plan.contentMode.mode).not.toBe(remix.plan.contentMode.mode);
    // template-match behavior differs: remix matches, freeform does not.
    expect(remix.plan.formatTemplate.templateSlug).not.toBeNull();
    expect(freeform.plan.formatTemplate.templateSlug).toBeNull();
  });

  test("malformed LLM enrichment falls back to heuristics (never throws)", async () => {
    const enrich = async () => ({ totally: "wrong shape", sceneCount: "not-a-number" });
    const { plan } = await buildProductionPlan(
      { projectId: "plan-bad-llm", brief: "an unboxing video for my product" },
      { candidates: CANDIDATES, enrich },
    );
    expect(() => parseProductionPlan(plan)).not.toThrow();
    // Heuristic video default: 5 scenes / 25s.
    expect(plan.sceneCount).toBe(5);
    expect(plan.durationSec).toBe(25);
  });

  test("no enrich fn (offline) uses deterministic heuristics", async () => {
    const { plan } = await buildProductionPlan(
      { projectId: "plan-offline", brief: "a clean studio product shot on white" },
      { candidates: CANDIDATES },
    );
    expect(() => parseProductionPlan(plan)).not.toThrow();
    // product-shot → image format → still heuristic (1 scene, 0s).
    expect(plan.formatTemplate.format).toBe("image");
    expect(plan.sceneCount).toBe(1);
    expect(plan.durationSec).toBe(0);
  });
});

// ─── CLI verb: writes both artifacts + auto-versions ─────────────────────────

// Point the library at an empty file:// doc so the subprocess never hits the
// network; --no-llm keeps the run deterministic (no fetch needed at all).
function writeEmptyLibrary(dir: string): string {
  const libPath = path.join(dir, "library.json");
  fs.writeFileSync(
    libPath,
    JSON.stringify({ schemaVersion: 1, formats: [], units: [], blocks: [], blueprints: [] }),
  );
  return `file://${libPath}`;
}

function runPlan(rootDir: string, libUrl: string, args: string[]) {
  return spawnSync("bun", ["run", CLI, "--cwd", rootDir, "--json", "project", "plan", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, RALPHY_LIBRARY_URL: libUrl },
  });
}

describe("ralphy project plan (CLI smoke, --no-llm deterministic)", () => {
  const PROJECT = "plan-cli-407";
  let projectId: string;
  let workspaceId: string;

  function seedProject(rootDir: string) {
    const project = ensureDomainContractProject(rootDir, PROJECT);
    projectId = project.projectId;
    workspaceId = project.workspaceId;
    const regPath = path.join(rootDir, ".ralphy", "registry.json");
    fs.writeFileSync(
      regPath,
      JSON.stringify({ projects: { [projectId]: { id: projectId, name: "Plan CLI", workspace: workspaceId } } }),
    );
    fs.mkdirSync(projectDir(projectId), { recursive: true });
  }

  test("writes PRODUCTION_PLAN.md + production-plan.json (schema-valid)", () => {
    seedProject(tmp.dir);
    const libUrl = writeEmptyLibrary(tmp.dir);
    const r = runPlan(tmp.dir, libUrl, [projectId, "--brief", "an unboxing video for my product", "--no-llm"]);
    expect(r.status, r.stderr).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.project).toBe(projectId);
    // Both artifacts on disk.
    const mdPath = path.join(projectDir(projectId), "PRODUCTION_PLAN.md");
    const jsonPath = path.join(projectDir(projectId), "production-plan.json");
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);
    // The written JSON is schema-valid.
    const written = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(() => parseProductionPlan(written)).not.toThrow();
    // The md mentions the contract phase + the brief.
    const md = fs.readFileSync(mdPath, "utf8");
    expect(md).toContain("Production Plan");
    expect(md).toContain("unboxing video for my product");
    // Content mode resolves to unboxing without an LLM (classifier is keyword-only).
    expect(written.contentMode.mode).toBe("unboxing-ugc");
  });

  test("satisfies the contract phase-7 presence check", () => {
    seedProject(tmp.dir);
    const libUrl = writeEmptyLibrary(tmp.dir);
    // Seed the prior required artifact so phase-7 is the next gap.
    fs.writeFileSync(path.join(projectDir(projectId), "BRIEF.md"), "# brief\n");
    runPlan(tmp.dir, libUrl, [projectId, "--brief", "a clean product shot", "--no-llm"]);
    setDomainContractDocumentStage(
      tmp.dir,
      projectId,
      "production-plan",
      JSON.parse(fs.readFileSync(path.join(projectDir(projectId), "production-plan.json"), "utf8")),
      "awaiting-approval",
    );
    // Query the filesystem contract directly; entity `project status` owns a
    // separate database-derived surface.
    const ledger = evaluateContract(projectId);
    const plan = ledger.phases.find((p: any) => p.id === "production-plan");
    expect(plan.present).toBe(true);
    expect(plan.satisfied).toBe(true);
    expect(ledger.missingRequired).not.toContain("PRODUCTION_PLAN.md");
  });

  test("second plan auto-versions (preserves the first as .v1) and never overwrites", () => {
    seedProject(tmp.dir);
    const libUrl = writeEmptyLibrary(tmp.dir);
    const mdPath = path.join(projectDir(projectId), "PRODUCTION_PLAN.md");
    const jsonPath = path.join(projectDir(projectId), "production-plan.json");

    const r1 = runPlan(tmp.dir, libUrl, [projectId, "--brief", "an unboxing video for my product", "--no-llm"]);
    expect(r1.status).toBe(0);
    const firstMd = fs.readFileSync(mdPath, "utf8");
    const firstJson = fs.readFileSync(jsonPath, "utf8");

    const r2 = runPlan(tmp.dir, libUrl, [projectId, "--brief", "a clean studio product shot on white", "--no-llm"]);
    expect(r2.status).toBe(0);

    // protectExistingAsset archives the EXISTING file to .v1 (then .v2, …) on
    // the first regen — so the first plan now lives at .v1, untouched.
    const archivedMd = path.join(projectDir(projectId), "PRODUCTION_PLAN.v1.md");
    const archivedJson = path.join(projectDir(projectId), "production-plan.v1.json");
    expect(fs.existsSync(archivedMd)).toBe(true);
    expect(fs.existsSync(archivedJson)).toBe(true);
    expect(fs.readFileSync(archivedMd, "utf8")).toBe(firstMd);
    expect(fs.readFileSync(archivedJson, "utf8")).toBe(firstJson);

    // The live files now hold the SECOND plan (different brief → product-shot).
    const liveJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(liveJson.formatTemplate.format).toBe("image");
    expect(fs.readFileSync(jsonPath, "utf8")).not.toBe(firstJson);
  });
});
