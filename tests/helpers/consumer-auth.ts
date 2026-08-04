import type { ConsumerAuthority } from "../../cli/lib/store/consumer-auth.js";
import { authenticateConsumer } from "../../cli/lib/store/consumer-auth.js";
import {
  bindConsumerPrincipal,
  consumerCredentialDigest,
} from "../../cli/lib/store/consumers.js";
import { withImmediateTransaction } from "../../cli/lib/store/db.js";
import type { TmpRoot } from "./tmp-root.js";

export type PreparedConsumer = {
  authority: ConsumerAuthority;
  id: string;
  namespace: string;
  token: string;
};

export function prepareConsumer(
  _root: TmpRoot,
  options: {
    id?: string;
    namespace?: string;
    tokenByte?: number;
  } = {},
): Omit<PreparedConsumer, "authority"> & {
  authenticate: () => ConsumerAuthority;
} {
  const token = Buffer.alloc(32, options.tokenByte ?? 7).toString("base64url");
  const id = options.id ?? "consumer_test";
  const namespace = options.namespace ?? "test";
  withImmediateTransaction((db) =>
    bindConsumerPrincipal(db, {
      id,
      namespace,
      identityDigest: consumerCredentialDigest(token),
    }),
  );
  return {
    authenticate: () => authenticateConsumer(namespace, token),
    id,
    namespace,
    token,
  };
}

export function installConsumer(
  root: TmpRoot,
  options: Parameters<typeof prepareConsumer>[1] = {},
): PreparedConsumer {
  const prepared = prepareConsumer(root, options);
  return { ...prepared, authority: prepared.authenticate() };
}
