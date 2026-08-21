import { describe, expect, test } from "vitest";

import { auditMarketplaceInstrument } from "../scripts/audit-marketplace-instrument.mjs";

describe("Marketplace Instrument source guard", () => {
  test("keeps every reachable Marketplace surface flat, tokenized, and registry-owned", async () => {
    const result = await auditMarketplaceInstrument();
    expect(result.violations).toEqual([]);
    expect(result.files).toEqual(expect.arrayContaining([
      "src/screens/MarketplaceScreen.tsx",
      "src/screens/marketplace/MarketplaceWorkflows.tsx",
      "src/styles/marketplace.css",
    ]));
  });
});
