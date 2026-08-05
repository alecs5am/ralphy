import { createHash } from "node:crypto";
import fs from "node:fs";
import { dlopen } from "bun:ffi";

export type MigrationProcessIdentity = {
  pid: number;
  parentPid: number;
  uid: number;
  startId: string;
  executable: {
    pathHash: string;
    device: string;
    inode: string;
    mode: number;
    uid: number;
    nlink: number;
  };
};

export type MigrationProcessIdentityInspection =
  | { status: "present"; identity: MigrationProcessIdentity }
  | { status: "absent" }
  | { status: "unknown"; reason: string };

type InspectOptions = {
  /** @internal Deterministic test seam; production callers must omit it. */
  platform?: NodeJS.Platform;
  /** @internal Deterministic test seam; production callers must omit it. */
  read?: (pid: number) => MigrationProcessIdentity;
  /** @internal Deterministic test seam; production callers must omit it. */
  presence?: (pid: number) => "present" | "absent" | "unknown";
  /** @internal Deterministic test seam; production callers must omit it. */
  darwinSymbols?: DarwinSymbols;
  /** @internal Deterministic test seam; production callers must omit it. */
  procRoot?: string;
  /** @internal Deterministic race seam; production callers must omit it. */
  afterProcessSnapshot?: () => void;
};

export function inspectMigrationProcessIdentity(
  pid: number,
  options: InspectOptions = {},
): MigrationProcessIdentity {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("Migration process identity PID is invalid");
  }
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    throw new Error(`Migration process identity platform is unsupported: ${platform}`);
  }
  const read = options.read ?? (platform === "darwin"
    ? (target: number) => readDarwinIdentity(target, options)
    : (target: number) => readLinuxIdentity(target, options));
  try {
    const first = checkedIdentity(pid, read(pid));
    const second = checkedIdentity(pid, read(pid));
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error("Migration process identity changed between reads");
    }
    return first;
  } catch (error) {
    if (error instanceof Error && /changed between reads|PID is invalid|platform is unsupported/u.test(error.message)) {
      throw error;
    }
    throw new Error("Migration process identity is unavailable", { cause: error });
  }
}

export function inspectMigrationProcessIdentityState(
  pid: number,
  options: InspectOptions = {},
): MigrationProcessIdentityInspection {
  try {
    return { status: "present", identity: inspectMigrationProcessIdentity(pid, options) };
  } catch (error) {
    if (error instanceof Error && /platform is unsupported/u.test(error.message)) {
      return { status: "unknown", reason: error.message };
    }
    const presence = (options.presence ?? processPresence)(pid);
    if (presence === "absent") return { status: "absent" };
    return {
      status: "unknown",
      reason: "Migration process identity is unavailable",
    };
  }
}

function checkedIdentity(pid: number, value: MigrationProcessIdentity): MigrationProcessIdentity {
  if (
    value.pid !== pid
    || !Number.isSafeInteger(value.parentPid) || value.parentPid < 0
    || !Number.isSafeInteger(value.uid) || value.uid < 0
    || !/^(?:darwin:\d+:\d+|linux:\d+|test:\d+:\d+)$/u.test(value.startId)
    || !/^[a-f0-9]{64}$/u.test(value.executable.pathHash)
    || !/^\d+$/u.test(value.executable.device)
    || !/^\d+$/u.test(value.executable.inode)
    || !Number.isSafeInteger(value.executable.mode) || value.executable.mode < 0 || value.executable.mode > 0o7777
    || !Number.isSafeInteger(value.executable.uid) || value.executable.uid < 0
    || !Number.isSafeInteger(value.executable.nlink) || value.executable.nlink < 1
  ) throw new Error("Migration process identity is invalid");
  return value;
}

type DarwinSymbols = {
  proc_pidinfo(pid: number, flavor: number, arg: bigint, buffer: Buffer, size: number): number;
  proc_pidpath(pid: number, buffer: Buffer, size: number): number;
};

const retainedDarwinLibraries: unknown[] = [];
let retainedDarwinSymbols: DarwinSymbols | null = null;

function darwinSymbols(): DarwinSymbols {
  if (retainedDarwinSymbols) return retainedDarwinSymbols;
  const library = dlopen("/usr/lib/libproc.dylib", {
    proc_pidinfo: { args: ["i32", "i32", "u64", "buffer", "i32"], returns: "i32" },
    proc_pidpath: { args: ["i32", "buffer", "u32"], returns: "i32" },
  });
  retainedDarwinLibraries.push(library);
  retainedDarwinSymbols = library.symbols as unknown as DarwinSymbols;
  return retainedDarwinSymbols;
}

function readDarwinIdentity(pid: number, options: InspectOptions): MigrationProcessIdentity {
  const symbols = options.darwinSymbols ?? darwinSymbols();
  const before = readDarwinProcess(pid, symbols);
  options.afterProcessSnapshot?.();
  const executable = readDarwinExecutable(pid, symbols);
  const after = readDarwinProcess(pid, symbols);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Migration process identity changed around executable inspection");
  }
  return { ...before, executable };
}

function readDarwinProcess(
  pid: number,
  symbols: DarwinSymbols,
): Omit<MigrationProcessIdentity, "executable"> {
  const info = Buffer.alloc(136);
  if (symbols.proc_pidinfo(pid, 3, 0n, info, info.length) !== info.length) {
    throw new Error("proc_pidinfo returned a short record");
  }
  const startSeconds = info.readBigUInt64LE(120);
  const startMicroseconds = info.readBigUInt64LE(128);
  if (startMicroseconds >= 1_000_000n) throw new Error("proc_pidinfo start time is invalid");
  return {
    pid: info.readUInt32LE(12),
    parentPid: info.readUInt32LE(16),
    uid: info.readUInt32LE(20),
    startId: `darwin:${startSeconds}:${startMicroseconds}`,
  };
}

function readDarwinExecutable(
  pid: number,
  symbols: DarwinSymbols,
): MigrationProcessIdentity["executable"] {
  const pathBuffer = Buffer.alloc(4096);
  const pathBytes = symbols.proc_pidpath(pid, pathBuffer, pathBuffer.length);
  if (pathBytes <= 0 || pathBytes >= pathBuffer.length) throw new Error("proc_pidpath failed");
  const nul = pathBuffer.indexOf(0);
  const executablePath = pathBuffer.subarray(0, nul >= 0 && nul < pathBytes ? nul : pathBytes).toString("utf8");
  return executableIdentity(executablePath);
}

function readLinuxIdentity(pid: number, options: InspectOptions): MigrationProcessIdentity {
  const processRoot = pathForProcess(options.procRoot ?? "/proc", pid);
  const before = readLinuxProcess(pid, processRoot);
  options.afterProcessSnapshot?.();
  const executableLink = `${processRoot}/exe`;
  const executablePath = fs.realpathSync(executableLink);
  const executable = executableIdentity(executablePath, executableLink);
  const after = readLinuxProcess(pid, processRoot);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Migration process identity changed around executable inspection");
  }
  return { ...before, executable };
}

function readLinuxProcess(
  pid: number,
  processRoot: string,
): Omit<MigrationProcessIdentity, "executable"> {
  const stat = fs.readFileSync(`${processRoot}/stat`, "utf8");
  const startName = stat.indexOf("(");
  const endName = stat.lastIndexOf(")");
  const statPid = Number(stat.slice(0, startName).trim());
  if (startName < 1 || endName <= startName || statPid !== pid) {
    throw new Error("Linux process stat is invalid");
  }
  const fields = stat.slice(endName + 1).trim().split(/\s+/u);
  const parentPid = Number(fields[1]);
  const startTicks = fields[19];
  const uidMatch = fs.readFileSync(`${processRoot}/status`, "utf8")
    .match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/mu);
  if (!Number.isSafeInteger(parentPid) || parentPid < 0 || !/^\d+$/u.test(startTicks ?? "") || !uidMatch) {
    throw new Error("Linux process identity is invalid");
  }
  return {
    pid,
    parentPid,
    uid: Number(uidMatch[2]),
    startId: `linux:${startTicks}`,
  };
}

function executableIdentity(executablePath: string, statPath = executablePath): MigrationProcessIdentity["executable"] {
  if (!executablePath.startsWith("/")) throw new Error("Process executable path is invalid");
  const canonicalPath = fs.realpathSync(executablePath);
  if (statPath === executablePath && fs.lstatSync(executablePath).isSymbolicLink()) {
    throw new Error("Process executable path cannot be a symlink");
  }
  const stat = fs.statSync(statPath, { bigint: true });
  if (!stat.isFile()) throw new Error("Process executable is not a regular file");
  return {
    pathHash: createHash("sha256").update(canonicalPath, "utf8").digest("hex"),
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: Number(stat.mode & 0o7777n),
    uid: Number(stat.uid),
    nlink: Number(stat.nlink),
  };
}

function pathForProcess(procRoot: string, pid: number): string {
  if (!pathIsAbsoluteRealDirectory(procRoot)) throw new Error("Linux proc root is invalid");
  return `${procRoot}/${pid}`;
}

function pathIsAbsoluteRealDirectory(value: string): boolean {
  if (!value.startsWith("/")) return false;
  const stat = fs.lstatSync(value);
  return stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(value) === value;
}

function processPresence(pid: number): "present" | "absent" | "unknown" {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown";
  try {
    process.kill(pid, 0);
    return "present";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return "absent";
    if (code === "EPERM") return "present";
    return "unknown";
  }
}
