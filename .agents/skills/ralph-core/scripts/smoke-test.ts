// Cheap auth-only smoke test for FAL_KEY, ELEVENLABS_API_KEY, OPENROUTER_API_KEY.
//
// Usage:
//   npx tsx .agents/skills/ralph-core/scripts/smoke-test.ts

import fs from "node:fs/promises";
import path from "node:path";

async function loadEnv() {
  try {
    const raw = await fs.readFile(path.resolve(".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
    }
  } catch { /* no .env yet */ }
}

type Result = { name: string; ok: boolean; status?: number; detail?: string };

async function checkFal(): Promise<Result> {
  const key = process.env.FAL_KEY;
  if (!key || key === "<MISSING>") return { name: "fal.ai", ok: false, detail: "FAL_KEY missing in .env" };
  try {
    // Use the public auth-validating endpoint — list user balance
    const r = await fetch("https://rest.alpha.fal.ai/billing/user_balance", {
      headers: { Authorization: `Key ${key}` },
    });
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      return r.status === 200
        ? { name: "fal.ai", ok: true, status: r.status }
        : { name: "fal.ai", ok: false, status: r.status, detail: "key rejected" };
    }
    return { name: "fal.ai", ok: r.ok, status: r.status };
  } catch (e) {
    return { name: "fal.ai", ok: false, detail: (e as Error).message };
  }
}

async function checkElevenLabs(): Promise<Result> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || key === "<MISSING>") return { name: "elevenlabs", ok: false, detail: "ELEVENLABS_API_KEY missing in .env" };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key, "User-Agent": "Mozilla/5.0 (smoke-test)" },
    });
    return r.ok
      ? { name: "elevenlabs", ok: true, status: r.status }
      : { name: "elevenlabs", ok: false, status: r.status, detail: "key rejected" };
  } catch (e) {
    return { name: "elevenlabs", ok: false, detail: (e as Error).message };
  }
}

async function checkOpenRouter(): Promise<Result> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === "<MISSING>") return { name: "openrouter", ok: false, detail: "OPENROUTER_API_KEY missing in .env" };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return r.ok
      ? { name: "openrouter", ok: true, status: r.status }
      : { name: "openrouter", ok: false, status: r.status, detail: "key rejected" };
  } catch (e) {
    return { name: "openrouter", ok: false, detail: (e as Error).message };
  }
}

async function main() {
  await loadEnv();
  const results = await Promise.all([checkFal(), checkElevenLabs(), checkOpenRouter()]);

  console.log("\nSmoke test results:\n");
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    const status = r.status ? `(HTTP ${r.status})` : "";
    const detail = r.detail ? ` — ${r.detail}` : "";
    console.log(`  ${mark}  ${r.name.padEnd(12)} ${status}${detail}`);
  }
  console.log("");

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`${failed.length} provider(s) failed. Fix the keys in .env and re-run.`);
    process.exit(1);
  } else {
    console.log("All providers ok. You can start generating videos.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
