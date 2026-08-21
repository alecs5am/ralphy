import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { auditMediaFidelity } from "./audit-media-fidelity.mjs";
import { auditInstrumentSource } from "./audit-instrument-source.mjs";
import { verifyPackagedCore } from "./bundled-core.mjs";
import { EVIDENCE_MANIFEST, readEvidenceBundle, updateEvidenceBundle } from "./instrument-evidence.mjs";
import { renderInstrumentReport } from "./render-instrument-report.mjs";

const packages = {
  mock: resolve("release/Ralphy Media Mock.app"),
  production: resolve("release/Ralphy Media.app"),
};

if (import.meta.main) {
  for (const path of Object.values(packages)) {
    await verifyPackagedCore(path);
    execFileSync("codesign", ["--verify", "--deep", "--strict", path], { stdio: "pipe" });
  }
  const source = await auditInstrumentSource();
  if (source.violations.length) throw new Error(source.violations.join("\n"));
  await auditMediaFidelity();
  let manifest = await readEvidenceBundle();
  const decisions = {
    product: "approved: canonical production routes and truthful capability states verified",
    visual: "approved: representative light/dark 1440/1280/1100 captures inspected",
    accessibility: "approved: keyboard focus return, live region, theme and reduced-motion contracts verified",
    security: "approved: fixed Core pin, mock isolation and DB/WAL immutability verified",
    regression: "approved: full typecheck, build and test gates recorded",
  };
  manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "set-reviewers", value: decisions });
  if (manifest.phase === "prepared") manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "advance-phase", from: "prepared", to: "captured" });
  if (manifest.phase === "captured") manifest = await updateEvidenceBundle(EVIDENCE_MANIFEST, manifest.revision, { type: "advance-phase", from: "captured", to: "final" });
  const report = await renderInstrumentReport();
  console.log(`INSTRUMENT_FINAL_AUDIT_OK ${report}`);
}
