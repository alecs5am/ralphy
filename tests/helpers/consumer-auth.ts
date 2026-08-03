import fs from "node:fs";
import path from "node:path";
import type { ConsumerAuthority } from "../../cli/lib/store/consumer-auth.js";
import { authenticateConsumer } from "../../cli/lib/store/consumer-auth.js";
import {
  bindConsumerPrincipal,
  consumerCredentialDigest,
  farmIdentityDigest,
  serializeFarmIdentity,
  type FarmIdentityV1,
} from "../../cli/lib/store/consumers.js";
import { withImmediateTransaction } from "../../cli/lib/store/db.js";
import { getStoreIdentity } from "../../cli/lib/store/sessions.js";
import type { TmpRoot } from "./tmp-root.js";

export type PreparedFarmConsumer = {
  authority: ConsumerAuthority;
  canonical: string;
  farmPath: string;
  identity: FarmIdentityV1;
  identityPath: string;
  token: string;
};

export function prepareFarmConsumer(
  root: TmpRoot,
  options: {
    consumerId?: string;
    identity?: Partial<FarmIdentityV1>;
    principalId?: string;
    tokenByte?: number;
  } = {},
): Omit<PreparedFarmConsumer, "authority"> & {
  authenticate: () => ConsumerAuthority;
} {
  const token = Buffer.alloc(32, options.tokenByte ?? 7).toString("base64url");
  const consumerId = options.consumerId ?? "consumer_farm";
  const identity: FarmIdentityV1 = {
    version: 1,
    namespace: "farm",
    storeId: getStoreIdentity(),
    consumerId,
    migrationId: `migration_${consumerId}`,
    stageDigest: "a".repeat(64),
    credentialDigest: consumerCredentialDigest(token),
    ...options.identity,
  };
  const canonical = serializeFarmIdentity(identity);
  withImmediateTransaction((db) =>
    bindConsumerPrincipal(db, {
      id: options.principalId ?? consumerId,
      namespace: "farm",
      identityDigest: farmIdentityDigest(canonical),
    }),
  );
  const farmPath = path.join(root.dir, ".ralphy", "farm");
  const identityPath = path.join(farmPath, "identity.json");
  fs.mkdirSync(farmPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(farmPath, 0o700);
  fs.writeFileSync(identityPath, canonical, { mode: 0o600 });
  fs.chmodSync(identityPath, 0o600);
  return {
    authenticate: () => authenticateConsumer("farm", token),
    canonical,
    farmPath,
    identity,
    identityPath,
    token,
  };
}

export function installFarmConsumer(
  root: TmpRoot,
  options: Parameters<typeof prepareFarmConsumer>[1] = {},
): PreparedFarmConsumer {
  const prepared = prepareFarmConsumer(root, options);
  return { ...prepared, authority: prepared.authenticate() };
}
