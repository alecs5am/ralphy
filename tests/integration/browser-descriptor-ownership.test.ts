import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Chromium cleanup cannot close unrelated files during garbage collection", () => {
  // Run in a child: affected Bun versions can close the test runner's guarded
  // SQLite/event-loop descriptors and terminate it with macOS EXC_GUARD.
  const cutout = fileURLToPath(new URL("../../cli/lib/image/cutout.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["-e", `
    import fs from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { rasterizeSvg } from ${JSON.stringify(cutout)};
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-descriptor-"));
    const descriptors = [];
    try {
      const input = path.join(root, "input.svg");
      const output = path.join(root, "output.png");
      fs.writeFileSync(input, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
      await rasterizeSvg({ src: input, dst: output, size: 8 });
      const png = fs.readFileSync(output);
      for (let i = 0; i < 128; i++) descriptors.push(fs.openSync(input, "r"));
      for (let i = 0; i < 3; i++) { Bun.gc(true); await Bun.sleep(0); }
      const closed = descriptors.filter(fd => { try { fs.fstatSync(fd); return false; } catch { return true; } });
      console.log(JSON.stringify({ closed, count: descriptors.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }));
      if (closed.length) process.exitCode = 1;
    } finally {
      for (const fd of descriptors) { try { fs.closeSync(fd); } catch {} }
      fs.rmSync(root, { recursive: true, force: true });
    }
  `], { encoding: "utf8", timeout: 30_000 });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ closed: [], count: 128, width: 8, height: 8 });
});
