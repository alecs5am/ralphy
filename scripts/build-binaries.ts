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

import { spawn } from "node:child_process";
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

async function main() {
  const args = process.argv.slice(2);
  const onlyCurrent = args.includes("--current");
  const noBytecode = args.includes("--no-bytecode");

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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
