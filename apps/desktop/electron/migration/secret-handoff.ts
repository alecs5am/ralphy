import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";

import type {
  MigrationSecretImportParams,
  MigrationSecretImportResult,
} from "../ralphy/types";

export const SECRET_HANDOFF_REQUEST_MAX_BYTES = 16 * 1024;
export const SECRET_HANDOFF_FLAG = "--migration-secret-handoff";

const REQUEST_FIELDS = [
  "v", "authorizationNonce", "runId", "stagedRoot", "sourceEntryId", "ref", "kind",
] as const;
const RUN_ID = /^mig_[A-Za-z0-9][A-Za-z0-9-]{0,123}$/;
const SOURCE_ENTRY_ID = /^mentry_[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const WORKSPACE_ID = /^ws_[A-Za-z0-9][A-Za-z0-9._:-]{0,123}$/;
const AUTHORIZATION_NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export type SecretHandoffProvider = "anthropic" | "openrouter";

export interface SecretHandoffRequest {
  v: 1;
  authorizationNonce: string;
  runId: string;
  stagedRoot: string;
  sourceEntryId: string;
  ref: string;
  kind: "text";
}

export interface SecretHandoffBridge {
  start(): Promise<{ rootId: string }>;
  request(
    method: "migration.secret.import",
    params: MigrationSecretImportParams,
  ): Promise<unknown>;
  close(): Promise<void>;
}

interface SecretHandoffCredentialStore {
  read(): Promise<string | null>;
}

interface SecretHandoffDependencies {
  stores: Record<SecretHandoffProvider, SecretHandoffCredentialStore>;
  createBridge(root: string): SecretHandoffBridge;
  captureRoot(root: string): Promise<SecretHandoffRootIdentity>;
  sourcePath: string;
  encryptedSourcePath: string;
}

export interface SecretHandoffRootIdentity {
  rootId: string;
  rootDevice: number;
  rootInode: number;
}

export function secretFileForProvider(provider: unknown): string {
  if (provider === "anthropic") return "claude-api-key.bin";
  if (provider === "openrouter") return "openrouter-api-key.bin";
  throw new Error("Unsupported secret handoff provider");
}

export function parseSecretHandoffRequest(raw: string): SecretHandoffRequest {
  if (!raw || Buffer.byteLength(raw) > SECRET_HANDOFF_REQUEST_MAX_BYTES) {
    throw new Error("Invalid secret handoff request size");
  }
  if (!raw.endsWith("\n") || raw.includes("\r") || raw.indexOf("\n") !== raw.length - 1) {
    throw new Error("Invalid secret handoff request frame");
  }
  const body = raw.slice(0, -1);
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid secret handoff request");
  }
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify(REQUEST_FIELDS)) {
    throw new Error("Invalid secret handoff request fields");
  }
  if (
    value.v !== 1
    || typeof value.authorizationNonce !== "string"
    || !AUTHORIZATION_NONCE.test(value.authorizationNonce)
    || typeof value.runId !== "string"
    || !RUN_ID.test(value.runId)
    || typeof value.stagedRoot !== "string"
    || !validStagedRoot(value.stagedRoot, value.runId)
    || typeof value.sourceEntryId !== "string"
    || !SOURCE_ENTRY_ID.test(value.sourceEntryId)
    || typeof value.ref !== "string"
    || !secretProviderFromRef(value.ref)
    || value.kind !== "text"
  ) {
    throw new Error("Invalid secret handoff request");
  }
  if (JSON.stringify(value) !== body) throw new Error("Invalid secret handoff request encoding");
  return value as unknown as SecretHandoffRequest;
}

export async function readSecretHandoffRequest(
  input: AsyncIterable<Buffer | Uint8Array | string>,
): Promise<SecretHandoffRequest> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > SECRET_HANDOFF_REQUEST_MAX_BYTES) {
      throw new Error("Secret handoff request is too large");
    }
    chunks.push(buffer);
  }
  return parseSecretHandoffRequest(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes)),
  );
}

export async function runSecretHandoff(
  request: SecretHandoffRequest,
  dependencies: SecretHandoffDependencies,
): Promise<void> {
  const provider = secretProviderFromRef(request.ref);
  if (!provider) throw new Error("Unsupported secret handoff provider");
  const rootIdentity = await dependencies.captureRoot(request.stagedRoot);
  let secret = await dependencies.stores[provider].read();
  if (!secret) throw new Error("Desktop credential is unavailable");
  let bridge: SecretHandoffBridge | null = null;
  try {
    await assertExpectedRootIdentity(request.stagedRoot, rootIdentity, dependencies.captureRoot);
    bridge = dependencies.createBridge(request.stagedRoot);
    const hello = await bridge.start();
    if (hello.rootId !== rootIdentity.rootId) throw new Error("Bridge root identity mismatch");
    await assertExpectedRootIdentity(request.stagedRoot, rootIdentity, dependencies.captureRoot);
    await assertExpectedRootIdentity(request.stagedRoot, rootIdentity, dependencies.captureRoot);
    const result = await bridge.request("migration.secret.import", {
      sourcePath: dependencies.sourcePath,
      encryptedSourcePath: dependencies.encryptedSourcePath,
      authorizationNonce: request.authorizationNonce,
      runId: request.runId,
      sourceEntryId: request.sourceEntryId,
      ref: request.ref,
      kind: "text",
      value: secret,
    });
    await assertExpectedRootIdentity(request.stagedRoot, rootIdentity, dependencies.captureRoot);
    assertSecretImportResult(result, request.ref);
  } finally {
    secret = null;
    await bridge?.close();
  }
}

export async function captureStagedRootIdentity(root: string): Promise<SecretHandoffRootIdentity> {
  if (await realpath(root) !== root) {
    throw new Error("Secret handoff root must be a canonical staged directory");
  }
  const handle = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const info = await handle.stat();
    if (!info.isDirectory() || !safeFilesystemInteger(info.dev) || !safeFilesystemInteger(info.ino)) {
      throw new Error("Secret handoff root must be a canonical staged directory");
    }
    return {
      rootId: createHash("sha256").update(`${resolve(root)}\0${info.dev}\0${info.ino}`).digest("hex"),
      rootDevice: info.dev,
      rootInode: info.ino,
    };
  } finally {
    await handle.close();
  }
}

export async function assertCanonicalStagedRoot(root: string): Promise<void> {
  await captureStagedRootIdentity(root);
}

export function dispatchDesktopStartup(
  argv: readonly string[],
  startSecretHandoff: () => void,
  startNormalDesktop: () => void,
): void {
  (argv.includes(SECRET_HANDOFF_FLAG) ? startSecretHandoff : startNormalDesktop)();
}

function validStagedRoot(root: string, runId: string): boolean {
  return root.length <= 4096
    && !/[\r\n\0]/.test(root)
    && isAbsolute(root)
    && resolve(root) === root
    && basename(root) === ".ralphy"
    && basename(dirname(root)) === runId
    && basename(dirname(dirname(root))) === ".ralphy-staging";
}

function validProviderRef(ref: string, provider: unknown): boolean {
  if (ref.length > 512) return false;
  const parts = ref.split("/");
  return parts.length === 6
    && parts[0] === "provider"
    && parts[1] === provider
    && parts[2] === "workspace"
    && WORKSPACE_ID.test(parts[3] ?? "")
    && parts[4] === "workspace"
    && parts[5] === parts[3];
}

export function secretProviderFromRef(ref: string): SecretHandoffProvider | null {
  if (validProviderRef(ref, "anthropic")) return "anthropic";
  if (validProviderRef(ref, "openrouter")) return "openrouter";
  return null;
}

function safeFilesystemInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

async function assertExpectedRootIdentity(
  root: string,
  expected: SecretHandoffRootIdentity,
  capture: (root: string) => Promise<SecretHandoffRootIdentity>,
): Promise<void> {
  const identity = await capture(root);
  if (
    identity.rootId !== expected.rootId
    || identity.rootDevice !== expected.rootDevice
    || identity.rootInode !== expected.rootInode
  ) {
    throw new Error("Secret handoff root identity mismatch");
  }
}

function assertSecretImportResult(
  result: unknown,
  ref: string,
): asserts result is MigrationSecretImportResult {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Invalid migration secret import result");
  }
  const value = result as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3
    || !Object.hasOwn(value, "ref")
    || !Object.hasOwn(value, "kind")
    || !Object.hasOwn(value, "completed")
    || value.ref !== ref
    || value.kind !== "text"
    || value.completed !== true
  ) {
    throw new Error("Invalid migration secret import result");
  }
}
