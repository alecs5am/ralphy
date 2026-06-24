import fs from "fs/promises";
import { readFileSync } from "fs";
import { configPath, ralphDir } from "./paths.js";

export type Config = Record<string, unknown>;

export async function loadConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(configPath(), "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/** Synchronous config read — for the sync provider-resolution path (paths.ts uses the same pattern). */
export function loadConfigSync(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), "utf-8"));
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config) {
  await fs.mkdir(ralphDir(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2) + "\n");
}

export function getNestedValue(obj: any, key: string): unknown {
  return key.split(".").reduce((o, k) => o?.[k], obj);
}

export function setNestedValue(obj: any, key: string, value: unknown) {
  const keys = key.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
