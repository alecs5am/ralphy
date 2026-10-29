// Zero provider calls on the matting path (issue #560, free before paid).
//
// Same structural guarantees as the #559 tracking path:
//   1. The import closure of the matte verb never reaches the provider layer.
//   2. The Python engine has no network code at all.
//   3. The engine child process gets an environment without provider keys.
// The only network access in the module is `ralphy matte setup` fetching the
// pinned model files from their upstream GitHub releases, verified by SHA-256.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { MATTE_MODELS, MATTE_STACK, matterChildEnv, matterScriptSource } from "../../cli/lib/matte/engine.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

function importClosure(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [path.resolve(REPO, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith(".ts")) continue;
    const src = fs.readFileSync(file, "utf8");
    const specs = [...src.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(
      (m) => m[1] ?? m[2]!,
    );
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      let resolved = path.resolve(path.dirname(file), spec);
      if (resolved.endsWith(".js") && fs.existsSync(resolved.replace(/\.js$/, ".ts"))) resolved = resolved.replace(/\.js$/, ".ts");
      if (fs.existsSync(resolved)) stack.push(resolved);
    }
  }
  return [...seen].map((f) => path.relative(REPO, f));
}

const FORBIDDEN = [
  /^cli\/lib\/providers\//,
  /^cli\/lib\/gen-log\.ts$/,
  /^cli\/lib\/quality\.ts$/,
  /^cli\/lib\/connectors?\//,
  /^cli\/lib\/credentials?\//,
];

describe("matte path makes zero provider calls", () => {
  for (const entry of ["cli/commands/matte.ts", "cli/lib/matte/engine.ts", "cli/lib/matte/chroma.ts", "cli/lib/matte/encode.ts"]) {
    test(`${entry} never imports the provider layer`, () => {
      const closure = importClosure(entry);
      expect(closure).toContain(entry);
      expect(closure.filter((f) => FORBIDDEN.some((re) => re.test(f)))).toEqual([]);
    });
  }

  test("the Python engine has no network code", () => {
    const py = matterScriptSource();
    expect(py).not.toMatch(/\bimport\s+(urllib|requests|http|socket|httpx|aiohttp)\b/);
    expect(py).not.toMatch(/\bfrom\s+(urllib|requests|http|socket|httpx|aiohttp)\b/);
    expect(py).not.toMatch(/https?:\/\//);
  });

  test("the engine child env carries no provider credentials", () => {
    const env = matterChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/x",
      OPENROUTER_API_KEY: "sk-test",
      ELEVENLABS_API_KEY: "el-test",
      FAL_KEY: "fal-test",
      FIRECRAWL_API_KEY: "fc-test",
      APIFY_TOKEN: "ap-test",
      HTTPS_PROXY: "http://proxy",
    });
    expect(env.PATH).toBe("/usr/bin");
    for (const k of ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY", "FIRECRAWL_API_KEY", "APIFY_TOKEN", "HTTPS_PROXY"]) {
      expect(env[k]).toBeUndefined();
    }
  });

  test("the only fetch downloads a pinned model from its upstream GitHub release", () => {
    const src = fs.readFileSync(path.join(REPO, "cli/lib/matte/engine.ts"), "utf8");
    const fetches = [...src.matchAll(/\bfetch\(([^)]*)\)/g)].map((m) => m[1]);
    expect(fetches).toEqual(["spec.url"]);
    for (const m of MATTE_MODELS) {
      const spec = MATTE_STACK.models[m];
      expect(new URL(spec.url).host).toBe("github.com");
      expect(spec.url).toMatch(/\/releases\/download\//);
      expect(spec.url).not.toMatch(/[?&](key|token|access_token)=/i);
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.bytes).toBeGreaterThan(1_000_000);
    }
    for (const f of ["cli/commands/matte.ts", "cli/lib/matte/chroma.ts", "cli/lib/matte/encode.ts"]) {
      expect(fs.readFileSync(path.join(REPO, f), "utf8")).not.toMatch(/\bfetch\(/);
    }
  });

  test("every pinned requirement is an exact version", () => {
    for (const r of MATTE_STACK.requirements) expect(r).toMatch(/^[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.]*$/);
  });
});
