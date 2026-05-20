// Unit test for detectInstallMode (01.09.07).
//
// The heuristic walks up from a starting dir looking for the developer-mode
// marker triple (package.json + cli/index.ts + templates/). If found,
// returns "developer". Otherwise "binary".

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectInstallMode } from "../../cli/commands/doctor.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-mode-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("detectInstallMode", () => {
  test("returns 'developer' when the marker triple exists", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), "{}");
    fs.mkdirSync(path.join(tmp, "cli"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "cli", "index.ts"), "");
    fs.mkdirSync(path.join(tmp, "templates"), { recursive: true });
    // Start from a nested dir inside the fake repo — should walk up.
    const nested = path.join(tmp, "cli", "commands");
    fs.mkdirSync(nested, { recursive: true });
    const r = detectInstallMode(nested);
    expect(r.mode).toBe("developer");
    expect(r.repoRoot).toBe(tmp);
  });

  test("returns 'binary' when no marker triple is reachable", () => {
    // Pure empty dir, no markers.
    const r = detectInstallMode(tmp);
    expect(r.mode).toBe("binary");
    expect(r.repoRoot).toBeNull();
  });

  test("does not match when only one marker is present", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), "{}");
    // Missing cli/index.ts and templates/
    const r = detectInstallMode(tmp);
    expect(r.mode).toBe("binary");
  });
});
