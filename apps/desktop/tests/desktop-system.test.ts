import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { probeLibrary } from "../electron/desktop-system";

describe("library health", () => {
  test("measures writes and disk space without leaving files behind", async () => {
    const root = await mkdtemp(join(tmpdir(), "ralphy-health-"));
    try {
      const result = await probeLibrary(root);
      expect(result.libraryWritable).toBe(true);
      expect(result.availableBytes).toBeGreaterThan(0);
      expect(await readdir(root)).toEqual([]);
      const missing = await probeLibrary(join(root, "missing"));
      expect(missing.libraryWritable).toBe(false);
      expect(missing.libraryError).toContain("ENOENT");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
