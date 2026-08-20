import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REFERENCE_SHA256,
  prepareInstrumentEvidence,
} from "../scripts/prepare-instrument-evidence.mjs";

describe("instrument design reference", () => {
  it("pins and prepares the authoritative media handoff", async () => {
    expect(REFERENCE_SHA256).toBe("fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804");
    expect(await prepareInstrumentEvidence()).toMatchObject({
      readme: expect.stringContaining("design_handoff_instrument/README.md"),
      mediaSections: ["3a", "3b"],
    });
    expect(readFileSync(".gitignore", "utf8")).toContain(".superpowers/sdd/nothing-instrument/");
  });
});
