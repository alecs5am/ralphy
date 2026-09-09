import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  REFERENCE_SHA256,
  prepareInstrumentEvidence,
} from "../scripts/prepare-instrument-evidence.mjs";

const ARCHIVE_PATH = "/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip";
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  return mkdtemp(join(await realpath(tmpdir()), "ralphy-instrument-reference-"));
}

async function freshReference() {
  const directory = await temporaryDirectory();
  temporaryDirectories.push(directory);
  const evidenceRoot = join(directory, ".superpowers", "sdd", "nothing-instrument");
  const result = await prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot });
  expect(result.readme).toContain(evidenceRoot);
  return { evidenceRoot, result };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("instrument design reference", () => {
  it("pins the archive and prepares isolated evidence idempotently", async () => {
    expect(REFERENCE_SHA256).toBe("fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804");
    expect(readFileSync(".gitignore", "utf8")).toContain(".superpowers/sdd/nothing-instrument/");

    const { evidenceRoot, result } = await freshReference();
    expect(result).toMatchObject({
      readme: expect.stringContaining("design_handoff_instrument/README.md"),
      mediaSections: ["3a", "3b"],
    });
    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot })).resolves.toEqual(result);
  });

  it("refuses a symlinked evidence root before extraction can leave it", async () => {
    const directory = await temporaryDirectory();
    temporaryDirectories.push(directory);
    const evidenceRoot = join(directory, ".superpowers", "sdd", "nothing-instrument");
    const externalRoot = join(directory, "external");
    await mkdir(join(directory, ".superpowers", "sdd"), { recursive: true });
    await mkdir(externalRoot);
    await symlink(externalRoot, evidenceRoot, "dir");

    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot })).rejects.toThrow("symlink");
    expect(existsSync(join(externalRoot, "reference"))).toBe(false);
  });

  it("refuses a pre-existing evidence root behind a symlinked path component", async () => {
    const directory = await temporaryDirectory();
    temporaryDirectories.push(directory);
    const externalRoot = join(directory, "external");
    const link = join(directory, "linked");
    await mkdir(join(externalRoot, "evidence"), { recursive: true });
    await symlink(externalRoot, link, "dir");

    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot: join(link, "evidence") })).rejects.toThrow("symlink");
    expect(existsSync(join(externalRoot, "evidence", "reference"))).toBe(false);
  });

  it("refuses zero-byte and modified reference files", async () => {
    const { evidenceRoot, result } = await freshReference();
    await writeFile(result.readme, "");

    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot })).rejects.toThrow("mismatched reference directory");
  });

  it("refuses modified local media assets", async () => {
    const { evidenceRoot, result } = await freshReference();
    await writeFile(result.localMediaAssets[0], "modified media asset");

    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot })).rejects.toThrow("mismatched reference directory");
  });

  it("refuses missing and extra evidence files", async () => {
    const { evidenceRoot, result } = await freshReference();
    await rm(result.localMediaAssets[0]);
    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot })).rejects.toThrow("mismatched reference directory");

    const second = await freshReference();
    await writeFile(join(second.evidenceRoot, "reference", "design_handoff_instrument", "extra.txt"), "extra");
    await expect(prepareInstrumentEvidence({ archivePath: ARCHIVE_PATH, evidenceRoot: second.evidenceRoot })).rejects.toThrow("mismatched reference directory");
  });
});
