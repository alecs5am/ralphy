// Unit tests for the zip-flatten helpers used by `ralphy assets unpack` (#048).

import { describe, test, expect } from "bun:test";
import { flattenEntryName, unpackBrandZip } from "../../cli/lib/unpack-zip.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function hasZip(): boolean {
  return spawnSync("zip", ["-v"], { stdio: "ignore" }).status === 0;
}
function hasUnzip(): boolean {
  return spawnSync("unzip", ["-v"], { stdio: "ignore" }).status === 0;
}

describe("flattenEntryName", () => {
  test("drops first segment + kebabs the rest", () => {
    expect(flattenEntryName("Brand Assets/Logos/Logo Primary.svg")).toBe(
      "logos-logo-primary.svg",
    );
  });

  test("handles single-segment paths", () => {
    expect(flattenEntryName("logo.svg")).toBe("logo.svg");
  });

  test("normalizes uppercase and special chars", () => {
    expect(flattenEntryName("Brand/GLITCH Icons/Glitch_Purple.png")).toBe(
      "glitch-icons-glitch-purple.png",
    );
  });

  test("preserves extension casing as lowercase", () => {
    expect(flattenEntryName("Pack/Image.PNG")).toBe("image.png");
  });

  test("empty path returns a fallback", () => {
    expect(flattenEntryName("")).toBe("file");
  });
});

describe("unpackBrandZip integration", () => {
  test("flattens, drops __MACOSX/.DS_Store, suffixes collisions", async () => {
    if (!hasZip() || !hasUnzip()) {
      console.warn("`zip`/`unzip` missing — skipping unpackBrandZip test");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unpack-zip-"));
    try {
      const src = path.join(tmp, "src");
      fs.mkdirSync(path.join(src, "Brand Pack/Logos"), { recursive: true });
      fs.mkdirSync(path.join(src, "Brand Pack/Icons"), { recursive: true });
      fs.mkdirSync(path.join(src, "__MACOSX/Brand Pack"), { recursive: true });
      fs.writeFileSync(path.join(src, "Brand Pack/Logos/Primary.svg"), "<svg>A</svg>");
      fs.writeFileSync(path.join(src, "Brand Pack/Icons/Primary.svg"), "<svg>B</svg>");
      fs.writeFileSync(path.join(src, "Brand Pack/.DS_Store"), "ds-store-junk");
      fs.writeFileSync(path.join(src, "__MACOSX/Brand Pack/._Primary.svg"), "resource-fork");

      const zipPath = path.join(tmp, "brand.zip");
      const r = spawnSync("zip", ["-r", zipPath, "."], { cwd: src, stdio: "ignore" });
      expect(r.status).toBe(0);

      const destDir = path.join(tmp, "out");
      const result = await unpackBrandZip(zipPath, destDir);
      expect(result.entries.length).toBe(2);
      const flatNames = result.entries.map((e) => e.flatName).sort();
      expect(flatNames).toEqual(["icons-primary.svg", "logos-primary.svg"]);
      for (const e of result.entries) {
        expect(fs.existsSync(e.dest)).toBe(true);
      }
      expect(result.skipped.some((p) => p.includes("__MACOSX"))).toBe(true);
      expect(result.skipped.some((p) => p.endsWith(".DS_Store"))).toBe(true);
      const landed = fs.readdirSync(destDir);
      expect(landed).not.toContain(".DS_Store");
      expect(landed.every((n) => !n.startsWith("._"))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("idempotent: re-running on the same zip is a no-op for landed files", async () => {
    if (!hasZip() || !hasUnzip()) {
      console.warn("`zip`/`unzip` missing — skipping idempotency test");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unpack-zip-"));
    try {
      const src = path.join(tmp, "src");
      fs.mkdirSync(path.join(src, "Pack/Logos"), { recursive: true });
      fs.writeFileSync(path.join(src, "Pack/Logos/A.svg"), "<svg>A</svg>");
      const zipPath = path.join(tmp, "brand.zip");
      spawnSync("zip", ["-r", zipPath, "."], { cwd: src, stdio: "ignore" });

      const destDir = path.join(tmp, "out");
      const first = await unpackBrandZip(zipPath, destDir);
      const second = await unpackBrandZip(zipPath, destDir);
      expect(first.entries.length).toBe(1);
      expect(second.entries.length).toBe(1);
      expect(first.entries[0]?.dest).toBe(second.entries[0]?.dest);
      const landed = fs.readdirSync(destDir);
      expect(landed.length).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
