import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("compiled render helpers pin their directory without Bun on PATH or leaking interpreter mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-render-portable-"));
  try {
    const entry = join(directory, "probe.ts"), binary = join(directory, "probe");
    writeFileSync(join(directory, "marker.txt"), "pinned source");
    writeFileSync(entry, `
      import { openSync, closeSync, constants } from "node:fs";
      import { spawnSyncInDirectory, spawnInDirectory } from ${JSON.stringify(resolve(import.meta.dir, "../../cli/lib/render/descriptor-launch.ts"))};
      import { runHyperframesRender } from ${JSON.stringify(resolve(import.meta.dir, "../../cli/lib/render/hyperframes.ts"))};
      const fd = openSync(process.argv[2], constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        const argv = ["/bin/sh", "-c", 'test -z "$BUN_BE_BUN" || exit 19; cat marker.txt'];
        const sync = spawnSyncInDirectory(fd, argv);
        const async = await spawnInDirectory(fd, argv);
        const args = { projectDir: process.argv[2], outputPath: "unused.mp4" };
        const failure = async (request) => {
          try { await runHyperframesRender(request); return null; }
          catch (error) { return { code: error.code, message: error.message }; }
        };
        console.log(JSON.stringify({
          sync: { status: sync.status, stdout: sync.stdout, stderr: sync.stderr }, async,
          direct: await failure(args),
          pinned: await failure({ ...args, projectFd: fd }),
        }));
      } finally { closeSync(fd); }
    `);
    const build = spawnSync(process.execPath, ["build", entry, "--compile", "--outfile", binary], { encoding: "utf8" });
    expect(build.status, build.stderr).toBe(0);
    const probe = spawnSync(binary, [directory], {
      env: { ...process.env, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 10_000,
    });
    expect(probe.status, probe.stderr).toBe(0);
    const result = JSON.parse(probe.stdout);
    expect(result.sync).toEqual({ status: 0, stdout: "pinned source", stderr: "" });
    expect(result.async).toEqual({ exitCode: 0, stderr: "" });
    expect(probe.stderr).toBe("pinned source");
    expect(result.direct.code).toBe("E_DEP_MISSING");
    expect(result.direct.message).toContain("Video rendering needs additional tools: bunx");
    expect(result.direct.message).toContain("saved timeline is preserved");
    expect(result.pinned).toEqual(result.direct);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
