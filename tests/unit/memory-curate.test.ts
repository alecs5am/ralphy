// Unit tests for `ralphy memory retire` + `curate` (#116).
//
// LLM stubbed at fetch level (#072 rule). Pins:
//   • retire MOVES every version file of an active slug to archived/ and
//     drops the slug from the index — no version resurfaces, nothing unlinked
//   • curate stages overlap-merges as the SURVIVOR slug's next proposed
//     version, never touches active entries, and drops hallucinated slugs
//   • --dry-run stages nothing; flags pass through

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  writeEntry,
  listEntries,
  retireEntry,
  indexPath,
  memoryDir,
  type TierRef,
} from "../../cli/lib/memory/store.js";
import { curateMemory } from "../../cli/lib/memory/curate.js";

const GLOBAL: TierRef = { tier: "global" };
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalCwd = process.cwd();
let tmpRoot: string;

function stubLLM(payload: unknown): void {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-curate-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  setRoot(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("memory retire (#116)", () => {
  test("moves ALL version files to archived/, drops the index line, keeps other slugs", async () => {
    await writeEntry({ text: "V1 of the rule.", ref: GLOBAL, status: "active", slug: "doomed" });
    await writeEntry({ text: "V2 of the rule.", ref: GLOBAL, status: "active", slug: "doomed" });
    await writeEntry({ text: "Unrelated survivor.", ref: GLOBAL, status: "active", slug: "keeper" });

    const moves = await retireEntry("doomed", GLOBAL);
    expect(moves).toHaveLength(2); // both versions moved — v1 must NOT resurface in active
    for (const m of moves!) expect(fs.existsSync(m.to)).toBe(true); // archived, not unlinked

    const active = await listEntries(GLOBAL, "active");
    expect(active.map((e) => e.slug)).toEqual(["keeper"]);
    const idx = fs.readFileSync(indexPath(GLOBAL), "utf-8");
    expect(idx).not.toContain("doomed");

    const archivedDir = path.join(memoryDir(GLOBAL), "archived");
    expect(fs.readdirSync(archivedDir).sort()).toEqual(["doomed.md", "doomed.v2.md"]);
  });

  test("unknown slug returns null", async () => {
    expect(await retireEntry("nope", GLOBAL)).toBeNull();
  });
});

describe("memory curate (#116)", () => {
  test("stages a merge as the survivor's next proposed version; active untouched; hallucinated survivors dropped", async () => {
    await writeEntry({ text: "Ban music in Kling prompts.", ref: GLOBAL, status: "active", slug: "kling-no-music" });
    await writeEntry({ text: "Kling auto-soundtrack must be disabled.", ref: GLOBAL, status: "active", slug: "kling-soundtrack-off" });

    stubLLM({
      merges: [
        {
          survivor_slug: "kling-no-music",
          tier: "global",
          merged_body:
            "Ban music explicitly in every Kling prompt; the soundtrack is a separate post-mix pass.\n\n**Why:** overlap.\n**How to apply:** every kling call.\n**Does NOT apply to:** models without native audio.",
          description: "Merged Kling music rule",
          retire_after_approve: ["kling-soundtrack-off"],
        },
        {
          survivor_slug: "i-do-not-exist",
          tier: "global",
          merged_body: "Hallucinated merge.",
          description: "x",
          retire_after_approve: [],
        },
      ],
      flags: [{ slug: "kling-soundtrack-off", tier: "global", reason: "missing-negative-scope", detail: "placeholder line" }],
    });

    const r = await curateMemory({ ws: "default" });
    expect(r.scanned).toBe(2);
    expect(r.merges).toHaveLength(1); // hallucinated survivor dropped
    expect(r.flags).toHaveLength(1);
    expect(r.staged).toHaveLength(1);

    // Merge staged into proposed/ — active entries untouched.
    const proposed = await listEntries(GLOBAL, "proposed");
    expect(proposed.map((e) => e.slug)).toEqual(["kling-no-music"]);
    expect(proposed[0]!.source).toContain("curate:merge of [kling-no-music, kling-soundtrack-off]");
    const active = await listEntries(GLOBAL, "active");
    expect(active.map((e) => e.slug).sort()).toEqual(["kling-no-music", "kling-soundtrack-off"]);
  });

  test("--dry-run stages nothing; empty store skips the LLM entirely", async () => {
    await writeEntry({ text: "Solo rule.", ref: GLOBAL, status: "active", slug: "solo" });
    stubLLM({ merges: [], flags: [] });
    const dry = await curateMemory({ ws: "default", dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.staged).toHaveLength(0);

    // Empty store: no LLM call (fetch would throw if hit).
    fs.rmSync(memoryDir(GLOBAL), { recursive: true, force: true });
    globalThis.fetch = (async () => {
      throw new Error("LLM must not be called on an empty store");
    }) as unknown as typeof fetch;
    const empty = await curateMemory({ ws: "default", dryRun: true });
    expect(empty.scanned).toBe(0);
  });
});
