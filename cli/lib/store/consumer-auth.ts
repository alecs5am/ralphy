import type { Database } from "bun:sqlite";
import { dlopen, FFIType, ptr } from "bun:ffi";
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import {
  decodeConsumerToken,
  farmIdentityDigest,
  getConsumerPrincipal,
  parseFarmIdentity,
  type FarmIdentityV1,
} from "./consumers.js";
import { openDomainDb } from "./db.js";

const IDENTITY_ERROR = "Consumer identity is unavailable";
const AUTH_ERROR = "Consumer authentication failed";
const AUTHORITY_ERROR = "Consumer authority is not live";
const SESSION_ERROR = "Consumer Session is not owned by this authority";
const FARM_IDENTITY_BYTES_MAX = 4096;
const DARWIN_O_NOFOLLOW_ANY = 0x20000000;

declare const consumerAuthorityBrand: unique symbol;

/** Opaque authority for one authenticated in-process consumer connection. */
export type ConsumerAuthority = {
  readonly [consumerAuthorityBrand]: true;
};

type AuthorityState = {
  db: Database;
  storeId: string;
  principalId: string;
  namespace: string;
  identityDigest: string;
  sessions: Set<string>;
  revoked: boolean;
};

export type AuthorizedConsumerSession = {
  id: string;
  principalId: string;
  namespace: string;
  workspaceId: string;
  projectId: string | null;
};

const authorityStates = new WeakMap<object, AuthorityState>();

/** Reads only the bounded canonical Farm startup identity. */
export function readFarmIdentity(): FarmIdentityV1 {
  try {
    return readFarmIdentityRecord().identity;
  } catch {
    throw new Error(IDENTITY_ERROR);
  }
}

/** Authenticates one bridge connection against the installed Farm identity. */
export function authenticateConsumer(
  namespace: string,
  tokenBase64url: string,
): ConsumerAuthority {
  let token: Buffer | null = null;
  let actualDigest: Buffer | null = null;
  let expectedDigest: Buffer | null = null;
  try {
    token = decodeConsumerToken(tokenBase64url);
    const record = readFarmIdentityRecord();
    const db = openDomainDb();
    const store = db
      .query<
        { storeId: string },
        []
      >("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1")
      .get();
    const principal = getConsumerPrincipal(db, namespace);
    const identityDigest = farmIdentityDigest(record.canonical);
    if (
      namespace !== "farm" ||
      record.identity.namespace !== namespace ||
      !store ||
      record.identity.storeId !== store.storeId ||
      !principal ||
      principal.disabledAt !== null ||
      record.identity.consumerId !== principal.id ||
      identityDigest !== principal.identityDigest
    ) {
      throw new Error(AUTH_ERROR);
    }

    actualDigest = createHash("sha256").update(token).digest();
    expectedDigest = Buffer.from(record.identity.credentialDigest, "hex");
    if (
      expectedDigest.byteLength !== 32 ||
      !timingSafeEqual(actualDigest, expectedDigest)
    ) {
      throw new Error(AUTH_ERROR);
    }

    const authority = Object.freeze(Object.create(null)) as ConsumerAuthority;
    authorityStates.set(authority, {
      db,
      storeId: store.storeId,
      principalId: principal.id,
      namespace: principal.namespace,
      identityDigest: principal.identityDigest,
      sessions: new Set(),
      revoked: false,
    });
    return authority;
  } catch {
    throw new Error(AUTH_ERROR);
  } finally {
    token?.fill(0);
    actualDigest?.fill(0);
    expectedDigest?.fill(0);
  }
}

/** Immediately invalidates one connection authority and its Session handles. */
export function revokeConsumerAuthority(authority: ConsumerAuthority): void {
  const state = authorityStates.get(authority as object);
  if (!state) throw new Error(AUTHORITY_ERROR);
  if (state.revoked) return;
  state.revoked = true;
  state.sessions.clear();
}

/** @internal Revalidates the authority against its exact live DB and principal. */
export function requireConsumerAuthority(
  db: Database,
  authority: ConsumerAuthority,
): { principalId: string; namespace: string } {
  const state = authorityState(authority);
  if (state.db !== db) throw new Error(AUTHORITY_ERROR);
  try {
    const store = db
      .query<
        { storeId: string },
        []
      >("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1")
      .get();
    const principal = getConsumerPrincipal(db, state.namespace);
    if (
      !store ||
      store.storeId !== state.storeId ||
      !principal ||
      principal.id !== state.principalId ||
      principal.identityDigest !== state.identityDigest ||
      principal.disabledAt !== null
    ) {
      throw new Error(AUTHORITY_ERROR);
    }
  } catch {
    throw new Error(AUTHORITY_ERROR);
  }
  return { principalId: state.principalId, namespace: state.namespace };
}

/** @internal Registers a pending Session and returns no-throw rollback cleanup. */
export function registerConsumerSession(
  db: Database,
  authority: ConsumerAuthority,
  sessionId: string,
): () => void {
  requireConsumerAuthority(db, authority);
  const sessions = authorityState(authority).sessions;
  sessions.add(sessionId);
  return () => {
    sessions.delete(sessionId);
  };
}

/** @internal Removes a Session after its owning connection ends it. */
export function forgetConsumerSession(
  authority: ConsumerAuthority,
  sessionId: string,
): void {
  const state = authorityState(authority);
  if (!state.sessions.delete(sessionId)) throw new Error(SESSION_ERROR);
}

/** @internal Requires a live Session minted by this exact authority object. */
export function requireOwnedConsumerSession(
  db: Database,
  authority: ConsumerAuthority,
  sessionId: string,
): AuthorizedConsumerSession {
  const principal = requireConsumerAuthority(db, authority);
  const state = authorityState(authority);
  if (!state.sessions.has(sessionId)) throw new Error(SESSION_ERROR);
  const row = db
    .query<
      {
        id: string;
        principalId: string | null;
        namespace: string | null;
        workspaceId: string;
        projectId: string | null;
        endedAt: number | null;
      },
      [string]
    >(
      `SELECT session.id AS id, session.consumer_principal_id AS principalId,
              principal.namespace AS namespace,
              session.workspace_id AS workspaceId,
              session.project_id AS projectId, session.ended_at AS endedAt
       FROM agent_sessions session
       LEFT JOIN consumer_principals principal
         ON principal.id = session.consumer_principal_id
       WHERE session.id = ?`,
    )
    .get(sessionId);
  if (
    !row ||
    row.endedAt !== null ||
    row.principalId !== principal.principalId ||
    row.namespace !== principal.namespace
  ) {
    throw new Error(SESSION_ERROR);
  }
  return {
    id: row.id,
    principalId: row.principalId,
    namespace: row.namespace,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  };
}

function authorityState(authority: ConsumerAuthority): AuthorityState {
  const state = authorityStates.get(authority as object);
  if (!state || state.revoked) throw new Error(AUTHORITY_ERROR);
  return state;
}

function readFarmIdentityRecord(): {
  canonical: string;
  identity: FarmIdentityV1;
} {
  const owner = currentUid();
  const requestedRoot = path.resolve(ralphDir());
  const dataRoot = fs.realpathSync(requestedRoot);
  const farmPath = path.join(dataRoot, "farm");
  const parentBefore = fs.lstatSync(farmPath);
  assertSafeParent(parentBefore, owner);
  const parentRealpath = fs.realpathSync(farmPath);
  if (parentRealpath !== farmPath || !isWithin(dataRoot, parentRealpath)) {
    throw new Error(IDENTITY_ERROR);
  }

  let descriptor: number | null = null;
  let bytes: Buffer | null = null;
  try {
    descriptor = openIdentity(farmPath, parentBefore);
    const fileBefore = fs.fstatSync(descriptor);
    assertSafeIdentityFile(fileBefore, owner);
    bytes = Buffer.alloc(fileBefore.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (count <= 0) throw new Error(IDENTITY_ERROR);
      offset += count;
    }
    const fileAfter = fs.fstatSync(descriptor);
    if (!sameFileSnapshot(fileBefore, fileAfter)) {
      throw new Error(IDENTITY_ERROR);
    }

    const parentAfter = fs.lstatSync(farmPath);
    assertSafeParent(parentAfter, owner);
    if (
      !sameParentSnapshot(parentBefore, parentAfter) ||
      fs.realpathSync(farmPath) !== parentRealpath
    ) {
      throw new Error(IDENTITY_ERROR);
    }

    const canonical = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    return { canonical, identity: parseFarmIdentity(canonical) };
  } finally {
    bytes?.fill(0);
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function openIdentity(farmPath: string, parent: fs.Stats): number {
  const flags = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK;
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(IDENTITY_ERROR);
  }

  let directory: number | null = null;
  try {
    directory = fs.openSync(
      farmPath,
      flags | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    const openedParent = fs.fstatSync(directory);
    if (!sameParentSnapshot(parent, openedParent)) {
      throw new Error(IDENTITY_ERROR);
    }
    const pinnedPath = process.platform === "darwin"
      ? `/dev/fd/${directory}`
      : `/proc/self/fd/${directory}`;
    if (fs.realpathSync(pinnedPath) !== farmPath) {
      throw new Error(IDENTITY_ERROR);
    }
    if (process.platform === "darwin") {
      const libc = dlopen("/usr/lib/libSystem.B.dylib", {
        openat: {
          args: [FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.i32],
          returns: FFIType.i32,
        },
      });
      try {
        const name = Buffer.from("identity.json\0");
        const descriptor = libc.symbols.openat(
          directory,
          ptr(name),
          flags | DARWIN_O_NOFOLLOW_ANY,
          0,
        );
        if (descriptor < 0) throw new Error(IDENTITY_ERROR);
        return descriptor;
      } finally {
        libc.close();
      }
    }
    return fs.openSync(
      `${pinnedPath}/identity.json`,
      flags | fs.constants.O_NOFOLLOW,
    );
  } finally {
    if (directory !== null) fs.closeSync(directory);
  }
}

function assertSafeParent(stat: fs.Stats, owner: number): void {
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    stat.uid !== owner ||
    (stat.mode & 0o022) !== 0
  ) {
    throw new Error(IDENTITY_ERROR);
  }
}

function assertSafeIdentityFile(stat: fs.Stats, owner: number): void {
  if (
    !stat.isFile() ||
    stat.uid !== owner ||
    (stat.mode & 0o7777) !== 0o600 ||
    !Number.isSafeInteger(stat.size) ||
    stat.size < 1 ||
    stat.size > FARM_IDENTITY_BYTES_MAX
  ) {
    throw new Error(IDENTITY_ERROR);
  }
}

function sameParentSnapshot(left: fs.Stats, right: fs.Stats): boolean {
  return (
    left.isDirectory() &&
    right.isDirectory() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.uid === right.uid &&
    left.mode === right.mode &&
    left.size === right.size
  );
}

function sameFileSnapshot(left: fs.Stats, right: fs.Stats): boolean {
  return (
    left.isFile() &&
    right.isFile() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.uid === right.uid &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function currentUid(): number {
  if (typeof process.getuid !== "function") throw new Error(IDENTITY_ERROR);
  return process.getuid();
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
