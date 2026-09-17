// Both memory tiers use SQLite identities and immutable document revisions.
// Preserve tier isolation, historical bodies, lifecycle transitions, recall and caps.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  writeEntry,
  listEntries,
  listEntryHistory,
  getEntry,
  findEntry,
  searchEntries,
  approveEntry,
  approveAll,
  rejectEntry,
  recall,
  scaffoldBody,
  parseEntry,
  serializeEntry,
  ACTIVE_ENTRY_CAP,
  RECALL_CAP,
  RECALL_NOTE,
  MemoryCapError,
  type TierRef,
} from "../../cli/lib/memory/store.js";
import { clearCommandContext, setCommandContext } from "../../cli/lib/context-state.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";

const GLOBAL: TierRef = { tier: "global" };
let WS: TierRef;

let tmpRoot: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-memory-"));
  setRoot(tmpRoot);
  closeDomainDb();
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  WS = { tier: "workspace", ws: workspace.id };
  setCommandContext({ kind: "scope", workspaceId: workspace.id });
});

afterEach(() => {
  clearCommandContext();
  closeDomainDb();
  setRoot(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("memory store tiers (#112)", () => {
  test("notes persist in distinct durable tiers without filesystem locators", async () => {
    const g = await writeEntry({ text: "Always ban music in Kling prompts.", ref: GLOBAL, status: "active", type: "craft", slug: "kling-no-music" });
    const w = await writeEntry({ text: "Client rejects neon grades.", ref: WS, status: "active", type: "client", slug: "no-neon" });

    for (const entry of [g.entry, w.entry]) {
      expect(entry).not.toHaveProperty("file");
      expect(entry).not.toHaveProperty("path");
      expect(entry.id).toStartWith("mentry_");
      expect(entry.revisionId).toStartWith("mrev_");
    }
    closeDomainDb();
    expect((await listEntries(GLOBAL)).map((entry) => entry.slug)).toEqual(["kling-no-music"]);
    expect((await listEntries(WS)).map((entry) => entry.slug)).toEqual(["no-neon"]);
  });

  test("show search order: workspace tier wins, then global", async () => {
    await writeEntry({ text: "global variant", ref: GLOBAL, status: "active", slug: "shared-slug" });
    await writeEntry({ text: "workspace variant", ref: WS, status: "active", slug: "shared-slug" });
    const found = await findEntry("shared-slug", WS.ws);
    expect(found?.tier).toBe("workspace");
    expect(found?.body).toContain("workspace variant");
  });
});

describe("append-only versioning", () => {
  test("re-noting an existing slug writes v2 and leaves v1 untouched", async () => {
    const v1 = await writeEntry({ text: "First version.", ref: GLOBAL, status: "active", slug: "rule" });

    const v2 = await writeEntry({ text: "Second version.", ref: GLOBAL, status: "active", slug: "rule" });
    expect(v2.versioned).toBe(true);
    expect(v2.entry.id).toBe(v1.entry.id);
    expect(v2.entry.revisionId).not.toBe(v1.entry.revisionId);
    const history = await listEntryHistory(v1.entry.id!);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ revisionId: v1.entry.revisionId, body: v1.entry.body, version: 1 });

    // list returns the newest version per slug.
    const entries = await listEntries(GLOBAL, "active");
    expect(entries.length).toBe(1);
    expect(entries[0]!.version).toBe(2);
  });

  test("legacy force-overwrite updates the head while retaining immutable history", async () => {
    const first = await writeEntry({ text: "First.", ref: GLOBAL, status: "active", slug: "rule" });
    const r = await writeEntry({ text: "Replaced.", ref: GLOBAL, status: "active", slug: "rule", forceOverwrite: true });
    expect(r.overwritten).toBe(true);
    expect(r.entry.version).toBe(2);
    expect((await listEntryHistory(first.entry.id!))[1]?.body).toBe(first.entry.body);
    expect((await listEntries(GLOBAL, "active")).length).toBe(1);
    expect((await getEntry("rule", GLOBAL))?.body).toContain("Replaced.");
  });
});

describe("approve / reject lifecycle transitions", () => {
  test("approve selects the proposal without changing its identity or content", async () => {
    const p = await writeEntry({ text: "Candidate rule.", ref: GLOBAL, status: "proposed", slug: "candidate" });
    const r = await approveEntry("candidate", GLOBAL);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ entryId: p.entry.id, revisionId: p.entry.revisionId });
    expect(await listEntries(GLOBAL, "proposed")).toEqual([]);
    expect((await getEntry("candidate", GLOBAL))?.status).toBe("active");
    expect((await getEntry("candidate", GLOBAL))?.body).toBe(p.entry.body);
  });

  test("approve selects the revised proposal and preserves the previous active body", async () => {
    const active = await writeEntry({ text: "Active v1.", ref: GLOBAL, status: "active", slug: "dup" });
    const proposal = await writeEntry({ text: "Proposed update.", ref: GLOBAL, status: "proposed", slug: "dup" });
    const r = await approveEntry("dup", GLOBAL);
    expect(r).toMatchObject({ entryId: active.entry.id, revisionId: proposal.entry.revisionId });
    expect((await getEntry("dup", GLOBAL))?.version).toBe(2);
    expect((await listEntryHistory(active.entry.id!))[1]).toMatchObject({ body: active.entry.body, status: "archived" });
  });

  test("reject MOVES proposed → rejected/, never unlinks", async () => {
    const p = await writeEntry({ text: "Bad idea.", ref: WS, status: "proposed", slug: "bad-idea" });
    const r = await rejectEntry("bad-idea", WS);
    expect(p.entry).not.toHaveProperty("path");
    expect(r).toMatchObject({
      slug: "bad-idea",
      entryId: p.entry.id,
      revisionId: p.entry.revisionId,
      versioned: false,
    });
    expect((await getEntry("bad-idea", WS, "rejected"))?.status).toBe("rejected");
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

    const r = await recall({ ws: WS.ws });
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
    for (let i = 0; i < ACTIVE_ENTRY_CAP; i++) {
      await writeEntry({ ref: GLOBAL, status: "active", slug: `filler-${String(i).padStart(3, "0")}`, text: `Filler ${i}.` });
    }
    await expect(writeEntry({ text: "One too many.", ref: GLOBAL, status: "active", slug: "overflow" })).rejects.toThrow(MemoryCapError);
    // Existing slug versions up fine at the cap (consolidation stays possible).
    const r = await writeEntry({ text: "Merged survivor.", ref: GLOBAL, status: "active", slug: "filler-000" });
    expect(r.versioned).toBe(true);
    // proposed/ staging is NOT capped.
    const p = await writeEntry({ text: "Staged anyway.", ref: GLOBAL, status: "proposed", slug: "staged" });
    expect(p.entry.status).toBe("proposed");
    // approve of a NEW slug at the cap refuses with the same coded error.
    await expect(approveEntry("staged", GLOBAL)).rejects.toThrow(MemoryCapError);
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

  test("portable frontmatter round-trips and edited bodies persist as a new revision", async () => {
    const w = await writeEntry({ text: "Round trip.", ref: GLOBAL, status: "active", slug: "rt", type: "tooling" });
    const raw = serializeEntry(w.entry, w.entry.body);
    const { fm, body } = parseEntry(raw + "\nHand-written addendum.\n");
    expect(fm.type).toBe("tooling");
    expect(body).toContain("Hand-written addendum.");
    await writeEntry({ text: body, ref: GLOBAL, status: "active", slug: "rt", type: fm.type, expectedRevisionId: w.entry.revisionId });
    expect((await getEntry("rt", GLOBAL))?.body).toContain("Hand-written addendum.");
    expect((await listEntryHistory(w.entry.id!))[1]?.body).toBe(w.entry.body);
  });

  test("search hits frontmatter and body across both tiers", async () => {
    await writeEntry({ text: "Seedance rejects photoreal human anchors.", ref: GLOBAL, status: "active", slug: "seedance-filter", type: "model" });
    await writeEntry({ text: "Cast masters live in shared/cast.", ref: WS, status: "active", slug: "cast-masters", type: "client" });
    const byBody = await searchEntries("photoreal", WS.ws);
    expect(byBody.length).toBe(1);
    expect(byBody[0]!.slug).toBe("seedance-filter");
    const byTier = await searchEntries("cast", WS.ws);
    expect(byTier.some((m) => m.tier === "workspace")).toBe(true);
  });
});
