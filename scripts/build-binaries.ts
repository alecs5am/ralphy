// Cross-compile ralphy → standalone executables for all supported platforms.
//
// Uses `bun build --compile`. The Bun runtime is bundled inside each binary,
// so end users don't need bun (or node) installed to run it. Native deps that
// require platform-specific dynamic libs (Playwright Chromium, ffmpeg, whisper.cpp
// model files) are not bundled — they're downloaded/installed lazily at runtime.
//
// Usage:
//   bun run build:bin                # all targets, dist/binaries/
//   bun run build:bin -- --current   # current platform only (faster)
//   bun run build:bin -- --no-bytecode  # skip bytecode (smaller, slower start)
//   bun run build:bin -- --smoke     # after build, exec the current-platform binary's
//                                    # --version and fail (non-zero exit) if it crashes
//                                    # or prints no version. Guards against the #002
//                                    # class of bug: a "successful" build of a binary
//                                    # that crashes at startup (e.g. broken bytecode).

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

type Target = {
  /** Bun --target string */
  target: string;
  /** Output filename inside dist/binaries/ */
  out: string;
};

const ALL_TARGETS: Target[] = [
  { target: "bun-darwin-arm64", out: "ralphy-darwin-arm64" },
  { target: "bun-darwin-x64", out: "ralphy-darwin-x64" },
  { target: "bun-linux-x64", out: "ralphy-linux-x64" },
  { target: "bun-linux-arm64", out: "ralphy-linux-arm64" },
  { target: "bun-windows-x64", out: "ralphy-windows-x64.exe" },
];

function currentTarget(): Target {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const ext = os === "windows" ? ".exe" : "";
  return {
    target: `bun-${os}-${arch}`,
    out: `ralphy-${os}-${arch}${ext}`,
  };
}

async function build(target: Target, distDir: string, withBytecode: boolean): Promise<void> {
  const outPath = path.join(distDir, target.out);
  console.log(`▸ ${target.target} → ${target.out}`);

  const args = [
    "build",
    "--compile",
    "--minify",
    "--sourcemap",
    `--target=${target.target}`,
    // playwright-core ships an electron loader (lib/server/electron/loader.js)
    // that require()s "electron"; it's never reached at runtime, but the bundler
    // tries to resolve it. Keep electron external so the compile succeeds.
    "--external",
    "electron",
    "cli/index.ts",
    `--outfile=${outPath}`,
  ];
  if (withBytecode) args.splice(args.indexOf("--minify") + 1, 0, "--bytecode");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("bun", args, { stdio: "inherit" });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`build ${target.target} exited ${code}`)),
    );
    proc.on("error", reject);
  });
}

async function shasum(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Outcome of inspecting a `--version` spawn result. */
export type SmokeOutcome = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Pure verdict over a `spawnSync(--version)` result. Separated from the spawn so
 * the pass/fail logic is unit-testable without compiling a real binary. A binary
 * passes only when it exits 0 AND prints a semver-ish version to stdout — a
 * crashed binary (the #002 bytecode class) exits non-zero or prints its error to
 * stderr, leaving stdout empty, so both modes are caught here.
 */
export function evaluateSmokeResult(res: {
  error?: Error | null;
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
}): SmokeOutcome {
  if (res.error) {
    return { ok: false, reason: `failed to exec: ${res.error.message}` };
  }
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    return { ok: false, reason: `--version exited ${res.status}${detail ? `\n${detail}` : ""}` };
  }
  const version = (res.stdout || "").trim();
  if (!/\d+\.\d+\.\d+/.test(version)) {
    return { ok: false, reason: `--version printed no version (stdout=${JSON.stringify(version)})` };
  }
  return { ok: true, version };
}

/**
 * Post-build smoke test: exec the just-built current-platform binary's `--version`
 * and throw if it crashes or prints no version. The build step reports success
 * even when `bun build --compile` emits a broken binary (the #002 bytecode-crash
 * class), so a "✓ Built" log is NOT proof the binary runs. This closes that gap.
 *
 * Only the current-platform binary is exec-able on this host, so cross-target
 * builds are smoke-tested for the host's target only.
 */
function smoke(distDir: string): void {
  const cur = currentTarget();
  const binPath = path.join(distDir, cur.out);
  console.log(`\n▸ smoke: ${cur.out} --version`);

  const res = spawnSync(binPath, ["--version"], { encoding: "utf8", timeout: 60_000 });
  const outcome = evaluateSmokeResult(res);

  if (!outcome.ok) {
    throw new Error(`smoke: ${cur.out} ${outcome.reason}`);
  }
  console.log(`  ✓ ${outcome.version}`);
}

async function main() {
  const args = process.argv.slice(2);
  const onlyCurrent = args.includes("--current");
  const noBytecode = args.includes("--no-bytecode");
  const withSmoke = args.includes("--smoke");

  const distDir = path.resolve("dist/binaries");
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  const targets = onlyCurrent ? [currentTarget()] : ALL_TARGETS;

  console.log(`Building ${targets.length} binar${targets.length === 1 ? "y" : "ies"} → ${distDir}`);
  console.log(`  bytecode: ${noBytecode ? "off" : "on"}`);
  console.log("");

  const t0 = Date.now();
  for (const t of targets) {
    await build(t, distDir, !noBytecode);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // SHA256SUMS
  const sums: string[] = [];
  for (const t of targets) {
    const file = path.join(distDir, t.out);
    const stat = await fs.stat(file);
    sums.push(`${await shasum(file)}  ${t.out}`);
    console.log(`  ${t.out}  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  }
  await fs.writeFile(path.join(distDir, "SHA256SUMS"), sums.join("\n") + "\n");

  console.log(`\n✓ Built ${targets.length} binar${targets.length === 1 ? "y" : "ies"} in ${elapsed}s`);
  console.log(`  → ${distDir}`);

  if (withSmoke) smoke(distDir);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("build-binaries.ts") || process.argv[1].endsWith("build-binaries.js"));
if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
