// Claims & policy gate (#442).
//
// Fixtures inject a STUBBED claim EXTRACTOR returning canned claims — NO paid
// generation, NO network. The deterministic policy classifier (category +
// severity + supported-vs-unsupported) runs for real, since it is the
// load-bearing BLOCK logic. The issue's three fixtures are exercised:
//   1. allowed     — a claim backed by the product facts → pass, blocksShip:false.
//   2. unsupported — a claim not backed by facts → warn/fail finding.
//   3. prohibited  — a high-risk (health/financial/absolute) unsupported claim →
//                    fail + blocksShip:true.
//   + proof-supplied unblocks an otherwise-blocking high-risk claim.
// Plus: the non-commercial pass-through, the deterministic classifier units, and
// CLM-prefixed finding ids. English-only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  checkClaims,
  classifyClaimCategory,
  isClaimSupported,
  type ClaimsExtractor,
  type ExtractedClaim,
} from "../../cli/lib/eval/claims";
import { ProductBrandFactsSchema } from "../../cli/lib/schemas/research-facts";

/** Build a stubbed extractor returning the given canned claims (NO model call). */
function stubExtractor(...claims: ExtractedClaim[]): ClaimsExtractor {
  return async () => claims;
}

function facts(productFacts: string[], proofPoints: string[] = []) {
  return ProductBrandFactsSchema.parse({ productFacts, proofPoints });
}

const COMMERCIAL = "ugc-review";

describe("classifyClaimCategory — deterministic keyword classifier", () => {
  test("health / financial / warranty / comparative families map correctly", () => {
    expect(classifyClaimCategory("clinically proven to cure acne")).toBe("health-medical");
    expect(classifyClaimCategory("earn $5000 per month in passive income")).toBe("financial-earnings");
    expect(classifyClaimCategory("lifetime warranty, money-back guarantee")).toBe("warranty-guarantee");
    expect(classifyClaimCategory("the #1 cream nobody else can match")).toBe("prohibited-comparative");
    expect(classifyClaimCategory("works in just 7 days")).toBe("performance-efficacy");
    expect(classifyClaimCategory("the cheapest option, 50% off")).toBe("pricing");
    expect(classifyClaimCategory('users say "it changed my life"')).toBe("testimonial");
  });

  test("falls back to the extractor hint, else performance-efficacy", () => {
    expect(classifyClaimCategory("a vague mood line", "platform-policy")).toBe("platform-policy");
    expect(classifyClaimCategory("a vague mood line")).toBe("performance-efficacy");
  });
});

describe("isClaimSupported — loose content-word overlap", () => {
  test("backed when two content words overlap a fact line", () => {
    expect(isClaimSupported("95% OCR accuracy", ["delivers 95% OCR accuracy on receipts"])).toBe(true);
  });
  test("not backed when the fact corpus is unrelated", () => {
    expect(isClaimSupported("cures eczema overnight", ["ships in recyclable packaging"])).toBe(false);
  });
});

describe("checkClaims — non-applicable pass-through", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-na"); });
  afterEach(() => tmp.cleanup());

  test("a non-commercial mode returns applicable:false, pass, blocksShip:false", async () => {
    const r = await checkClaims({
      projectId: "shot-001",
      mode: "motion-design",
      texts: ["the #1 best cream that cures everything"],
      extract: stubExtractor({ text: "cures everything", source: "script" }),
    });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
  });
});

describe("checkClaims — ALLOWED (supported claim, issue fixture 1)", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-allowed"); });
  afterEach(() => tmp.cleanup());

  test("a claim backed by productFacts → pass, blocksShip:false, no finding", async () => {
    const r = await checkClaims({
      projectId: "claims-allowed-001",
      mode: COMMERCIAL,
      texts: ["95% OCR accuracy on every receipt"],
      facts: facts(["independently measured 95% OCR accuracy across 100+ languages"]),
      extract: stubExtractor({ text: "95% OCR accuracy", source: "script", categoryHint: "performance-efficacy" }),
    });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]!.supported).toBe(true);
  });
});

describe("checkClaims — UNSUPPORTED (issue fixture 2)", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-unsupp"); });
  afterEach(() => tmp.cleanup());

  test("an unbacked performance claim → warn finding, no hard block", async () => {
    const r = await checkClaims({
      projectId: "claims-unsupp-001",
      mode: COMMERCIAL,
      texts: ["works in just 3 days, 2x faster than the rest"],
      facts: facts(["ships in recyclable packaging"]), // unrelated — no backing
      extract: stubExtractor({ text: "works in just 3 days, 2x faster", source: "caption" }),
    });
    // Low-risk unsupported claim: a warn FINDING surfaces (the actionable
    // signal), and it never blocks ship. (The shared eval scorer keeps a single
    // soft warn from flipping the aggregate verdict — that is by design.)
    expect(r.blocksShip).toBe(false);
    expect(r.verdict).not.toBe("fail");
    const warns = r.findings.filter((f) => f.severity === "warn");
    expect(warns.map((f) => f.category)).toContain("claims.performance-efficacy");
    expect(r.findings.every((f) => f.id.startsWith("CLM"))).toBe(true);
    expect(r.claims[0]!.supported).toBe(false);
  });

  test("two unbacked low-risk claims tip the aggregate verdict to warn", async () => {
    const r = await checkClaims({
      projectId: "claims-unsupp-002",
      mode: COMMERCIAL,
      texts: ["the cheapest option, 50% off", "lifetime warranty, money-back guarantee"],
      facts: facts(["a daily moisturizer"]),
      extract: stubExtractor(
        { text: "the cheapest option, 50% off", source: "distribution" },
        { text: "lifetime warranty, money-back guarantee", source: "caption" },
      ),
    });
    expect(r.verdict).toBe("warn");
    expect(r.blocksShip).toBe(false);
    const cats = r.findings.map((f) => f.category);
    expect(cats).toContain("claims.pricing");
    expect(cats).toContain("claims.warranty-guarantee");
  });
});

describe("checkClaims — PROHIBITED high-risk (issue fixture 3)", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-prohibited"); });
  afterEach(() => tmp.cleanup());

  test("an unbacked health claim → fail + blocksShip:true", async () => {
    const r = await checkClaims({
      projectId: "claims-health-001",
      mode: COMMERCIAL,
      texts: ["clinically proven to cure eczema and reverse aging"],
      facts: facts(["a gentle daily moisturizer"]),
      extract: stubExtractor({ text: "clinically proven to cure eczema", source: "script" }),
    });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("claims.health-medical");
  });

  test("an unbacked financial claim → fail + blocksShip:true", async () => {
    const r = await checkClaims({
      projectId: "claims-money-001",
      mode: COMMERCIAL,
      texts: ["earn $10,000 per month in guaranteed passive income"],
      facts: facts(["a budgeting app"]),
      extract: stubExtractor({ text: "earn $10,000 per month in guaranteed passive income", source: "distribution" }),
    });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("claims.financial-earnings");
  });
});

describe("checkClaims — PROOF unblocks a high-risk claim", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-proof"); });
  afterEach(() => tmp.cleanup());

  test("--proof lines backing the claim downgrade the block to a pass", async () => {
    const proofPath = path.join(tmp.dir, "substantiation.txt");
    fs.writeFileSync(proofPath, "Double-blind clinical trial: cream clinically proven to cure eczema in 4 weeks (study ref 2026-014).\n");

    const r = await checkClaims({
      projectId: "claims-proof-001",
      mode: COMMERCIAL,
      texts: ["clinically proven to cure eczema"],
      facts: facts(["a daily moisturizer"]), // facts alone don't back it
      proof: proofPath,
      extract: stubExtractor({ text: "clinically proven to cure eczema", source: "script" }),
    });
    expect(r.proofProvided).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.claims[0]!.unblockedByProof).toBe(true);
  });

  test("proof that does NOT back the claim leaves the block in place", async () => {
    const proofPath = path.join(tmp.dir, "wrong-proof.txt");
    fs.writeFileSync(proofPath, "Our packaging is made from recycled cardboard.\n");

    const r = await checkClaims({
      projectId: "claims-proof-002",
      mode: COMMERCIAL,
      texts: ["clinically proven to cure eczema"],
      facts: facts(["a daily moisturizer"]),
      proof: proofPath,
      extract: stubExtractor({ text: "clinically proven to cure eczema", source: "script" }),
    });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.claims[0]!.unblockedByProof).toBe(false);
  });
});

describe("checkClaims — empty copy short-circuits", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-claims-empty"); });
  afterEach(() => tmp.cleanup());

  test("no copy surfaces → applicable pass with the 'no claims found' reason", async () => {
    // Explicit empty texts (the project on disk has nothing to harvest).
    const r = await checkClaims({
      projectId: "claims-empty-001",
      mode: COMMERCIAL,
      texts: [],
      extract: stubExtractor({ text: "should never be reached", source: "script" }),
    });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.claims).toEqual([]);
  });
});
