import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYNC_READ_METHODS = [
  "accessSync",
  "existsSync",
  "lstatSync",
  "openSync",
  "opendirSync",
  "readFileSync",
  "readdirSync",
  "readlinkSync",
  "realpathSync",
  "statSync",
] as const;
const CALLBACK_READ_METHODS = [
  "access",
  "exists",
  "lstat",
  "open",
  "opendir",
  "readFile",
  "readdir",
  "readlink",
  "realpath",
  "stat",
] as const;
const PROMISE_READ_METHODS = [
  "access",
  "lstat",
  "open",
  "opendir",
  "readFile",
  "readdir",
  "readlink",
  "realpath",
  "stat",
] as const;

type MutableMethods = Record<string, (...args: unknown[]) => unknown>;

export function withPoisonFarmReadTrap<T>(
  rootDir: string,
  read: () => T,
): { result: T; touched: string[] } {
  const farm = path.join(rootDir, ".ralphy", "farm");
  fs.mkdirSync(path.join(farm, "buckets", "poison"), { recursive: true });
  fs.writeFileSync(path.join(farm, "identity.json"), "{}");
  fs.writeFileSync(path.join(farm, "buckets", "poison", "object.bin"), "poison");

  const touched: string[] = [];
  const restorers: Array<() => void> = [];
  const record = (name: string, target: unknown): void => {
    const targetPath = normalizePath(target);
    if (targetPath === farm || targetPath.startsWith(`${farm}${path.sep}`)) {
      touched.push(`${name}:${targetPath}`);
    }
  };
  const wrap = (
    owner: MutableMethods,
    name: string,
    label = name,
  ): void => {
    const original = owner[name];
    if (typeof original !== "function") return;
    owner[name] = (...args: unknown[]) => {
      record(label, args[0]);
      return Reflect.apply(original, owner, args);
    };
    restorers.push(() => {
      owner[name] = original;
    });
  };
  const restore = (): void => {
    for (const undo of restorers.reverse()) undo();
  };

  const mutableFs = fs as unknown as MutableMethods;
  const mutablePromises = fs.promises as unknown as MutableMethods;
  for (const name of SYNC_READ_METHODS) wrap(mutableFs, name);
  for (const name of CALLBACK_READ_METHODS) wrap(mutableFs, name);
  for (const name of PROMISE_READ_METHODS) {
    wrap(mutablePromises, name, `promises.${name}`);
  }
  wrap(mutableFs, "createReadStream");

  const mutableBun = Bun as unknown as MutableMethods;
  wrap(mutableBun, "file", "Bun.file");

  try {
    const result = read();
    if (isPromiseLike(result)) {
      return {
        result: Promise.resolve(result).finally(restore) as T,
        touched,
      };
    }
    restore();
    return { result, touched };
  } catch (error) {
    restore();
    throw error;
  }
}

function normalizePath(value: unknown): string {
  if (value instanceof URL && value.protocol === "file:") return fileURLToPath(value);
  if (Buffer.isBuffer(value)) return path.resolve(value.toString());
  if (typeof value !== "string") return String(value);
  return path.resolve(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
