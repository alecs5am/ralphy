// Read-only compatibility for legacy filesystem Unit manifests, plus the one
// still-live campaign provenance stamp. Entity Unit mutations live in SQLite.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { UnitManifestSchema, type UnitManifest } from "./schemas/unit.js";

export async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const file = path.join(unitDir, "unit.json");
  if (!existsSync(file)) return null;
  try {
    return UnitManifestSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

/** Stamp live campaign-selection facts without exposing a general manifest writer. */
export async function applySelectionProvenance(
  unitDir: string,
  selection: {
    hookType?: string;
    lengthBand?: string;
    angle?: string;
    thesis?: string;
    format?: string;
  },
): Promise<boolean> {
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) return false;
  const clean = Object.fromEntries(
    Object.entries(selection).filter(([, value]) =>
      typeof value === "string" && value.length > 0
    ),
  ) as Record<string, string>;
  if (Object.keys(clean).length === 0) return false;
  const provenance = { ...(manifest.provenance ?? {}) };
  provenance.selection = { ...(provenance.selection ?? {}), ...clean };
  const next = UnitManifestSchema.parse({ ...manifest, provenance });
  await fs.writeFile(
    path.join(unitDir, "unit.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  return true;
}
