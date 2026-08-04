import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  authenticateConsumer,
  revokeConsumerAuthority,
} from "../../cli/lib/store/consumer-auth.js";
import {
  bindConsumerPrincipal,
  consumerCredentialDigest,
} from "../../cli/lib/store/consumers.js";
import {
  closeDomainDb,
  openDomainDb,
  withImmediateTransaction,
} from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  endConsumerSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

describe("generic consumer token authentication", () => {
  test("authenticates any bound namespace without a runtime identity tree", () => {
    root = makeTmpRoot("ralphy-consumer-token");
    const token = Buffer.alloc(32, 17).toString("base64url");
    withImmediateTransaction((db) =>
      bindConsumerPrincipal(db, {
        id: "consumer_test",
        namespace: "test",
        identityDigest: consumerCredentialDigest(token),
      }),
    );

    const authority = authenticateConsumer("test", token);
    expect(Object.keys(authority)).toEqual([]);
    expect(Object.isFrozen(authority)).toBe(true);
    expect(fs.existsSync(path.join(root.dir, ".ralphy", "farm"))).toBe(false);

    const workspace = createWorkspace({ slug: "generic", name: "Generic" });
    const session = startConsumerSession(authority, { workspaceId: workspace.id });
    expect(session.agent).toBe("consumer:test");
    expect(endConsumerSession(authority, session.id).endedAt).toBeNumber();
    revokeConsumerAuthority(authority);
  });

  test("rejects a wrong namespace, token, or disabled principal identically", () => {
    root = makeTmpRoot("ralphy-consumer-token-reject");
    const token = Buffer.alloc(32, 19).toString("base64url");
    withImmediateTransaction((db) =>
      bindConsumerPrincipal(db, {
        id: "consumer_test",
        namespace: "test",
        identityDigest: consumerCredentialDigest(token),
      }),
    );

    for (const authenticate of [
      () => authenticateConsumer("missing", token),
      () => authenticateConsumer("test", Buffer.alloc(32, 20).toString("base64url")),
    ]) {
      expect(authenticate).toThrow("Consumer authentication failed");
    }
    openDomainDb().prepare(
      "UPDATE consumer_principals SET disabled_at = ? WHERE namespace = 'test'",
    ).run(Date.now());
    expect(() => authenticateConsumer("test", token)).toThrow(
      "Consumer authentication failed",
    );
  });
});
