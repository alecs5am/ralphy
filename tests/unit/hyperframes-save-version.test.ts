// Unit: save-version writes v1.html first, then v2.html, ... never overwrites.
// AGENTS.md invariant #14 — append-only on user/agent artifacts (#028, #004).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  nextVersionSlot,
  saveCompositionVersion,
} from "../../cli/lib/render/save-version.js";

describe("nextVersionSlot (pure)", () => {
  test("v1 when no versions exist yet", () => {
    expect(nextVersionSlot([])).toBe("v1.html");
  });

  test("v2 after a v1.html", () => {
    expect(nextVersionSlot(["v1.html"])).toBe("v2.html");
  });

  test("picks max+1 even with gaps; does NOT reuse holes", () => {
    expect(nextVersionSlot(["v1.html", "v3.html"])).toBe("v4.html");
    expect(nextVersionSlot(["v7.html"])).toBe("v8.html");
  });

  test("ignores unrelated files in compositions/", () => {
    expect(
      nextVersionSlot(["snapshots", "v1.html", "draft-notes.md", "v2.html"]),
    ).toBe("v3.html");
  });
});

describe("saveCompositionVersion", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-hf-save-"));
    fs.writeFileSync(path.join(tmp, "index.html"), "<!doctype html>v1");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("first call writes compositions/v1.html", async () => {
    const r = await saveCompositionVersion(tmp);
    expect(r.slot).toBe("v1.html");
    expect(fs.existsSync(path.join(tmp, "compositions", "v1.html"))).toBe(true);
    expect(fs.readFileSync(r.dest, "utf8")).toBe("<!doctype html>v1");
  });

  test("subsequent calls increment numerically (v1 → v2 → v3) without overwriting", async () => {
    const r1 = await saveCompositionVersion(tmp);
    fs.writeFileSync(path.join(tmp, "index.html"), "<!doctype html>v2");
    const r2 = await saveCompositionVersion(tmp);
    fs.writeFileSync(path.join(tmp, "index.html"), "<!doctype html>v3");
    const r3 = await saveCompositionVersion(tmp);

    expect(r1.slot).toBe("v1.html");
    expect(r2.slot).toBe("v2.html");
    expect(r3.slot).toBe("v3.html");

    // v1 must still hold the original contents — invariant #14 append-only.
    expect(fs.readFileSync(r1.dest, "utf8")).toBe("<!doctype html>v1");
    expect(fs.readFileSync(r2.dest, "utf8")).toBe("<!doctype html>v2");
    expect(fs.readFileSync(r3.dest, "utf8")).toBe("<!doctype html>v3");
  });

  test("throws ENOENT when index.html is missing — never silently skips", async () => {
    fs.rmSync(path.join(tmp, "index.html"));
    let caught: unknown;
    try {
      await saveCompositionVersion(tmp);
    } catch (e) {
      caught = e;
    }
    expect((caught as { code?: string } | undefined)?.code).toBe("ENOENT");
  });
});
