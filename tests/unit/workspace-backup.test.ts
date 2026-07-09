// #540 — farm state backup / restore (disaster recovery).
//
// Covers: round-trip (backup → wipe → restore → state intact), schema-version
// mismatch refusal, clobber-newer guard (+ --force), media-exclusion default
// (+ --include-media), live-farm snapshot consistency (a concurrent JSONL
// append while backing up does not tear the archive), and the highest-stakes
// case — the publish ledger re-establishing #531 exactly-once after a restore.
// The zip round-trip uses the system zip/unzip (skipped when absent).

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import {
  backupWorkspace,
  restoreWorkspace,
  BACKUP_SCHEMA_VERSION,
} from "../../cli/lib/workspace-backup.js";
import { BundleError } from "../../cli/lib/bundle.js";
import {
  appendPublishLedger,
  findLedgerEntry,
  publishIdempotencyKey,
} from "../../cli/lib/publish/ledger.js";

const hasZip = Boolean(Bun.which("zip") && Bun.which("unzip"));

let tmp: TmpRoot | undefined;
const scratch: string[] = [];
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
  for (const f of scratch.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

function scratchZip(name = "backup.zip"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-540-"));
  scratch.push(d);
  return path.join(d, name);
}

/** Seed a workspace with runtime STATE + one KNOW-HOW + one MEDIA file. */
function seed(slug: string): string {
  const dir = workspaceDir(slug);
  fs.mkdirSync(path.join(dir, "ingestion"), { recursive: true });
  fs.mkdirSync(path.join(dir, "projects", "p-001"), { recursive: true });
  fs.mkdirSync(path.join(dir, "workflows"), { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug, trust: { level: "L1" } }) + "\n");
  fs.writeFileSync(path.join(dir, "publish-ledger.jsonl"), "");
  fs.writeFileSync(path.join(dir, "trust-audit.jsonl"), JSON.stringify({ kind: "promotion" }) + "\n");
  fs.writeFileSync(path.join(dir, "calendar.json"), JSON.stringify({ version: "1.0", slots: [], entries: [] }) + "\n");
  fs.writeFileSync(path.join(dir, "ingestion", "seen.jsonl"), JSON.stringify({ id: "x" }) + "\n");
  // KNOW-HOW (must NOT be backed up).
  fs.writeFileSync(path.join(dir, "evaluators.json"), JSON.stringify({ criteria: [] }) + "\n");
  fs.writeFileSync(path.join(dir, "workflows", "episode.json"), "{}");
  // MEDIA (excluded by default).
  fs.writeFileSync(path.join(dir, "projects", "p-001", "final.mp4"), "MEDIA-BYTES");
  return dir;
}

describe.if(hasZip)("workspace backup / restore (#540)", () => {
  test("round-trip: backup → wipe → restore → state intact", () => {
    tmp = makeTmpRoot("ralphy-540");
    const dir = seed("chan");
    const zip = scratchZip();

    backupWorkspace("chan", zip);

    // Wipe the whole workspace.
    fs.rmSync(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);

    const r = restoreWorkspace(zip);
    expect(r.workspace).toBe("chan");
    expect(r.integrity.ok).toBe(true);
    // STATE restored.
    expect(fs.existsSync(path.join(dir, "trust-audit.jsonl"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "ingestion", "seen.jsonl"), "utf-8")).toContain('"id":"x"');
    expect(JSON.parse(fs.readFileSync(path.join(dir, "workspace.json"), "utf-8")).trust.level).toBe("L1");
  });

  test("KNOW-HOW and MEDIA are excluded by default; --include-media opts media in", () => {
    tmp = makeTmpRoot("ralphy-540");
    seed("chan");

    const zipA = scratchZip("state-only.zip");
    const a = backupWorkspace("chan", zipA);
    expect(a.manifest.contents).not.toContain("evaluators.json"); // know-how never
    expect(a.manifest.contents).not.toContain("workflows"); // know-how never
    expect(a.manifest.contents).not.toContain("projects"); // media excluded by default
    expect(a.manifest.includeMedia).toBe(false);

    const zipB = scratchZip("with-media.zip");
    const b = backupWorkspace("chan", zipB, { includeMedia: true });
    expect(b.manifest.contents).toContain("projects");
    expect(b.manifest.contents).not.toContain("evaluators.json"); // know-how STILL excluded
    expect(b.manifest.includeMedia).toBe(true);
  });

  test("restore does not resurrect know-how or media the archive omitted", () => {
    tmp = makeTmpRoot("ralphy-540");
    const dir = seed("chan");
    const zip = scratchZip();
    backupWorkspace("chan", zip); // state-only

    fs.rmSync(dir, { recursive: true, force: true });
    restoreWorkspace(zip);

    expect(fs.existsSync(path.join(dir, "trust-audit.jsonl"))).toBe(true); // state back
    expect(fs.existsSync(path.join(dir, "evaluators.json"))).toBe(false); // know-how NOT
    expect(fs.existsSync(path.join(dir, "projects", "p-001", "final.mp4"))).toBe(false); // media NOT
  });

  test("schema-version mismatch refuses", () => {
    tmp = makeTmpRoot("ralphy-540");
    seed("chan");
    const zip = scratchZip();
    backupWorkspace("chan", zip);

    // Rewrite the manifest inside the zip with a bad schema.
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-540-tamper-"));
    scratch.push(work);
    Bun.spawnSync(["unzip", "-q", zip, "-d", work]);
    const mf = path.join(work, "backup-manifest.json");
    const m = JSON.parse(fs.readFileSync(mf, "utf-8"));
    m.schema = "999";
    fs.writeFileSync(mf, JSON.stringify(m));
    fs.rmSync(zip, { force: true });
    Bun.spawnSync(["zip", "-r", "-q", zip, "."], { cwd: work });

    expect(() => restoreWorkspace(zip)).toThrow(/schema mismatch/i);
  });

  test("clobber-newer guard refuses, --force overrides", async () => {
    tmp = makeTmpRoot("ralphy-540");
    const dir = seed("chan");
    const zip = scratchZip();
    backupWorkspace("chan", zip);

    // Simulate live state written AFTER the backup (newer mtime).
    await Bun.sleep(10);
    fs.writeFileSync(path.join(dir, "publish-ledger.jsonl"), JSON.stringify({ key: "newer" }) + "\n");

    expect(() => restoreWorkspace(zip)).toThrow(/newer than the archive/i);

    const forced = restoreWorkspace(zip, { force: true });
    expect(forced.forced).toBe(true);
    // The archive's (empty) ledger overwrote the newer live one.
    expect(fs.readFileSync(path.join(dir, "publish-ledger.jsonl"), "utf-8")).not.toContain("newer");
  });

  test("--as restores into a fresh workspace, leaving the source untouched", () => {
    tmp = makeTmpRoot("ralphy-540");
    seed("chan");
    const zip = scratchZip();
    backupWorkspace("chan", zip);

    const r = restoreWorkspace(zip, { as: "chan-recovered" });
    expect(r.workspace).toBe("chan-recovered");
    expect(fs.existsSync(path.join(workspaceDir("chan-recovered"), "trust-audit.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir("chan"), "trust-audit.jsonl"))).toBe(true); // source intact
  });

  test("live-farm snapshot: a concurrent JSONL append does not tear the archive", () => {
    tmp = makeTmpRoot("ralphy-540");
    const dir = seed("chan");
    const ledger = path.join(dir, "publish-ledger.jsonl");
    // Two complete lines present before backup.
    fs.writeFileSync(ledger, JSON.stringify({ key: "a" }) + "\n" + JSON.stringify({ key: "b" }) + "\n");

    const zip = scratchZip();
    backupWorkspace("chan", zip);
    // A write lands AFTER the snapshot copy — must not appear in the archive
    // and must not corrupt the copied lines.
    fs.appendFileSync(ledger, JSON.stringify({ key: "c" }) + "\n");

    fs.rmSync(dir, { recursive: true, force: true });
    restoreWorkspace(zip);
    const restored = fs.readFileSync(ledger, "utf-8").trim().split("\n");
    expect(restored).toHaveLength(2); // a + b, never a torn "c"
    expect(restored.every((l) => JSON.parse(l))).toBe(true); // every line parses
  });

  test("ledger restore re-establishes #531 exactly-once (a re-publish idempotent-skips)", () => {
    tmp = makeTmpRoot("ralphy-540");
    const dir = seed("chan");
    // A published row is on the ledger — this (key, target) must never re-fire.
    const key = publishIdempotencyKey({ workspace: "chan", projectId: "p-001", slug: "ep", target: "youtube" });
    appendPublishLedger("chan", { key, project: "p-001", slug: "ep", target: "youtube", postId: "yt-1", scheduleAt: null, status: "published" });
    expect(findLedgerEntry("chan", key, "youtube")).not.toBeNull(); // guard armed

    const zip = scratchZip();
    backupWorkspace("chan", zip);

    // Disaster: lose the ledger (the exactly-once guard is gone).
    fs.rmSync(dir, { recursive: true, force: true });
    expect(findLedgerEntry("chan", key, "youtube")).toBeNull(); // guard lost → would re-post

    // Restore rehydrates the ledger → the guard is armed again.
    const r = restoreWorkspace(zip);
    expect(r.integrity.ok).toBe(true);
    const entry = findLedgerEntry("chan", key, "youtube");
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe("published"); // a re-publish attempt idempotent-skips
  });
});

describe("workspace backup (no-zip-independent)", () => {
  test("schema version constant is stable", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe("1");
  });

  test("backup refuses a missing workspace", () => {
    tmp = makeTmpRoot("ralphy-540");
    expect(() => backupWorkspace("nope", scratchZip())).toThrow(BundleError);
  });
});
