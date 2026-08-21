import { describe, expect, test } from "vitest";

import { APPROVED_CORE_SHA256, APPROVED_CORE_VERSION } from "../scripts/bundled-core.mjs";
import { createEvidenceRun, SCENARIO_INVENTORY, validateManifest } from "../scripts/instrument-evidence.mjs";

describe("final Instrument evidence", () => {
  test("locks the scenario inventory and independent Core pin", () => {
    const manifest = validateManifest(createEvidenceRun());
    expect(SCENARIO_INVENTORY).toMatchObject({ scenarios: 317, expandedCases: 1_898 });
    expect(manifest.core).toEqual({ version: APPROVED_CORE_VERSION, sha256: APPROVED_CORE_SHA256 });
  });
});
