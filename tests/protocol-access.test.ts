import { mkdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MediaProtocolAccess, resolveMediaByteRange } from "../electron/media/protocol-access";
import { makeLibraryFixture, type LibraryFixture } from "./fixtures";

let fixture: LibraryFixture | undefined;

afterEach(async () => {
  if (fixture) await rm(fixture.parentPath, { recursive: true, force: true });
  fixture = undefined;
});

describe("media protocol access", () => {
  test("resolves bounded, open-ended, and suffix byte ranges", () => {
    expect(resolveMediaByteRange(null, 4096)).toBeNull();
    expect(resolveMediaByteRange("bytes=1024-2047", 4096)).toEqual({ start: 1024, end: 2047 });
    expect(resolveMediaByteRange("bytes=1024-", 4096)).toEqual({ start: 1024, end: 4095 });
    expect(resolveMediaByteRange("bytes=-500", 4096)).toEqual({ start: 3596, end: 4095 });
    expect(resolveMediaByteRange("bytes=4000-9999", 4096)).toEqual({ start: 4000, end: 4095 });
  });

  test("rejects malformed and unsatisfiable byte ranges", () => {
    expect(resolveMediaByteRange("bytes=4096-", 4096)).toBeNull();
    expect(resolveMediaByteRange("bytes=10-9", 4096)).toBeNull();
    expect(resolveMediaByteRange("bytes=0-1,4-5", 4096)).toBeNull();
    expect(resolveMediaByteRange("items=0-1", 4096)).toBeNull();
    expect(resolveMediaByteRange("bytes=-0", 4096)).toBeNull();
  });

  test("mints only a trusted Core locator and never accepts an arbitrary path", async () => {
    fixture = await makeLibraryFixture();
    const access = new MediaProtocolAccess({ maxAssetBytes: 1024 });
    const mediaPath = join(fixture.alphaPath, "artifacts", "images", "hero.png");
    const bytes = (await stat(mediaPath)).size;

    const minted = await access.mintTrustedLocator(
      fixture.rootPath,
      mediaPath,
      "image/png",
      bytes,
    );
    expect(await access.resolve(fixture.rootPath, minted.token)).toBe(await realpath(mediaPath));
    await expect(access.mint(
      fixture.rootPath,
      join(fixture.betaPath, "artifacts", "videos", "beta.mp4"),
    )).rejects.toThrow(/selected project media/i);
  });

  test("rejects locator scope, MIME, and byte mismatches", async () => {
    fixture = await makeLibraryFixture();
    const access = new MediaProtocolAccess();
    const mediaPath = join(fixture.alphaPath, "artifacts", "images", "hero.png");
    const bytes = (await stat(mediaPath)).size;

    await expect(access.mintTrustedLocator(
      fixture.rootPath,
      "/tmp/outside.png",
      "image/png",
      bytes,
    )).rejects.toThrow(/outside/i);
    await expect(access.mintTrustedLocator(
      fixture.rootPath,
      mediaPath,
      "text/plain",
      bytes,
    )).rejects.toThrow(/unsupported/i);
    await expect(access.mintTrustedLocator(
      fixture.rootPath,
      mediaPath,
      "image/png",
      bytes + 1,
    )).rejects.toThrow(/size changed/i);
  });

  test("allows only explicit font locator MIME types", async () => {
    fixture = await makeLibraryFixture();
    const access = new MediaProtocolAccess();
    const fontsPath = join(fixture.alphaPath, "artifacts", "fonts");
    await mkdir(fontsPath);
    const supported = [
      ["typeface.ttf", "font/ttf"],
      ["typeface.otf", "font/otf"],
      ["typeface.woff", "font/woff"],
      ["typeface.woff2", "font/woff2"],
      ["legacy.ttf", "application/x-font-ttf"],
      ["legacy.otf", "application/x-font-opentype"],
      ["legacy.woff", "application/font-woff"],
      ["legacy-x.woff", "application/x-font-woff"],
      ["legacy.woff2", "application/x-font-woff2"],
      ["sfnt.ttf", "application/font-sfnt"],
    ] as const;

    for (const [name, mime] of supported) {
      const path = join(fontsPath, name);
      await writeFile(path, "font");
      await expect(access.mintTrustedLocator(fixture.rootPath, path, mime, 4))
        .resolves.toMatchObject({ sizeBytes: 4 });
    }

    const unsupportedPath = join(fontsPath, "unsupported.bin");
    await writeFile(unsupportedPath, "font");
    for (const mime of ["font/javascript", "application/font-executable", "application/octet-stream"]) {
      await expect(access.mintTrustedLocator(fixture.rootPath, unsupportedPath, mime, 4))
        .rejects.toThrow(/unsupported/i);
    }
  });

  test("authorizes any regular Core locator without minting a renderer token", async () => {
    fixture = await makeLibraryFixture();
    const access = new MediaProtocolAccess();
    const mediaPath = join(fixture.alphaPath, "artifacts", "images", "hero.png");
    const canonicalMediaPath = await realpath(mediaPath);
    const bytes = (await stat(mediaPath)).size;
    const linkedPath = join(fixture.alphaPath, "artifacts", "images", "linked.txt");
    await symlink(mediaPath, linkedPath);
    const aliasParent = join(fixture.parentPath, "alias");
    const linkedRoot = join(aliasParent, ".ralphy");
    await mkdir(aliasParent);
    await symlink(fixture.rootPath, linkedRoot);

    await expect(access.authorizeTrustedLocator(
      fixture.rootPath, canonicalMediaPath, "text/plain", bytes,
    )).resolves.toBe(canonicalMediaPath);
    await expect(access.authorizeTrustedLocator(
      fixture.rootPath, "/tmp/outside.txt", "text/plain", bytes,
    )).rejects.toThrow(/outside/i);
    await expect(access.authorizeTrustedLocator(
      fixture.rootPath, linkedPath, null, bytes,
    )).rejects.toThrow(/outside|symbolic link/i);
    await expect(access.authorizeTrustedLocator(
      linkedRoot, canonicalMediaPath, "text/plain", bytes,
    )).rejects.toThrow(/real directory|symbolic link/i);
    await expect(access.authorizeTrustedLocator(
      fixture.rootPath, canonicalMediaPath, "application/json", bytes + 1,
    )).rejects.toThrow(/size changed/i);
  });
});
