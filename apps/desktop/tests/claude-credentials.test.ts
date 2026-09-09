import { constants } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, open, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EncryptedCredentialStore,
  validateAnthropicApiKey,
  validateOpenRouterApiKey,
} from "../electron/claude/credentials";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

describe("EncryptedCredentialStore", () => {
  test("persists only encrypted API-key bytes and can clear them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-claude-key-"));
    cleanupPaths.push(directory);
    const path = join(directory, "credential.bin");
    const store = new EncryptedCredentialStore({
      path,
      validate: validateAnthropicApiKey,
      cipher: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`sealed:${value}`).reverse(),
        decryptString: (value) => Buffer.from(value).reverse().toString().slice("sealed:".length),
      },
    });

    await store.write("sk-ant-secret-1234567890");

    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("sk-ant-secret-1234567890");
    expect(await store.read()).toBe("sk-ant-secret-1234567890");
    expect(await store.has()).toBe(true);

    await store.clear();
    expect(await store.read()).toBeNull();
    expect(await store.has()).toBe(false);
  });

  test("rejects invalid plaintext and unavailable platform encryption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-claude-key-"));
    cleanupPaths.push(directory);
    const store = new EncryptedCredentialStore({
      path: join(directory, "credential.bin"),
      validate: validateAnthropicApiKey,
      cipher: {
        isEncryptionAvailable: () => false,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString(),
      },
    });

    await expect(store.write("sk-ant-secret-1234567890")).rejects.toThrow("encryption");
    await expect(store.write("short")).rejects.toThrow("Invalid Anthropic API key");
    await expect(store.write("sk-ant-secret-1234567890\nleak")).rejects.toThrow(
      "Invalid Anthropic API key",
    );
  });

  test("uses a provider-specific validator for OpenRouter keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-openrouter-key-"));
    cleanupPaths.push(directory);
    const store = new EncryptedCredentialStore({
      path: join(directory, "credential.bin"),
      validate: validateOpenRouterApiKey,
      cipher: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`sealed:${value}`).reverse(),
        decryptString: (value) => Buffer.from(value).reverse().toString().slice("sealed:".length),
      },
    });

    await store.write("sk-or-v1-secret-1234567890");
    expect(await store.read()).toBe("sk-or-v1-secret-1234567890");
    await expect(store.write("sk-ant-secret-1234567890")).rejects.toThrow("OpenRouter");
  });

  test("opens without following symlinks and reads through the same file descriptor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-credential-fd-"));
    cleanupPaths.push(directory);
    const path = join(directory, "credential.bin");
    const moved = join(directory, "credential-opened.bin");
    const original = "sk-ant-original-1234567890";
    const replacement = "sk-ant-replacement-1234567890";
    await writeFile(path, original);
    const openFile = vi.fn(async (target: string, flags: number) => {
      const handle = await open(target, flags);
      await rename(path, moved);
      await writeFile(path, replacement);
      return handle;
    });
    const store = new EncryptedCredentialStore({
      path,
      validate: validateAnthropicApiKey,
      openFile,
      cipher: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString(),
      },
    });

    expect(await store.read()).toBe(original);
    expect(openFile).toHaveBeenCalledWith(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );

    const link = join(directory, "credential-link.bin");
    await symlink(path, link);
    const linked = new EncryptedCredentialStore({
      path: link,
      validate: validateAnthropicApiKey,
      cipher: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString(),
      },
    });
    await expect(linked.read()).resolves.toBeNull();
  });
});
