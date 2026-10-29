// Zero provider calls on the tracking path (issue #559, free before paid).
//
// Three structural guarantees:
//   1. The import closure of the track verb never reaches the provider layer
//      (cli/lib/providers/**, the LLM / media connectors, the gen-log).
//   2. The Python engine has no network code at all.
//   3. The tracker child process gets an environment without provider keys.
// The only network access in the module is `ralphy track setup` fetching the
// pinned face model, and that URL is not a model-provider API.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { trackerChildEnv, trackerScriptSource, TRACK_STACK } from "../../cli/lib/track/engine.js";

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

describe("track path makes zero provider calls", () => {
  for (const entry of ["cli/commands/track.ts", "cli/lib/track/engine.ts", "cli/lib/track/schema.ts"]) {
    test(`${entry} never imports the provider layer`, () => {
      const closure = importClosure(entry);
      expect(closure).toContain(entry);
      const hits = closure.filter((f) => FORBIDDEN.some((re) => re.test(f)));
      expect(hits).toEqual([]);
    });
  }

  test("the Python engine has no network code", () => {
    const py = trackerScriptSource();
    expect(py).not.toMatch(/\bimport\s+(urllib|requests|http|socket|httpx|aiohttp)\b/);
    expect(py).not.toMatch(/\bfrom\s+(urllib|requests|http|socket|httpx|aiohttp)\b/);
    expect(py).not.toMatch(/https?:\/\//);
  });

  test("the browser runtime has no network code", () => {
    const js = fs.readFileSync(path.join(REPO, "cli/lib/track/ralphy-track.js"), "utf8");
    expect(js).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
  });

  test("the tracker child env carries no provider credentials", () => {
    const env = trackerChildEnv({
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

  test("the only fetch in the engine downloads the pinned face model", () => {
    const src = fs.readFileSync(path.join(REPO, "cli/lib/track/engine.ts"), "utf8");
    const fetches = [...src.matchAll(/\bfetch\(([^)]*)\)/g)].map((m) => m[1]);
    expect(fetches).toEqual(["TRACK_STACK.faceModel.url"]);
    expect(new URL(TRACK_STACK.faceModel.url).host).toBe("storage.googleapis.com");
    expect(TRACK_STACK.faceModel.sha256).toMatch(/^[0-9a-f]{64}$/);
    const cmd = fs.readFileSync(path.join(REPO, "cli/commands/track.ts"), "utf8");
    expect(cmd).not.toMatch(/\bfetch\(/);
  });

  test("every pinned requirement is an exact version", () => {
    for (const r of TRACK_STACK.requirements) expect(r).toMatch(/^[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.]*$/);
  });
});
