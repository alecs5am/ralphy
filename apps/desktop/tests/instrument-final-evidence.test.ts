import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { APPROVED_CORE_SHA256, APPROVED_CORE_VERSION } from "../scripts/bundled-core.mjs";
import {
  createEvidenceRun,
  initializeEvidenceBundle,
  SCENARIO_INVENTORY,
  updateEvidenceBundle,
  validateManifest,
} from "../scripts/instrument-evidence.mjs";

describe("final Instrument evidence", () => {
  test("locks the scenario inventory and independent Core pin", () => {
    const manifest = validateManifest(createEvidenceRun());
    expect(SCENARIO_INVENTORY).toMatchObject({ scenarios: 317, expandedCases: 1_898 });
    expect(manifest.core).toEqual({ version: APPROVED_CORE_VERSION, sha256: APPROVED_CORE_SHA256 });
  });

  test("re-recording a launch, capture and journey replaces it so an audit can run twice", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "instrument-evidence-")), "manifest.json");
    const launch = { id: "production-instrument-final", mode: "production", dbRecord: "/db/production.json", maxActiveInstances: 1, activeInstancesAfterRun: 0 };
    const capture = { label: "production Media", theme: "dark", viewport: "1440x900", path: "/final/production/media-dark-1440x900.png" };
    const journey = { id: "production-keyboard", mode: "production", value: { focusReturned: true } };
    let manifest = await initializeEvidenceBundle({}, path);
    for (const pass of [1, 2]) {
      for (const update of [
        { type: "record-launch", value: { ...launch, shmChanged: pass === 2 } },
        { type: "record-capture", value: { ...capture, viewport: pass === 2 ? "1280x800" : capture.viewport } },
        { type: "record-journey", value: { ...journey, value: { focusReturned: pass === 2 } } },
      ]) {
        manifest = await updateEvidenceBundle(path, manifest.revision, update);
      }
    }
    expect(manifest.launches).toEqual([{ ...launch, shmChanged: true }]);
    expect(manifest.captures).toEqual([{ ...capture, viewport: "1280x800" }]);
    expect(manifest.journeys).toEqual([{ ...journey, value: { focusReturned: true } }]);
  });
});
