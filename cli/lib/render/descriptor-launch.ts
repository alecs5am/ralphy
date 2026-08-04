import { spawn, spawnSync } from "node:child_process";

const library = process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6";
const shim = `
import { dlopen } from "bun:ffi";
const request = JSON.parse(process.argv[1]);
const libc = dlopen(request.library, { fchdir: { args: ["i32"], returns: "i32" } });
if (libc.symbols.fchdir(3) !== 0) process.exit(126);
const child = Bun.spawn(request.argv, { cwd: ".", stdin: "ignore", stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).arrayBuffer(), new Response(child.stderr).arrayBuffer(), child.exited]);
await Bun.write(Bun.stdout, stdout);
await Bun.write(Bun.stderr, stderr);
process.exit(exitCode);
`;

export function spawnSyncInDirectory(directoryFd: number, argv: readonly string[]) {
  return spawnSync(process.execPath, ["-e", shim, JSON.stringify({ library, argv })], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe", directoryFd],
  });
}

export async function spawnInDirectory(directoryFd: number, argv: readonly string[]) {
  return new Promise<{ exitCode: number; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["-e", shim, JSON.stringify({ library, argv })], {
      env: process.env,
      stdio: ["ignore", "inherit", "pipe", directoryFd],
    });
    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
    child.on("error", () => resolve({ exitCode: 127, stderr }));
  });
}
