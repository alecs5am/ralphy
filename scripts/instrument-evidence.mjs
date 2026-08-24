import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { APPROVED_CORE_SHA256, APPROVED_CORE_VERSION } from "./bundled-core.mjs";

export const EVIDENCE_ROOT = resolve(".superpowers/sdd/nothing-instrument/final");
export const EVIDENCE_MANIFEST = resolve(EVIDENCE_ROOT, "manifest.json");
export const EVIDENCE_REPORT = resolve(EVIDENCE_ROOT, "report.html");
export const SCENARIO_INVENTORY = Object.freeze({
  scenarios: 317,
  expandedCases: 1_898,
  semanticDigest: "9a392591abbb59f445f6b5d81d95eb533cdc0b4fa12a2e837762d549c70c9ed4",
  themes: ["light", "dark"],
  viewports: ["1440x900", "1280x800", "1100x720"],
});

export function createEvidenceRun(requirements = {}) {
  return {
    schemaVersion: 1,
    revision: 0,
    phase: "prepared",
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    core: { version: APPROVED_CORE_VERSION, sha256: APPROVED_CORE_SHA256 },
    scenarioInventory: SCENARIO_INVENTORY,
    requirements,
    packages: {},
    launches: [],
    captures: [],
    journeys: [],
    reviewers: { product: null, visual: null, accessibility: null, security: null, regression: null },
  };
}

export function validateManifest(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isInteger(value.revision) || value.revision < 0) throw new Error("Invalid evidence manifest header");
  if (value.core?.version !== APPROVED_CORE_VERSION || value.core?.sha256 !== APPROVED_CORE_SHA256) throw new Error("Evidence Core pin differs from approved Core 0.3.0");
  if (value.scenarioInventory?.scenarios !== SCENARIO_INVENTORY.scenarios || value.scenarioInventory?.expandedCases !== SCENARIO_INVENTORY.expandedCases) throw new Error("Evidence scenario inventory is incomplete");
  const launchIds = value.launches.map(({ id }) => id);
  if (new Set(launchIds).size !== launchIds.length) throw new Error("Duplicate evidence launch IDs");
  for (const launch of value.launches) {
    if (!launch.dbRecord || launch.maxActiveInstances !== 1 || launch.activeInstancesAfterRun !== 0) throw new Error(`Invalid launch evidence: ${launch.id}`);
  }
  if (value.phase === "final") {
    for (const mode of ["mock", "production"]) if (value.packages[mode]?.verified !== true) throw new Error(`Missing verified ${mode} package`);
    if (!value.launches.length || !value.captures.length) throw new Error("Final evidence needs launches and captures");
    for (const reviewer of Object.values(value.reviewers)) if (!reviewer?.startsWith("approved:")) throw new Error("Final evidence needs all reviewer decisions");
  }
  return value;
}

export async function readEvidenceBundle(path = EVIDENCE_MANIFEST) {
  return validateManifest(JSON.parse(await readFile(path, "utf8")));
}

// Every record carries its own identity, so re-recording one replaces it rather than duplicating it: audits stay re-runnable.
function upsert(items, key, value) {
  const index = items.findIndex((item) => item[key] === value[key]);
  return index < 0 ? [...items, value] : items.with(index, value);
}

function applyUpdate(manifest, update) {
  if (update.type === "set-package") return { ...manifest, packages: { ...manifest.packages, [update.mode]: update.value } };
  if (update.type === "record-launch") return { ...manifest, launches: upsert(manifest.launches, "id", update.value) };
  if (update.type === "record-capture") return { ...manifest, captures: upsert(manifest.captures, "path", update.value) };
  if (update.type === "record-journey") return { ...manifest, journeys: upsert(manifest.journeys, "id", update.value) };
  if (update.type === "set-reviewers") return { ...manifest, reviewers: { ...manifest.reviewers, ...update.value } };
  if (update.type === "advance-phase") {
    if (manifest.phase !== update.from) throw new Error(`Evidence phase is ${manifest.phase}, not ${update.from}`);
    return { ...manifest, phase: update.to };
  }
  throw new Error(`Unknown evidence update: ${update.type}`);
}

export async function updateEvidenceBundle(path, expectedRevision, update) {
  const manifest = await readEvidenceBundle(path);
  if (manifest.revision !== expectedRevision) throw new Error(`Evidence revision conflict: expected ${expectedRevision}, received ${manifest.revision}`);
  const next = validateManifest({ ...applyUpdate(manifest, update), revision: manifest.revision + 1, updatedAt: new Date().toISOString() });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, path);
  return next;
}

export async function initializeEvidenceBundle(requirements = {}, path = EVIDENCE_MANIFEST) {
  await mkdir(dirname(path), { recursive: true });
  const manifest = createEvidenceRun(requirements);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
