import fs from "fs/promises";
import path from "path";
import { registryPath, ralphDir, brandsDir, personasDir, refsDir } from "./paths.js";

export type RegistryData = {
  brands: Record<string, any>;
  personas: Record<string, any>;
  refs: Record<string, any>;
  projects: Record<string, any>;
  templates: Record<string, any>;
  batches: Record<string, any>;
};

const EMPTY: RegistryData = {
  brands: {},
  personas: {},
  refs: {},
  projects: {},
  templates: {},
  batches: {},
};

export async function loadRegistry(): Promise<RegistryData> {
  try {
    const data = await fs.readFile(registryPath(), "utf-8");
    return { ...EMPTY, ...JSON.parse(data) };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveRegistry(reg: RegistryData) {
  await fs.mkdir(ralphDir(), { recursive: true });
  await fs.writeFile(registryPath(), JSON.stringify(reg, null, 2) + "\n");
}

// Generic entity CRUD on a specific collection
export async function addEntity(
  collection: keyof RegistryData,
  id: string,
  data: Record<string, unknown>
) {
  const reg = await loadRegistry();
  reg[collection][id] = { id, ...data };
  await saveRegistry(reg);

  // Also write individual JSON file for brands/personas/refs
  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    const dir = dirFn();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ id, ...data }, null, 2) + "\n"
    );
  }
  return reg[collection][id];
}

export async function getEntity(collection: keyof RegistryData, id: string) {
  const reg = await loadRegistry();
  return reg[collection][id] || null;
}

export async function updateEntity(
  collection: keyof RegistryData,
  id: string,
  updates: Record<string, unknown>
) {
  const reg = await loadRegistry();
  if (!reg[collection][id]) return null;
  reg[collection][id] = { ...reg[collection][id], ...updates, updatedAt: new Date().toISOString() };
  await saveRegistry(reg);

  // Also update individual file
  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    const fp = path.join(dirFn(), `${id}.json`);
    await fs.writeFile(fp, JSON.stringify(reg[collection][id], null, 2) + "\n");
  }
  return reg[collection][id];
}

export async function deleteEntity(collection: keyof RegistryData, id: string) {
  const reg = await loadRegistry();
  if (!reg[collection][id]) return false;
  delete reg[collection][id];
  await saveRegistry(reg);

  const dirMap: Partial<Record<keyof RegistryData, () => string>> = {
    brands: brandsDir,
    personas: personasDir,
    refs: refsDir,
  };
  const dirFn = dirMap[collection];
  if (dirFn) {
    await fs.rm(path.join(dirFn(), `${id}.json`), { force: true });
  }
  return true;
}

export async function listEntities(collection: keyof RegistryData) {
  const reg = await loadRegistry();
  return Object.values(reg[collection]);
}
