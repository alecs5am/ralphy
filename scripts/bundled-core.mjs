import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat } from "node:fs/promises";
import { constants } from "node:fs";

export async function validateCoreSource(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error(`Core source is not a regular file: ${path}`);
  await access(path, constants.X_OK);
}

export async function sha256File(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
