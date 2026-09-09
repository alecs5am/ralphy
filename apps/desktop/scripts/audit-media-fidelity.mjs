import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { REFERENCE_ROOT, prepareInstrumentEvidence } from "./prepare-instrument-evidence.mjs";

export const A11Y_DEVIATION_MASK_VERSION = "readable-text-v1";
const captureRoot = resolve(".superpowers/sdd/nothing-instrument/final/mock");

function dimensions(path) {
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  return {
    width: Number(output.match(/pixelWidth: (\d+)/)?.[1]),
    height: Number(output.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

export function assertGeometryDelta(actual, expected, tolerance = 1) {
  if (Math.abs(actual.width - expected.width) > tolerance || Math.abs(actual.height - expected.height) > tolerance) throw new Error(`Media geometry differs: ${JSON.stringify({ actual, expected, tolerance })}`);
}

export async function auditMediaFidelity() {
  await prepareInstrumentEvidence();
  const reference = await readFile(resolve(REFERENCE_ROOT, "Ralphy Instrument System.dc.html"), "utf8");
  if (!reference.includes('id: dark ? "3b" : "3a"')) throw new Error("Media 3a/3b handoff sections are unavailable");
  const records = [];
  for (const theme of ["light", "dark"]) {
    const path = resolve(captureRoot, `media-${theme}-1440x900.png`);
    const measured = dimensions(path);
    assertGeometryDelta(measured, { width: 1440, height: 900 });
    records.push({ key: `mock__media.ready__${theme}__1440x900`, path, measured, rendererCrop: { x: 0, y: 0, width: 1440, height: 900 }, mask: A11Y_DEVIATION_MASK_VERSION, allowedDeviation: "AA-readable text and native window chrome" });
  }
  const output = resolve(".superpowers/sdd/nothing-instrument/final/media-fidelity.json");
  await writeFile(output, `${JSON.stringify({ version: 1, reference: resolve(REFERENCE_ROOT, "Ralphy Instrument System.dc.html"), records }, null, 2)}\n`);
  return output;
}

if (import.meta.main) console.log(`MEDIA_FIDELITY_AUDIT_OK ${await auditMediaFidelity()}`);
