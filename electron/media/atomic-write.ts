import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type RenameFile = typeof rename;

export interface GuardedAtomicWriteOptions {
  maxBytes: number;
  assertCurrent?: () => void;
  renameFile?: RenameFile;
}

const writes = new Map<string, Promise<unknown>>();

async function writeSynced(path: string, data: Buffer): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function readPrevious(path: string, maxBytes: number): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) {
      throw new Error("Atomic write target is too large to preserve");
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

async function restorePrevious(
  path: string,
  previous: Buffer | null,
  renameFile: RenameFile,
): Promise<void> {
  const directory = dirname(path);
  if (previous === null) {
    await rm(path, { force: true });
    await syncDirectory(directory);
    return;
  }
  const temporary = join(
    directory,
    `.${basename(path)}.${randomUUID()}.rollback`,
  );
  try {
    await writeSynced(temporary, previous);
    await renameFile(temporary, path);
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function performGuardedAtomicWrite(
  path: string,
  value: string | Buffer,
  options: GuardedAtomicWriteOptions,
): Promise<void> {
  const assertCurrent = options.assertCurrent ?? (() => undefined);
  const renameFile = options.renameFile ?? rename;
  const maxBytes = Math.max(1, Math.floor(options.maxBytes));
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (data.length > maxBytes) throw new Error("Atomic write payload is too large");

  assertCurrent();
  const existing = await lstat(path).catch(() => null);
  assertCurrent();
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new Error("Atomic write target must be a regular file");
  }
  if (existing && existing.size > maxBytes) {
    throw new Error("Atomic write target is too large to preserve");
  }
  const previous = existing ? await readPrevious(path, maxBytes) : null;
  assertCurrent();

  const directory = dirname(path);
  const temporary = join(
    directory,
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let replaced = false;
  try {
    await writeSynced(temporary, data);
    assertCurrent();
    await renameFile(temporary, path);
    replaced = true;
    assertCurrent();
    await syncDirectory(directory);
    assertCurrent();
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (replaced) {
      try {
        await restorePrevious(path, previous, renameFile);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Atomic write failed and could not restore the previous file",
        );
      }
    }
    throw error;
  }
}

export async function guardedAtomicWrite(
  path: string,
  value: string | Buffer,
  options: GuardedAtomicWriteOptions,
): Promise<void> {
  const previous = writes.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => (
    performGuardedAtomicWrite(path, value, options)
  ));
  writes.set(path, next);
  try {
    await next;
  } finally {
    if (writes.get(path) === next) writes.delete(path);
  }
}
