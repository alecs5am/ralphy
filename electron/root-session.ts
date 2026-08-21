export interface RootIdentity {
  storeId: string;
  label: string;
  rootEpoch: number;
  activitySequence: number;
}

interface RootHello {
  storeId: string;
  activitySequence: number;
}

interface RootSessionLike {
  root: string | null;
  hello: RootHello | null;
  rootEpoch: number;
  client: unknown;
  open(root: string, hooks: {
    preparePreviousClose(previousRoot: string | null, candidateClient: unknown): Promise<void | RootPreparationRollback>;
    beforePreviousClose(previousRoot: string | null, previousClient: unknown): void | Promise<void>;
    afterPreviousClose(previousRoot: string | null): void;
  }): Promise<RootHello>;
}

export type RootPreparationRollback = () => void | Promise<void>;

export async function openRootSession(options: {
  session: RootSessionLike;
  root: string;
  label: string;
  prepare?(
    previousRoot: string | null,
    candidateClient: unknown,
  ): void | RootPreparationRollback | Promise<void | RootPreparationRollback>;
  invalidateFileTokens(): void;
  stopAgentTurns(): void;
  unsubscribeActivity(previousClient: unknown): Promise<void>;
  subscribeActivity(client: unknown, binding: {
    storeId: string;
    rootEpoch: number;
    afterSequence: number;
  }): Promise<number>;
}): Promise<RootIdentity> {
  const hello = await options.session.open(options.root, {
    async preparePreviousClose(previousRoot, candidateClient) {
      return options.prepare?.(previousRoot, candidateClient);
    },
    async beforePreviousClose(previousRoot, previousClient) {
      if (previousRoot) {
        await options.unsubscribeActivity(previousClient);
        options.invalidateFileTokens();
        options.stopAgentTurns();
      }
    },
    afterPreviousClose() {},
  });
  const activitySequence = await options.subscribeActivity(options.session.client, {
    storeId: hello.storeId,
    rootEpoch: options.session.rootEpoch,
    afterSequence: hello.activitySequence,
  });
  return {
    storeId: hello.storeId,
    label: options.label,
    rootEpoch: options.session.rootEpoch,
    activitySequence,
  };
}

export function createRootShutdown(
  stopActivity: () => Promise<void>,
  closeSession: () => Promise<void>,
): () => Promise<void> {
  let shutdown: Promise<void> | null = null;
  return () => shutdown ??= stopActivity().catch(() => undefined).then(closeSession);
}

export function createQuitCoordinator(
  shutdown: () => Promise<void>,
  quit: () => void,
): { request(event: { preventDefault(): void }): Promise<void> } {
  let allowed = false;
  let pending: Promise<void> | null = null;
  return {
    request(event) {
      if (allowed) return pending ?? Promise.resolve();
      event.preventDefault();
      if (pending) return pending;
      pending = shutdown().then(() => {
        allowed = true;
        quit();
      });
      return pending;
    },
  };
}
