import type { Database } from "bun:sqlite";
import type { ConsumerPrincipalRow } from "./internal-types.js";

export function getConsumerPrincipal(
  db: Database,
  namespace: string,
): ConsumerPrincipalRow | null {
  return db
    .query<ConsumerPrincipalRow, [string]>(
      `SELECT id, namespace, identity_digest AS identityDigest,
              created_at AS createdAt, disabled_at AS disabledAt
       FROM consumer_principals WHERE namespace = ?`,
    )
    .get(namespace);
}
