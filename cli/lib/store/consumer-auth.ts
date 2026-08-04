import type { Database } from "bun:sqlite";
import { timingSafeEqual } from "node:crypto";
import { consumerCredentialDigest } from "./consumers.js";
import { openDomainDb } from "./db.js";
import { getConsumerPrincipal } from "./internal-consumers.js";

const AUTH_ERROR = "Consumer authentication failed";
const AUTHORITY_ERROR = "Consumer authority is not live";
const SESSION_ERROR = "Consumer Session is not owned by this authority";

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

/** Authenticates one bridge connection against a bound consumer token. */
export function authenticateConsumer(
  namespace: string,
  tokenBase64url: string,
): ConsumerAuthority {
  let actualDigest: Buffer | null = null;
  let expectedDigest: Buffer | null = null;
  try {
    const db = openDomainDb();
    const store = db
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
      .get();
    const principal = getConsumerPrincipal(db, namespace);
    actualDigest = Buffer.from(consumerCredentialDigest(tokenBase64url), "hex");
    expectedDigest = Buffer.from(principal?.identityDigest ?? "", "hex");
    if (
      !store ||
      !principal ||
      principal.disabledAt !== null ||
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
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
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
