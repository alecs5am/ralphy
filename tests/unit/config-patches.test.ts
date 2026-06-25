// Safe config patches (#491) — the CLI/agent side.
//
// Covers:
//   1. validateConfigPatchValue allowlist + per-field rules.
//   2. fold of config-events.jsonl, applyConfigPatch / rejectConfigPatch
//      (append-only), the apply re-validation gate, and effective-config fold.
// NO network, NO model calls.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import { validateConfigPatchValue, CONFIG_PATCH_FIELD_NAMES, CONFIG_EVENTS_ARTIFACT } from "../../cli/lib/schemas/config-patch.js";
import { listConfigPatches, loadConfigPatch, applyConfigPatch, rejectConfigPatch } from "../../cli/lib/config-patches.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

function seedRun(runId = "farm-1", slug = "default"): void {
  tmp = makeTmpRoot("ralphy-patch");
  const dir = workspaceDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
  fs.mkdirSync(runDir(slug, runId), { recursive: true });
  fs.writeFileSync(path.join(runDir(slug, runId), "run.json"), JSON.stringify({ version: 1, id: runId, workspace: slug, title: runId, status: "active", projectIds: [] }));
}

function propose(runId: string, patch: Record<string, unknown>, slug = "default"): void {
  fs.appendFileSync(
    path.join(runDir(slug, runId), CONFIG_EVENTS_ARTIFACT),
    JSON.stringify({ op: "propose", version: 1, kind: "config-patch", proposedAt: "2026-06-25T08:00:00.000Z", ...patch }) + "\n",
  );
}

describe("validateConfigPatchValue", () => {
  test("the allowlist is the documented set", () => {
    expect(CONFIG_PATCH_FIELD_NAMES.sort()).toEqual(
      ["approvalMode", "batchSize", "budgetCapUsd", "destinationEnabled", "gateStrictness", "modelPreference", "publishTarget", "templateChoice", "variantCount"],
    );
  });

  test("per-field rules + unknown field rejection", () => {
    expect(validateConfigPatchValue("variantCount", 3).ok).toBe(true);
    expect(validateConfigPatchValue("variantCount", 0).ok).toBe(false);
    expect(validateConfigPatchValue("budgetCapUsd", -1).ok).toBe(false);
    expect(validateConfigPatchValue("approvalMode", "approve").ok).toBe(true);
    expect(validateConfigPatchValue("approvalMode", "nope").ok).toBe(false);
    expect(validateConfigPatchValue("destinationEnabled", true).ok).toBe(false);
    expect(validateConfigPatchValue("destinationEnabled", true, "tiktok").ok).toBe(true);
    expect(validateConfigPatchValue("ad-hoc-field", 1).ok).toBe(false);
  });
});

describe("fold / apply / reject", () => {
  test("apply moves pending→applied and updates effective config", () => {
    seedRun();
    propose("farm-1", { id: "p1", field: "variantCount", value: 4 });
    expect(loadConfigPatch("farm-1", "p1")!.state).toBe("pending");

    const r = applyConfigPatch("farm-1", "p1", "ok to bump");
    expect(r.ok).toBe(true);
    const fold = listConfigPatches("farm-1");
    expect(fold.patches.find((p) => p.id === "p1")!.state).toBe("applied");
    expect(fold.effectiveConfig.variantCount).toEqual({ value: 4, target: null });
  });

  test("apply is idempotent-guarded (already applied) and reject works", () => {
    seedRun();
    propose("farm-1", { id: "p1", field: "batchSize", value: 10 });
    propose("farm-1", { id: "p2", field: "publishTarget", value: "tiktok-main" });
    expect(applyConfigPatch("farm-1", "p1").ok).toBe(true);
    expect(applyConfigPatch("farm-1", "p1").ok).toBe(false); // already applied
    expect(rejectConfigPatch("farm-1", "p2", "keep current").ok).toBe(true);
    const fold = listConfigPatches("farm-1");
    expect(fold.patches.find((p) => p.id === "p2")!.state).toBe("rejected");
    expect(fold.effectiveConfig.publishTarget).toBeUndefined();
  });

  test("apply re-validates: an out-of-range proposed value can never be applied", () => {
    seedRun();
    propose("farm-1", { id: "bad", field: "variantCount", value: 99 });
    const r = applyConfigPatch("farm-1", "bad");
    expect(r.ok).toBe(false);
    // Still pending — the invalid patch was not applied.
    expect(loadConfigPatch("farm-1", "bad")!.state).toBe("pending");
  });

  test("unknown patch id → error", () => {
    seedRun();
    expect(applyConfigPatch("farm-1", "nope").ok).toBe(false);
    expect(rejectConfigPatch("farm-1", "nope").ok).toBe(false);
  });
});
