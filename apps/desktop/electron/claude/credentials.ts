import { constants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { guardedAtomicWrite } from "../media/atomic-write";

const MAX_CREDENTIAL_BYTES = 4096;

export interface CredentialCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface EncryptedCredentialStoreOptions {
  path: string;
  cipher: CredentialCipher;
  validate(value: string): string;
  openFile?: typeof open;
}

export function validateAnthropicApiKey(value: string): string {
  const key = value.trim();
  if (key.length < 16 || key.length > 512 || /[\r\n]/.test(key)) {
    throw new Error("Invalid Anthropic API key");
  }
  return key;
}

export function validateOpenRouterApiKey(value: string): string {
  const key = value.trim();
  if (!key.startsWith("sk-or-") || key.length < 20 || key.length > 512 || /[\r\n]/.test(key)) {
    throw new Error("Invalid OpenRouter API key");
  }
  return key;
}

export class EncryptedCredentialStore {
  readonly #path: string;
  readonly #cipher: CredentialCipher;
  readonly #openFile: typeof open;
  readonly #validate: (value: string) => string;

  constructor(options: EncryptedCredentialStoreOptions) {
    this.#path = options.path;
    this.#cipher = options.cipher;
    this.#openFile = options.openFile ?? open;
    this.#validate = options.validate;
  }

  async write(value: string): Promise<void> {
    const key = this.#validate(value);
    if (!this.#cipher.isEncryptionAvailable()) {
      throw new Error("macOS credential encryption is unavailable");
    }
    const encrypted = this.#cipher.encryptString(key);
    if (!encrypted.length || encrypted.length > MAX_CREDENTIAL_BYTES) {
      throw new Error("Encrypted credential is invalid");
    }
    await mkdir(dirname(this.#path), { recursive: true });
    await guardedAtomicWrite(this.#path, encrypted, { maxBytes: MAX_CREDENTIAL_BYTES });
  }

  async read(): Promise<string | null> {
    if (!this.#cipher.isEncryptionAvailable()) return null;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await this.#openFile(
        this.#path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const info = await handle.stat();
      if (!info.isFile() || info.size <= 0 || info.size > MAX_CREDENTIAL_BYTES) return null;
      const encrypted = Buffer.alloc(MAX_CREDENTIAL_BYTES + 1);
      let bytes = 0;
      while (bytes < encrypted.length) {
        const read = await handle.read(
          encrypted,
          bytes,
          encrypted.length - bytes,
          bytes,
        );
        if (read.bytesRead === 0) break;
        bytes += read.bytesRead;
      }
      if (bytes <= 0 || bytes > MAX_CREDENTIAL_BYTES) return null;
      return this.#validate(this.#cipher.decryptString(encrypted.subarray(0, bytes)));
    } catch {
      return null;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async has(): Promise<boolean> {
    return (await this.read()) !== null;
  }

  async clear(): Promise<void> {
    await rm(this.#path, { force: true });
  }
}

export class ClaudeCredentialStore extends EncryptedCredentialStore {
  constructor(options: Omit<EncryptedCredentialStoreOptions, "validate">) {
    super({ ...options, validate: validateAnthropicApiKey });
  }
}
