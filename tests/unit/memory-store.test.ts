// Unit tests for the memory core store (#112) — tiered markdown memory.
//
// Pins the invariants the issue locks in:
//   • two tiers (global .ralphy/memory/ + workspace memory/), tier resolution
//   • append-only versioning: re-noting a slug writes <slug>.v2.md, the prior
//     file is byte-identical afterwards; --force-overwrite is the escape hatch
//   • approve/reject are MOVES (proposed/ → active | rejected/), never unlinks
//   • recall merges global + workspace with workspace winning on slug
//     collision, caps at RECALL_CAP, and carries the injection-hygiene note
//   • the active-entry cap refuses NEW slugs with a coded error (curation
//     forcing-function — hermes-agent pattern)

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  writeEntry,
  listEntries,
  getEntry,
  findEntry,
  searchEntries,
  approveEntry,
  approveAll,
  rejectEntry,
  recall,
  memoryDir,
  indexPath,
  scaffoldBody,
  parseEntry,
  ACTIVE_ENTRY_CAP,
  RECALL_CAP,
  RECALL_NOTE,
  MemoryCapError,
  type TierRef,
} from "../../cli/lib/memory/store.js";

const GLOBAL: TierRef = { tier: "global" };
const WS: TierRef = { tier: "workspace", ws: "default" };

let tmpRoot: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-memory-"));
  setRoot(tmpRoot);
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
});

afterEach(() => {
  setRoot(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("memory store tiers (#112)", () => {
  test("note lands in the right tier dir and the index is generated", async () => {
    const g = await writeEntry({ text: "Always ban music in Kling prompts.", ref: GLOBAL, status: "active", type: "craft", slug: "kling-no-music" });
    const w = await writeEntry({ text: "Client rejects neon grades.", ref: WS, status: "active", type: "client", slug: "no-neon" });

    expect(g.entry.path).toBe(path.join(tmpRoot, ".ralphy", "memory", "kling-no-music.md"));
    expect(w.entry.path).toBe(path.join(tmpRoot, ".ralphy", "workspaces", "default", "memory", "no-neon.md"));

    const idx = fs.readFileSync(indexPath(GLOBAL), "utf-8");
    expect(idx).toContain("(kling-no-music.md)");
    expect(idx).not.toContain("no-neon");
  });

  test("show search order: workspace tier wins, then global", async () => {
    await writeEntry({ text: "global variant", ref: GLOBAL, status: "active", slug: "shared-slug" });
    await writeEntry({ text: "workspace variant", ref: WS, status: "active", slug: "shared-slug" });
    const found = await findEntry("shared-slug", "default");
    expect(found?.tier).toBe("workspace");
    expect(found?.body).toContain("workspace variant");
  });
});

describe("append-only versioning", () => {
  test("re-noting an existing slug writes v2 and leaves v1 untouched", async () => {
    const v1 = await writeEntry({ text: "First version.", ref: GLOBAL, status: "active", slug: "rule" });
    const v1Bytes = fs.readFileSync(v1.entry.path, "utf-8");

    const v2 = await writeEntry({ text: "Second version.", ref: GLOBAL, status: "active", slug: "rule" });
    expect(v2.versioned).toBe(true);
    expect(v2.entry.file).toBe("rule.v2.md");
    expect(fs.readFileSync(v1.entry.path, "utf-8")).toBe(v1Bytes);

    // Index points at the newest version only.
    const idx = fs.readFileSync(indexPath(GLOBAL), "utf-8");
    expect(idx).toContain("(rule.v2.md)");
    expect(idx).not.toContain("(rule.md)");

    // list returns the newest version per slug.
    const entries = await listEntries(GLOBAL, "active");
    expect(entries.length).toBe(1);
    expect(entries[0]!.version).toBe(2);
  });

  test("--force-overwrite replaces the newest version in place", async () => {
    await writeEntry({ text: "First.", ref: GLOBAL, status: "active", slug: "rule" });
    const r = await writeEntry({ text: "Replaced.", ref: GLOBAL, status: "active", slug: "rule", forceOverwrite: true });
    expect(r.overwritten).toBe(true);
    expect(r.entry.file).toBe("rule.md");
    expect((await listEntries(GLOBAL, "active")).length).toBe(1);
    expect((await getEntry("rule", GLOBAL))?.body).toContain("Replaced.");
  });
});

describe("approve / reject move semantics", () => {
  test("approve MOVES proposed → active and indexes it", async () => {
    const p = await writeEntry({ text: "Candidate rule.", ref: GLOBAL, status: "proposed", slug: "candidate" });
    const r = await approveEntry("candidate", GLOBAL);
    expect(r).not.toBeNull();
    expect(fs.existsSync(p.entry.path)).toBe(false); // moved out of proposed/
    expect(fs.existsSync(r!.to)).toBe(true);
    expect((await getEntry("candidate", GLOBAL))?.status).toBe("active");
    expect(fs.readFileSync(indexPath(GLOBAL), "utf-8")).toContain("candidate");
  });

  test("approve onto an existing active slug versions up, prior file untouched", async () => {
    const active = await writeEntry({ text: "Active v1.", ref: GLOBAL, status: "active", slug: "dup" });
    const bytes = fs.readFileSync(active.entry.path, "utf-8");
    await writeEntry({ text: "Proposed update.", ref: GLOBAL, status: "proposed", slug: "dup" });
    const r = await approveEntry("dup", GLOBAL);
    expect(r!.versioned).toBe(true);
    expect(path.basename(r!.to)).toBe("dup.v2.md");
    expect(fs.readFileSync(active.entry.path, "utf-8")).toBe(bytes);
  });

  test("reject MOVES proposed → rejected/, never unlinks", async () => {
    const p = await writeEntry({ text: "Bad idea.", ref: WS, status: "proposed", slug: "bad-idea" });
    const r = await rejectEntry("bad-idea", WS);
    expect(fs.existsSync(p.entry.path)).toBe(false);
    expect(r!.to).toBe(path.join(memoryDir(WS), "rejected", "bad-idea.md"));
    expect(fs.existsSync(r!.to)).toBe(true);
  });

  test("approve --all drains proposed/", async () => {
    await writeEntry({ text: "One.", ref: GLOBAL, status: "proposed", slug: "one" });
    await writeEntry({ text: "Two.", ref: GLOBAL, status: "proposed", slug: "two" });
    const moved = await approveAll(GLOBAL);
    expect(moved.length).toBe(2);
    expect((await listEntries(GLOBAL, "proposed")).length).toBe(0);
    expect((await listEntries(GLOBAL, "active")).length).toBe(2);
  });
});

describe("recall merge", () => {
  test("workspace overrides global on slug collision; note is carried", async () => {
    await writeEntry({ text: "Global truth.", ref: GLOBAL, status: "active", slug: "collide" });
    await writeEntry({ text: "Workspace truth.", ref: WS, status: "active", slug: "collide" });
    await writeEntry({ text: "Global only.", ref: GLOBAL, status: "active", slug: "global-only" });

    const r = await recall({ ws: "default" });
    expect(r.note).toBe(RECALL_NOTE);
    expect(r.count).toBe(2);
    const collide = r.entries.find((e) => e.slug === "collide");
    expect(collide?.tier).toBe("workspace");
  });

  test("default recall caps at RECALL_CAP and flags truncation; --full lifts it", async () => {
    for (let i = 0; i < RECALL_CAP + 3; i++) {
      await writeEntry({ text: `Rule number ${i}.`, ref: GLOBAL, status: "active", slug: `rule-${String(i).padStart(3, "0")}` });
    }
    const capped = await recall({ ws: "default" });
    expect(capped.truncated).toBe(true);
    expect(capped.count).toBe(RECALL_CAP);
    const full = await recall({ ws: "default", full: true });
    expect(full.truncated).toBe(false);
    expect(full.count).toBe(RECALL_CAP + 3);
  });
});

describe("active-entry cap (curation forcing-function)", () => {
  test("a NEW slug beyond the cap throws the coded error; existing slugs still version", async () => {
    // The store guards on count, not bytes — synthesize cap entries directly
    // so the test stays fast.
    const dir = memoryDir(GLOBAL);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < ACTIVE_ENTRY_CAP; i++) {
      fs.writeFileSync(
        path.join(dir, `filler-${String(i).padStart(3, "0")}.md`),
        `---\nname: "f${i}"\ndescription: "filler"\ntype: craft\nfiled: 2026-06-11\nsource: "test"\n---\n\nFiller ${i}.\n`,
      );
    }
    expect(writeEntry({ text: "One too many.", ref: GLOBAL, status: "active", slug: "overflow" })).rejects.toThrow(MemoryCapError);
    // Existing slug versions up fine at the cap (consolidation stays possible).
    const r = await writeEntry({ text: "Merged survivor.", ref: GLOBAL, status: "active", slug: "filler-000" });
    expect(r.versioned).toBe(true);
    // proposed/ staging is NOT capped.
    const p = await writeEntry({ text: "Staged anyway.", ref: GLOBAL, status: "proposed", slug: "staged" });
    expect(p.entry.status).toBe("proposed");
    // approve of a NEW slug at the cap refuses with the same coded error.
    expect(approveEntry("staged", GLOBAL)).rejects.toThrow(MemoryCapError);
  });
});

describe("entry body discipline", () => {
  test("scaffoldBody injects missing Why / How-to-apply / Does-NOT-apply-to markers", () => {
    const body = scaffoldBody("Bare rule with no structure.");
    expect(body).toContain("**Why:**");
    expect(body).toContain("**How to apply:**");
    expect(body).toContain("**Does NOT apply to:**");
    // Already-structured text is left alone.
    const structured = "Rule.\n**Why:** reason\n**How to apply:** trigger\n**Does NOT apply to:** exceptions";
    expect(scaffoldBody(structured)).toBe(structured);
  });

  test("frontmatter round-trips and hand-edited bodies survive a parse", async () => {
    const w = await writeEntry({ text: "Round trip.", ref: GLOBAL, status: "active", slug: "rt", type: "tooling" });
    // Hand-edit the body (memory files are user-editable markdown by design).
    const raw = fs.readFileSync(w.entry.path, "utf-8");
    fs.writeFileSync(w.entry.path, raw + "\nHand-written addendum.\n");
    const { fm, body } = parseEntry(fs.readFileSync(w.entry.path, "utf-8"));
    expect(fm.type).toBe("tooling");
    expect(body).toContain("Hand-written addendum.");
    expect((await getEntry("rt", GLOBAL))?.body).toContain("Hand-written addendum.");
  });

  test("search hits frontmatter and body across both tiers", async () => {
    await writeEntry({ text: "Seedance rejects photoreal human anchors.", ref: GLOBAL, status: "active", slug: "seedance-filter", type: "model" });
    await writeEntry({ text: "Cast masters live in shared/cast.", ref: WS, status: "active", slug: "cast-masters", type: "client" });
    const byBody = await searchEntries("photoreal", "default");
    expect(byBody.length).toBe(1);
    expect(byBody[0]!.slug).toBe("seedance-filter");
    const byTier = await searchEntries("cast", "default");
    expect(byTier.some((m) => m.tier === "workspace")).toBe(true);
  });
});
