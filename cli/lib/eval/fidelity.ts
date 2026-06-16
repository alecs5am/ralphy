// Product & brand fidelity gate (#422).
//
// For commercial content a beautiful-but-wrong product is a failure, not a soft
// visual note. This gate validates that the project's GENERATED media preserves
// the real product identity, packaging/logo, palette, and documented UI/API
// claims — and never makes a claim the brand explicitly avoids — BEFORE a Unit
// can ship. A materially wrong named product/brand is a hard `fail` that blocks
// ship-ready (refuse, not warn — AGENTS.md #4).
//
// It reuses the existing eval machinery rather than inventing a parallel one:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • the typed ref pack (#426) — the LOCKED product/brand refs are the truth,
//   • `ProductBrandFacts` (#416) — the citable productFacts + claimsToAvoid,
//   • `requiresFidelityGate(mode)` (#412) — only commercial modes run strict.
//
// The vision analyzer is INJECTABLE so fixtures run with NO network/paid gen.
// The default analyzer is a single `callLLM()` jsonMode pass per generated asset
// comparing it against the locked product/brand refs + the facts.

import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { projectDir, artifactKindDir } from "../paths.js";
import { readRefPack, buildRefPack, reportMissingForMode } from "../ref-pack.js";
import { lockedRefs, type RefPack, type RefPackEntry } from "../schemas/ref-pack.js";
import {
  ProductBrandFactsSchema,
  RESEARCH_FACTS_ARTIFACT,
  type ProductBrandFacts,
} from "../schemas/research-facts.js";
import { requiresFidelityGate } from "../content-modes.js";
import { score } from "./findings.js";
import { fileToDataUri } from "./vision.js";
import { callLLM } from "../providers/llm.js";
import type { Finding, Severity, Verdict } from "./types.js";

/** Max locked refs to attach as images per asset comparison (bounds token cost). */
const MAX_REF_IMAGES = 3;

const FIDELITY_MODEL = "google/gemini-2.5-flash";
const MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Project-relative location the fidelity report is persisted to. */
export const FIDELITY_ARTIFACT = "fidelity.json" as const;

/** One generated asset's fidelity verdict against the product/brand truth. */
export interface AssetFidelity {
  /** Project-relative path of the generated asset checked. */
  asset: string;
  /** Per-check booleans (true = matches the product/brand truth). */
  checks: {
    productIdentity: boolean;
    packagingLogo: boolean;
    colorPalette: boolean;
    /** UI / API claims accurate against `productFacts` (true when none apply). */
    claimAccuracy: boolean;
    /** No prohibited claim from `claimsToAvoid` present (true when clean). */
    prohibitedClaimsClear: boolean;
  };
  /** Findings this asset contributed (already Finding-shaped). */
  findings: Finding[];
}

/** The injectable analyzer: compares one generated asset to the product/brand truth. */
export type FidelityAnalyzer = (input: {
  asset: string;
  lockedRefs: RefPackEntry[];
  facts: ProductBrandFacts;
  projectId: string;
}) => Promise<{
  productIdentity: boolean;
  packagingLogo: boolean;
  colorPalette: boolean;
  claimAccuracy: boolean;
  prohibitedClaimsClear: boolean;
  /** Free-text issues the model raised, each with a severity. */
  issues: Array<{ category: string; severity: Severity; message: string }>;
}>;

export interface FidelityReport {
  schemaVersion: "1.0";
  projectId: string;
  mode: string | null;
  /** False when the mode is non-commercial → the gate is a pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) + unit formation consult. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** Required-ref coverage for the mode (#426 reused). */
  requiredRefs: { required: string[]; missing: string[]; satisfied: boolean };
  /** The locked product/brand refs the assets were checked against. */
  lockedRefs: string[];
  /** Per-generated-asset results. */
  assets: AssetFidelity[];
  /** All findings, flattened (the fixer/readiness path consumes these). */
  findings: Finding[];
}

/** Read + parse the project's research-facts.json, or empty facts when absent. */
function readFacts(projectId: string): ProductBrandFacts {
  try {
    const abs = path.join(projectDir(projectId), RESEARCH_FACTS_ARTIFACT);
    if (!existsSync(abs)) return ProductBrandFactsSchema.parse({});
    const r = ProductBrandFactsSchema.safeParse(JSON.parse(readFileSync(abs, "utf8")));
    return r.success ? r.data : ProductBrandFactsSchema.parse({});
  } catch {
    return ProductBrandFactsSchema.parse({});
  }
}

/** List generated still media under artifacts/images (top level). Never throws. */
function listGeneratedAssets(projectId: string): string[] {
  const dir = artifactKindDir(projectId, "images");
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => {
        try {
          return statSync(path.join(dir, f)).isFile() && MEDIA_EXT.has(path.extname(f).toLowerCase());
        } catch {
          return false;
        }
      })
      .map((f) => path.join("artifacts/images", f))
      .sort();
  } catch {
    return [];
  }
  // ponytail: stills only. Sampled-video-frame PRODUCT fidelity (product-in-frame
  // / action continuity, issue #422 native-video note) rides on the #411 native
  // eval keyframe extractor — not re-implemented here. (Text legibility on sampled
  // frames is now covered by the #439 OCR gate, `cli/lib/eval/ocr.ts`.)
}

/**
 * Run the product/brand fidelity gate for a project. Pure read — never mutates.
 * `analyze` is injectable (default = a vision `callLLM()` pass) so tests run with
 * NO network. A non-commercial mode short-circuits to an applicable:false pass.
 */
export async function checkFidelity(input: {
  projectId: string;
  mode: string | null;
  analyze?: FidelityAnalyzer;
}): Promise<FidelityReport> {
  const { projectId, mode } = input;
  const analyze = input.analyze ?? defaultAnalyzer;

  if (!mode || !requiresFidelityGate(mode)) {
    return {
      schemaVersion: "1.0",
      projectId,
      mode: mode ?? null,
      applicable: false,
      verdict: "pass",
      blocksShip: false,
      reason: mode
        ? `mode "${mode}" is not a commercial product/brand mode — fidelity gate not applicable.`
        : "no content mode resolved — fidelity gate not applicable (pass a commercial mode to run it).",
      requiredRefs: { required: [], missing: [], satisfied: true },
      lockedRefs: [],
      assets: [],
      findings: [],
    };
  }

  // Persisted pack is the truth (it carries the user-set `locked` flags); fall
  // back to a best-effort built pack so a missing required ref is still detected
  // even before `ralphy ref pack` has been run.
  const pack: RefPack = readRefPack(projectId) ?? buildRefPack(projectId);
  const facts = readFacts(projectId);
  const locked = lockedRefs(pack);
  const refReport = reportMissingForMode(pack, mode);

  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => {
    const f: Finding = { id: `FID${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  // — Required-ref presence (#426). A missing product/brand ref means the gate
  //   cannot even verify identity — a hard fail (the truth is absent).
  for (const t of refReport.missing) {
    add({
      category: "fidelity.missing-required-ref",
      severity: t === "product" || t === "brand" ? "fail" : "warn",
      sceneIndex: null,
      timestampSec: null,
      message: `Mode "${mode}" requires a "${t}" reference, but the ref pack has none — product/brand fidelity cannot be verified.`,
      fixHint: `Add and lock the ${t} reference: \`ralphy ref pack ${projectId} --add artifacts/refs/<file> --type ${t} --lock\`.`,
      fixCommand: `ralphy ref pack ${projectId} --add artifacts/refs/<${t}> --type ${t} --lock`,
    });
  }

  // — Per-asset comparison against the locked product/brand truth.
  const assetPaths = listGeneratedAssets(projectId);
  const assets: AssetFidelity[] = [];
  for (const asset of assetPaths) {
    let r: Awaited<ReturnType<FidelityAnalyzer>>;
    try {
      r = await analyze({ asset, lockedRefs: locked, facts, projectId });
    } catch (e) {
      add({
        category: "fidelity.analysis-failed",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Fidelity analysis failed for ${asset}: ${(e as Error).message}`,
        fixHint: "Re-run the fidelity gate once a model provider is reachable.",
        fixCommand: null,
      });
      continue;
    }
    const assetFindings: Finding[] = [];
    const failCheck = (ok: boolean, category: string, message: string, fixHint: string) => {
      if (ok) return;
      assetFindings.push(
        add({ category, severity: "fail", sceneIndex: null, timestampSec: null, message: `${asset}: ${message}`, fixHint, fixCommand: null }),
      );
    };
    // A materially wrong product / packaging / logo is a hard fail (blocks ship).
    failCheck(r.productIdentity, "fidelity.product-identity", "generated product does not match the locked product reference.", "Regenerate with the locked product master on --ref; do not let identity drift.");
    failCheck(r.packagingLogo, "fidelity.packaging-logo", "packaging / logo does not match the brand reference.", "Pass the locked brand/logo ref on --ref and restate label geometry in the prompt.");
    failCheck(r.claimAccuracy, "fidelity.claim-accuracy", "a UI / API / spec claim contradicts the product facts.", "Correct the on-asset claim to match artifacts/refs/research-facts.json productFacts.");
    failCheck(r.prohibitedClaimsClear, "fidelity.prohibited-claim", "asset makes a claim on the claimsToAvoid guardrail list.", "Remove the prohibited claim (claimsToAvoid in research-facts.json).");
    // Palette drift is a warn, not a ship-blocker on its own.
    if (!r.colorPalette) {
      assetFindings.push(
        add({ category: "fidelity.color-palette", severity: "warn", sceneIndex: null, timestampSec: null, message: `${asset}: color/palette drifts from the brand palette.`, fixHint: "Re-grade to the brand hex values (brandAssets in research-facts.json).", fixCommand: null }),
      );
    }
    // Carry the model's own free-text issues through verbatim.
    for (const iss of r.issues ?? []) {
      assetFindings.push(
        add({ category: `fidelity.${iss.category}`, severity: iss.severity, sceneIndex: null, timestampSec: null, message: `${asset}: ${iss.message}`, fixHint: "Review the flagged asset against the product/brand reference.", fixCommand: null }),
      );
    }
    assets.push({ asset, checks: { productIdentity: r.productIdentity, packagingLogo: r.packagingLogo, colorPalette: r.colorPalette, claimAccuracy: r.claimAccuracy, prohibitedClaimsClear: r.prohibitedClaimsClear }, findings: assetFindings });
  }

  // — Verdict via the shared eval scorer; blocksShip on any fail finding.
  const { verdict } = score(findings);
  const blocksShip = verdict === "fail";

  // ponytail: claims/policy gate is #442's job — this gate only checks
  // claimsToAvoid (the brand's own guardrail). Broad regulatory / platform-policy
  // claim checking is NOT in scope here. #442 owns it.
  // ponytail: the readiness scorecard (#427) consumes `verdict` + `blocksShip`
  // verbatim — do NOT aggregate other gates here.

  return {
    schemaVersion: "1.0",
    projectId,
    mode,
    applicable: true,
    verdict,
    blocksShip,
    reason: blocksShip
      ? `${findings.filter((f) => f.severity === "fail").length} fidelity failure(s) — a named product/brand is materially wrong. Blocks ship-ready until fixed.`
      : verdict === "warn"
        ? "fidelity warnings present (palette / soft drift). Review before shipping; not a hard block."
        : assetPaths.length === 0
          ? "no generated stills to check yet — no fidelity failures (re-run after generation)."
          : "generated assets match the locked product/brand references and facts.",
    requiredRefs: { ...refReport },
    lockedRefs: locked.map((e) => e.path),
    assets,
    findings,
  };
}

/** Best-effort image data-URI for a project-relative path; null when unreadable. */
async function refDataUri(projectId: string, rel: string): Promise<string | null> {
  try {
    return await fileToDataUri(path.join(projectDir(projectId), rel));
  } catch {
    return null;
  }
}

/**
 * Default analyzer — one vision `callLLM()` jsonMode pass per asset. It attaches
 * the GENERATED asset image FIRST, then the locked product/brand reference
 * images (capped at MAX_REF_IMAGES), so the model actually compares pixels — a
 * paths-as-text prompt can't judge visual fidelity. Reuses `fileToDataUri` from
 * the eval vision primitive. The facts + claimsToAvoid ride along as text.
 * Unreadable images are skipped; if NEITHER the asset nor any ref is readable
 * the model has nothing to compare and defaults to pass (do-not-invent rule).
 */
const defaultAnalyzer: FidelityAnalyzer = async ({ asset, lockedRefs, facts, projectId }) => {
  const refLines = lockedRefs.length
    ? lockedRefs.map((r) => `- ${r.type}: ${r.path}${r.note ? ` (${r.note})` : ""}`).join("\n")
    : "(no locked product/brand references)";
  const sys = `You verify product/brand FIDELITY of a single generated marketing asset against the real product/brand.
The FIRST attached image is the GENERATED asset under review. The images AFTER it are the REAL product/brand reference(s) it must match.
Return JSON only:
{
  "productIdentity": boolean,      // does the generated product match the real product?
  "packagingLogo": boolean,        // packaging / logo correct?
  "colorPalette": boolean,         // palette matches the brand?
  "claimAccuracy": boolean,        // every UI/API/spec claim matches the product facts (true if none shown)?
  "prohibitedClaimsClear": boolean,// free of any claim on the avoid-list (true if none present)?
  "issues": [ { "category": "string", "severity": "info|warn|fail", "message": "specific" } ]
}
A materially wrong named product/brand is severity "fail". When you cannot tell, default the boolean to true (do not invent failures).`;
  const userText = `Generated asset: ${asset}
Locked product/brand references (attached as images below, in order):
${refLines}

Product facts (claims that MUST hold):
${facts.productFacts.length ? facts.productFacts.map((f) => `- ${f}`).join("\n") : "(none)"}

Brand assets / palette:
${facts.brandAssets.length ? facts.brandAssets.map((f) => `- ${f}`).join("\n") : "(none)"}

Claims to AVOID (prohibited):
${facts.claimsToAvoid.length ? facts.claimsToAvoid.map((f) => `- ${f}`).join("\n") : "(none)"}`;

  // Attach the generated asset first, then the locked refs (bounded). Each is a
  // multimodal image_url part; unreadable files are silently skipped.
  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  const assetUri = await refDataUri(projectId, asset);
  if (assetUri) content.push({ type: "image_url", image_url: { url: assetUri } });
  for (const ref of lockedRefs.slice(0, MAX_REF_IMAGES)) {
    const uri = await refDataUri(projectId, ref.path);
    if (uri) content.push({ type: "image_url", image_url: { url: uri } });
  }

  const res = await callLLM({
    model: FIDELITY_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content },
    ],
    jsonMode: true,
    maxTokens: 600,
    projectId,
    endpoint: "openrouter/eval-fidelity",
  });
  const parsed = safeParse(res.text);
  return {
    productIdentity: parsed.productIdentity !== false,
    packagingLogo: parsed.packagingLogo !== false,
    colorPalette: parsed.colorPalette !== false,
    claimAccuracy: parsed.claimAccuracy !== false,
    prohibitedClaimsClear: parsed.prohibitedClaimsClear !== false,
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (i): i is { category: string; severity: Severity; message: string } =>
            !!i && typeof i.category === "string" && typeof i.message === "string" &&
            (["info", "warn", "fail"] as Severity[]).includes(i.severity as Severity),
        )
      : [],
  };
};

function safeParse(text: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}
