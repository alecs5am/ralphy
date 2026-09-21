import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { auditMarketplaceInstrument } from "../scripts/audit-marketplace-instrument.mjs";
import { INSTRUMENT_MEDIA_SOURCE_SHA256, isVerifiedMediaSource } from "../scripts/instrument-media-sources.mjs";

describe("Marketplace Instrument source guard", () => {
  test("allows only byte-verified authored media and rejects changed or relocated copies", () => {
    for (const file of Object.keys(INSTRUMENT_MEDIA_SOURCE_SHA256)) {
      const source = readFileSync(file, "utf8");
      expect(isVerifiedMediaSource(file, source), file).toBe(true);
      expect(isVerifiedMediaSource(file, `${source}\n/* modified */`)).toBe(false);
      expect(isVerifiedMediaSource("src/pages/marketplace/ui/Other.tsx", source)).toBe(false);
    }
  });
  test("keeps every reachable Marketplace surface flat, tokenized, and registry-owned", async () => {
    const result = await auditMarketplaceInstrument();
    expect(result.violations).toEqual([]);
    // The shared detail vocabulary now carries the surfaces and inks these routes draw, so the
    // raw-colour, depth-effect and legacy-token scans have to see it too. The stylesheet is still
    // audited: it keeps the rules that style elements this area does not own.
    expect(result.files).toEqual(expect.arrayContaining([
      "src/pages/marketplace/ui/MarketplaceScreen.tsx",
      "src/pages/marketplace/ui/MarketplaceWorkflows.tsx",
      "src/pages/marketplace/lib/detail-chrome.ts",
      "src/app/styles/marketplace.css",
    ]));
  });
});
