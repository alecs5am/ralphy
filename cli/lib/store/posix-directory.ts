import { dlopen, read, toBuffer, type Pointer } from "bun:ffi";
import fs from "node:fs";

export type DirectoryEntry = {
  bytes: Buffer;
  mode: number;
  uid: number;
  dev: number;
  ino: number;
};

const ENOENT = 2;
const EEXIST = 17;
const RENAME_EXCLUSIVE = process.platform === "darwin" ? 0x4 : 0x1;
const AT_REMOVEDIR = process.platform === "darwin" ? 0x80 : 0x200;
const libraryName =
  process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6";

const native = dlopen(libraryName, {
  openat: {
    args: ["i32", "cstring", "i32", "u32"],
    returns: "i32",
  },
  mkdirat: {
    args: ["i32", "cstring", "u32"],
    returns: "i32",
  },
  renameat: {
    args: ["i32", "cstring", "i32", "cstring"],
    returns: "i32",
  },
  unlinkat: {
    args: ["i32", "cstring", "i32"],
    returns: "i32",
  },
  dup: {
    args: ["i32"],
    returns: "i32",
  },
  fdopendir: {
    args: ["i32"],
    returns: "ptr",
  },
  readdir: {
    args: ["ptr"],
    returns: "ptr",
  },
  closedir: {
    args: ["ptr"],
    returns: "i32",
  },
  ...(process.platform === "darwin"
    ? {
        renameatx_np: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
        __getdirentries64: {
          args: ["i32", "buffer", "u64", "ptr"],
          returns: "i64",
        },
        __error: {
          args: [],
          returns: "ptr",
        },
      }
    : {
        renameat2: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
        __errno_location: {
          args: [],
          returns: "ptr",
        },
      }),
});

export function openRootDirectory(directory: string): number {
  return fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

export function openDirectoryAt(
  parent: number,
  name: string,
  createMode?: number,
): { fd: number; created: boolean } {
  const checkedName = component(name);
  const existing = openAt(parent, checkedName, directoryFlags(), 0);
  if (existing >= 0) return { fd: existing, created: false };
  if (createMode === undefined || errno() !== ENOENT) throw new PosixDirectoryError();
  const created = native.symbols.mkdirat(parent, checkedName, createMode) === 0;
  if (!created && errno() !== EEXIST) throw new PosixDirectoryError();
  const fd = openAt(parent, checkedName, directoryFlags(), 0);
  if (fd < 0) throw new PosixDirectoryError();
  return { fd, created };
}

export function openExistingDirectoryAt(parent: number, name: string): number | null {
  const fd = openAt(parent, component(name), directoryFlags(), 0);
  if (fd >= 0) return fd;
  if (errno() === ENOENT) return null;
  throw new PosixDirectoryError();
}

export function readFileAt(
  directory: number,
  name: string,
  maximumBytes?: number,
): DirectoryEntry | null {
  const fd = openAt(
    directory,
    component(name),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    0,
  );
  if (fd < 0) {
    if (errno() === ENOENT) return null;
    throw new PosixDirectoryError();
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (maximumBytes !== undefined && stat.size > maximumBytes)) {
      throw new PosixDirectoryError();
    }
    return {
      bytes: fs.readFileSync(fd),
      mode: stat.mode & 0o777,
      uid: stat.uid,
      dev: stat.dev,
      ino: stat.ino,
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function openRegularFileAt(directory: number, name: string): number | null {
  const fd = openAt(
    directory,
    component(name),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    0,
  );
  if (fd < 0) {
    if (errno() === ENOENT) return null;
    throw new PosixDirectoryError();
  }
  if (!fs.fstatSync(fd).isFile()) {
    fs.closeSync(fd);
    throw new PosixDirectoryError();
  }
  return fd;
}

export function createExclusiveRegularFileAt(
  directory: number,
  name: string,
  mode: number,
): number | null {
  const fd = openAt(
    directory,
    component(name),
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    mode,
  );
  if (fd < 0) {
    if (errno() === EEXIST) return null;
    throw new PosixDirectoryError();
  }
  fs.fchmodSync(fd, mode);
  return fd;
}

export function renameExclusiveAt(
  sourceDirectory: number,
  sourceName: string,
  destinationDirectory: number,
  destinationName: string,
): boolean {
  const symbols = native.symbols as unknown as {
    renameatx_np?: (
      sourceDirectory: number,
      sourceName: Buffer,
      destinationDirectory: number,
      destinationName: Buffer,
      flags: number,
    ) => number;
    renameat2?: (
      sourceDirectory: number,
      sourceName: Buffer,
      destinationDirectory: number,
      destinationName: Buffer,
      flags: number,
    ) => number;
  };
  const result = process.platform === "darwin"
    ? symbols.renameatx_np!(
        sourceDirectory,
        component(sourceName),
        destinationDirectory,
        component(destinationName),
        RENAME_EXCLUSIVE,
      )
    : symbols.renameat2!(
        sourceDirectory,
        component(sourceName),
        destinationDirectory,
        component(destinationName),
        RENAME_EXCLUSIVE,
      );
  if (result === 0) return true;
  if (errno() === EEXIST) return false;
  throw new PosixDirectoryError();
}

export function writeFileAt(
  directory: number,
  name: string,
  bytes: string | Buffer,
  mode: number,
): void {
  const checkedName = component(name);
  const temporaryName = `.ralphy-write-${crypto.randomUUID()}.tmp`;
  const temporary = component(temporaryName);
  const fd = openAt(
    directory,
    temporary,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    mode,
  );
  if (fd < 0) throw new PosixDirectoryError();
  let renamed = false;
  try {
    fs.fchmodSync(fd, mode);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    if (native.symbols.renameat(directory, temporary, directory, checkedName) !== 0) {
      throw new PosixDirectoryError();
    }
    renamed = true;
  } finally {
    fs.closeSync(fd);
    if (!renamed) unlinkAt(directory, temporaryName, false, true);
  }
}

export function unlinkAt(
  directory: number,
  name: string,
  removeDirectory: boolean,
  ignoreMissing = false,
): void {
  if (
    native.symbols.unlinkat(
      directory,
      component(name),
      removeDirectory ? AT_REMOVEDIR : 0,
    ) !== 0 &&
    !(ignoreMissing && errno() === ENOENT)
  ) {
    throw new PosixDirectoryError();
  }
}

export function removeDirectoryContents(directory: number): void {
  for (const name of readDirectoryAt(directory)) {
    try {
      const child = openDirectoryAt(directory, name);
      try {
        removeDirectoryContents(child.fd);
      } finally {
        fs.closeSync(child.fd);
      }
      unlinkAt(directory, name, true);
    } catch (error) {
      if (!(error instanceof PosixDirectoryError)) throw error;
      unlinkAt(directory, name, false);
    }
  }
}

export function readDirectoryAt(directory: number): string[] {
  if (process.platform === "darwin") return readDarwinDirectoryAt(directory);
  const duplicate = native.symbols.dup(directory);
  if (duplicate < 0) throw new PosixDirectoryError();
  const stream = native.symbols.fdopendir(duplicate);
  if (stream === null) {
    fs.closeSync(duplicate);
    throw new PosixDirectoryError();
  }
  const names: string[] = [];
  try {
    for (;;) {
      const entry = native.symbols.readdir(stream);
      if (entry === null) break;
      const name = directoryEntryName(entry);
      if (name !== "." && name !== "..") {
        component(name);
        names.push(name);
      }
    }
  } finally {
    if (native.symbols.closedir(stream) !== 0) throw new PosixDirectoryError();
  }
  return names;
}

function readDarwinDirectoryAt(directory: number): string[] {
  const fd = openAt(directory, Buffer.from(".\0"), directoryFlags(), 0);
  if (fd < 0) throw new PosixDirectoryError();
  const symbols = native.symbols as unknown as {
    __getdirentries64: (
      fd: number,
      buffer: Buffer,
      length: bigint,
      base: BigInt64Array,
    ) => number | bigint;
  };
  const buffer = Buffer.allocUnsafe(32_768);
  const base = new BigInt64Array(1);
  const names: string[] = [];
  try {
    for (;;) {
      const byteCount = Number(
        symbols.__getdirentries64(fd, buffer, BigInt(buffer.length), base),
      );
      if (byteCount < 0) throw new PosixDirectoryError();
      if (byteCount === 0) break;
      for (let offset = 0; offset < byteCount; ) {
        const recordLength = buffer.readUInt16LE(offset + 16);
        const nameLength = buffer.readUInt16LE(offset + 18);
        if (
          recordLength < 24 ||
          offset + recordLength > byteCount ||
          nameLength > recordLength - 21
        ) {
          throw new PosixDirectoryError();
        }
        const name = buffer.subarray(offset + 21, offset + 21 + nameLength).toString();
        if (name !== "." && name !== "..") {
          component(name);
          names.push(name);
        }
        offset += recordLength;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return names;
}

function directoryEntryName(entry: Pointer): string {
  if (process.platform === "darwin") {
    return toBuffer(entry, 21, read.u16(entry, 18)).toString("utf8");
  }
  const recordLength = read.u16(entry, 16);
  const bytes = toBuffer(entry, 19, recordLength - 19);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end < 0 ? bytes.length : end).toString("utf8");
}

function directoryFlags(): number {
  return fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
}

function openAt(
  directory: number,
  name: Buffer,
  flags: number,
  mode: number,
): number {
  return native.symbols.openat(directory, name, flags, mode);
}

function component(value: string): Buffer {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\0")
  ) {
    throw new PosixDirectoryError();
  }
  return Buffer.from(`${value}\0`);
}

function errno(): number {
  const symbols = native.symbols as unknown as {
    __error?: () => Pointer | null;
    __errno_location?: () => Pointer | null;
  };
  const pointer =
    process.platform === "darwin" ? symbols.__error?.() : symbols.__errno_location?.();
  if (pointer === null || pointer === undefined) throw new PosixDirectoryError();
  return read.i32(pointer);
}

export class PosixDirectoryError extends Error {}
