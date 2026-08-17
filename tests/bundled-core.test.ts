import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  sha256File,
  validateCoreSource,
} from "../scripts/bundled-core.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

async function fixtureDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ralphy-bundled-core-"));
  temporaryDirectories.push(path);
  return path;
}

describe("bundled core validation", () => {
  test("rejects missing, directory, symlink, and non-executable sources", async () => {
    const directory = await fixtureDirectory();
    const nestedDirectory = join(directory, "nested");
    const nonExecutable = join(directory, "non-executable");
    const link = join(directory, "link");

    await mkdir(nestedDirectory);
    await writeFile(nonExecutable, "core");
    await chmod(nonExecutable, 0o644);
    await symlink(nonExecutable, link);

    await expect(validateCoreSource(join(directory, "missing"))).rejects.toThrow();
    await expect(validateCoreSource(nestedDirectory)).rejects.toThrow();
    await expect(validateCoreSource(link)).rejects.toThrow();
    await expect(validateCoreSource(nonExecutable)).rejects.toThrow();
  });

  test("accepts a regular executable source", async () => {
    const directory = await fixtureDirectory();
    const executable = join(directory, "ralphy");
    await writeFile(executable, "#!/bin/sh\n");
    await chmod(executable, 0o755);

    await expect(validateCoreSource(executable)).resolves.toBeUndefined();
  });

  test("computes the file SHA-256", async () => {
    const directory = await fixtureDirectory();
    const source = join(directory, "ralphy");
    const contents = "#!/bin/sh\necho 0.3.0\n";
    await writeFile(source, contents);

    expect(await sha256File(source)).toBe(
      createHash("sha256").update(contents).digest("hex"),
    );
  });
});
