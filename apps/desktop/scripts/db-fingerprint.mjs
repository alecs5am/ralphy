import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

async function fingerprint(path, hash = true) {
  try {
    const info = await stat(path, { bigint: true });
    let sha256 = null;
    if (hash) sha256 = await new Promise((resolve, reject) => {
      const digest = createHash("sha256");
      createReadStream(path).on("error", reject).on("data", (chunk) => digest.update(chunk)).on("end", () => resolve(digest.digest("hex")));
    });
    return { exists: true, sha256, bytes: info.size, mtimeNs: info.mtimeNs };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, sha256: null, bytes: null, mtimeNs: null };
    throw error;
  }
}

export async function snapshotDatabaseFamily(path = "/Users/maximovchinnikov/.ralphy/ralphy.db") {
  return {
    main: await fingerprint(path),
    wal: await fingerprint(`${path}-wal`),
    shm: await fingerprint(`${path}-shm`, false),
  };
}

const same = (left, right) => left.exists === right.exists && left.sha256 === right.sha256 && left.bytes === right.bytes && left.mtimeNs === right.mtimeNs;

export function compareDatabaseSnapshots(before, after) {
  const violations = [];
  if (!same(before.main, after.main)) violations.push("ralphy.db changed");
  if (!same(before.wal, after.wal)) violations.push("ralphy.db-wal changed");
  return { violations, shmChanged: !same(before.shm, after.shm) };
}
