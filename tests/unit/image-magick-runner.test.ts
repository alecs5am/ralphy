// Issue #101: ImageMagick optional runner.
//
// Tests cover:
// - magickBinary() returns null when the probe finds nothing (stubbed via the
//   test hook — must pass whether or not ImageMagick is actually installed).
// - hasMagick() is false / ensureMagick() throws the optional-dep message
//   when absent.
// - RALPHY_MAGICK_PATH env override is honored as-is (trusted, unprobed).
// - runMagick() writes a `provider: "imagemagick"` gen-log line on success
//   (stub binary = tiny shell script) and on nonzero exit (status "error" +
//   rejection), mirroring the runFfmpeg contract in cutout.ts.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  magickBinary,
  hasMagick,
  ensureMagick,
  runMagick,
  __setMagickBinaryForTest,
} from "../../cli/lib/image/magick.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { setRoot } from "../../cli/lib/paths.js";

const PROJECT_ID = "magick-test-001";

let tmpRoot: string;
let origRoot: string;
let origEnvPath: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-magick-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT_ID, "logs"), {
    recursive: true,
  });
  origRoot = process.cwd();
  setRoot(tmpRoot);
  origEnvPath = process.env.RALPHY_MAGICK_PATH;
  delete process.env.RALPHY_MAGICK_PATH;
});

afterEach(() => {
  setRoot(origRoot);
  if (origEnvPath === undefined) delete process.env.RALPHY_MAGICK_PATH;
  else process.env.RALPHY_MAGICK_PATH = origEnvPath;
  // Clear the module-level cache so other test files (and real usage in the
  // same process) re-probe from scratch.
  __setMagickBinaryForTest(undefined);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

/** Write an executable stub script that exits with `code`. Returns its path. */
function writeStubBinary(code: number): string {
  const p = path.join(tmpRoot, `magick-stub-${code}.sh`);
  fs.writeFileSync(p, `#!/bin/sh\nexit ${code}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

describe("magickBinary / hasMagick / ensureMagick (absent)", () => {
  test("magickBinary returns null when the probe finds nothing", () => {
    __setMagickBinaryForTest(null);
    expect(magickBinary()).toBeNull();
  });

  test("hasMagick is false when absent", () => {
    __setMagickBinaryForTest(null);
    expect(hasMagick()).toBe(false);
  });

  test("ensureMagick throws the optional-dep install message", () => {
    __setMagickBinaryForTest(null);
    expect(() => ensureMagick()).toThrow(/optional/);
    expect(() => ensureMagick()).toThrow(/brew install imagemagick/);
  });
});

describe("RALPHY_MAGICK_PATH override", () => {
  test("env override is returned as-is (trusted, no probe)", () => {
    process.env.RALPHY_MAGICK_PATH = "/opt/custom/bin/magick";
    __setMagickBinaryForTest(undefined); // force re-resolve
    expect(magickBinary()).toBe("/opt/custom/bin/magick");
    expect(hasMagick()).toBe(true);
    expect(ensureMagick()).toBe("/opt/custom/bin/magick");
  });

  test("resolution is cached until the cache is cleared", () => {
    process.env.RALPHY_MAGICK_PATH = "/opt/custom/bin/magick";
    __setMagickBinaryForTest(undefined);
    expect(magickBinary()).toBe("/opt/custom/bin/magick");
    // Env change without a cache clear is ignored — cached.
    process.env.RALPHY_MAGICK_PATH = "/somewhere/else";
    expect(magickBinary()).toBe("/opt/custom/bin/magick");
  });
});

describe("runMagick gen-log", () => {
  test("writes a provider=imagemagick gen-log line on success", async () => {
    const stub = writeStubBinary(0);
    process.env.RALPHY_MAGICK_PATH = stub;
    __setMagickBinaryForTest(undefined); // re-resolve through the override

    const result = await runMagick(["input.png", "-trim", "output.png"], {
      endpoint: "imagemagick/trim",
      input: { src: "input.png", dst: "output.png" },
      opts: { projectId: PROJECT_ID, note: "unit-test trim" },
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.provider).toBe("imagemagick");
    expect(row.endpoint).toBe("imagemagick/trim");
    expect(row.model).toBe("imagemagick/trim");
    expect(row.kind).toBe("image");
    expect(row.status).toBe("ok");
    expect(row.cost_usd).toBe(0);
    expect(typeof row.latency_ms).toBe("number");
    expect(row.input.project).toBe(PROJECT_ID);
    expect(row.input.src).toBe("input.png");
    expect(row.note).toBe("unit-test trim");
  });

  test("rejects on nonzero exit and logs status=error", async () => {
    const stub = writeStubBinary(3);
    process.env.RALPHY_MAGICK_PATH = stub;
    __setMagickBinaryForTest(undefined);

    await expect(
      runMagick(["bad.png", "broken.png"], {
        endpoint: "imagemagick/trim",
        input: { src: "bad.png" },
        opts: { projectId: PROJECT_ID },
      }),
    ).rejects.toThrow(/imagemagick exit 3/);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("imagemagick");
    expect(rows[0].status).toBe("error");
    expect(rows[0].cost_usd).toBe(0);
  });

  test("skips the gen-log when no projectId is set", async () => {
    const stub = writeStubBinary(0);
    process.env.RALPHY_MAGICK_PATH = stub;
    __setMagickBinaryForTest(undefined);

    await runMagick(["a.png", "b.png"], {
      endpoint: "imagemagick/convert",
      input: { src: "a.png" },
    });
    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(0);
  });

  test("throws the optional-dep message when no binary resolves", async () => {
    __setMagickBinaryForTest(null);
    await expect(
      runMagick(["a.png", "b.png"], {
        endpoint: "imagemagick/convert",
        input: { src: "a.png" },
      }),
    ).rejects.toThrow(/brew install imagemagick/);
  });
});
