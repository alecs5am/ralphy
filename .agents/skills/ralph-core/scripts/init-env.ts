// Create or update .env in project root.
//
// Usage:
//   npx tsx .agents/skills/ralph-core/scripts/init-env.ts            # create with placeholders
//   npx tsx .agents/skills/ralph-core/scripts/init-env.ts --set KEY=value [--set KEY2=value2]

import fs from "node:fs/promises";
import path from "node:path";

const TEMPLATE_KEYS: Record<string, string> = {
  FAL_KEY: "fal.ai — image/video generation. https://fal.ai/dashboard/keys",
  ELEVENLABS_API_KEY: "ElevenLabs — voiceover. https://elevenlabs.io/app/settings/api-keys",
  OPENROUTER_API_KEY: "OpenRouter — Gemini vision for analysis skills. https://openrouter.ai/keys",
};

function parseSets(argv: string[]): Record<string, string> {
  const sets: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--set") {
      const kv = argv[++i] ?? "";
      const eq = kv.indexOf("=");
      if (eq > 0) sets[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }
  return sets;
}

async function readEnv(envPath: string): Promise<Map<string, string>> {
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    const out = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out.set(m[1]!, m[2]!);
    }
    return out;
  } catch {
    return new Map();
  }
}

function render(values: Map<string, string>): string {
  const lines: string[] = [];
  const allKeys = new Set([...Object.keys(TEMPLATE_KEYS), ...values.keys()]);
  for (const key of allKeys) {
    const comment = TEMPLATE_KEYS[key];
    if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=${values.get(key) ?? "<MISSING>"}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

async function main() {
  const envPath = path.resolve(".env");
  const sets = parseSets(process.argv.slice(2));
  const existing = await readEnv(envPath);

  // Initialize missing template keys with <MISSING>
  for (const k of Object.keys(TEMPLATE_KEYS)) {
    if (!existing.has(k)) existing.set(k, "<MISSING>");
  }

  // Apply explicit --set overrides
  for (const [k, v] of Object.entries(sets)) {
    existing.set(k, v);
  }

  await fs.writeFile(envPath, render(existing));

  // Report status WITHOUT printing values
  console.log(`Wrote ${envPath}`);
  for (const k of Object.keys(TEMPLATE_KEYS)) {
    const val = existing.get(k) ?? "<MISSING>";
    const status = val && val !== "<MISSING>" && val.length > 4 ? "set" : "missing";
    console.log(`  ${k.padEnd(24)} ${status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
