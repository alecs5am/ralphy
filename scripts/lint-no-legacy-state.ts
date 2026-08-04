#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

export const BANNED_LEGACY_NAMES = [
  "registry.json",
  "workspace.json",
  "asset-manifest.json",
  "generations.jsonl",
  "user-prompts.jsonl",
  "user-assets.jsonl",
  "unit.json",
  "publish-ledger.jsonl",
] as const;

const BANNED_APIS = [
  "getActiveWorkspace",
  "setActiveWorkspace",
  "currentWorkspace",
  "workspaceUnitsDir",
  "sharedDir("
] as const;

export function findLegacyStateViolations(root: string): string[] {
  const files = [
    ...walk(path.join(root, "cli", "lib", "bridge")),
    ...walk(path.join(root, "cli", "lib", "agent")),
    ...walk(path.join(root, "cli", "lib", "store")),
    ...walk(path.join(root, "cli", "lib", "migration")).filter((file) => path.basename(file) !== "legacy.ts"),
    path.join(root, "cli", "commands", "bridge.ts"),
  ].filter((file) => fs.existsSync(file) && file.endsWith(".ts"));
  const violations: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    const allowedExport = relative === "cli/lib/store/portable.ts";
    for (const name of BANNED_LEGACY_NAMES) {
      if (!allowedExport && source.includes(name)) violations.push(`${relative}: ${name}`);
    }
    for (const name of BANNED_APIS) {
      if (source.includes(name)) violations.push(`${relative}: ${name}`);
    }
    if (/from\s+["'][^"']*cli\/lib\/registry(?:\.js)?["']/.test(source)) {
      violations.push(`${relative}: cli/lib/registry.ts`);
    }
  }
  return violations.sort();
}

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(file));
    else result.push(file);
  }
  return result;
}

if (import.meta.main) {
  const violations = findLegacyStateViolations(path.resolve(import.meta.dir, ".."));
  if (violations.length) {
    console.error(["Legacy state access detected:", ...violations.map((item) => `- ${item}`)].join("\n"));
    process.exit(1);
  }
  console.log("No legacy state access in domain bridge/store boundaries.");
}
