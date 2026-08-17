import {
  RalphyBridgeClient,
  RalphyBridgeError,
} from "./client";
import type { BridgeHello } from "./types";

export interface RalphySessionOptions {
  bin?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RalphySessionOpenHooks {
  preparePreviousClose?(
    previousRoot: string | null,
    candidateClient: RalphyBridgeClient,
  ): void | RalphyPreparationRollback | Promise<void | RalphyPreparationRollback>;
  beforePreviousClose?(
    previousRoot: string | null,
    previousClient: RalphyBridgeClient | null,
  ): void | Promise<void>;
  afterPreviousClose?(previousRoot: string | null): void | Promise<void>;
}

export type RalphyPreparationRollback = () => void | Promise<void>;

interface ActiveSession {
  root: string;
  client: RalphyBridgeClient;
  hello: BridgeHello;
}

export class RalphySession {
  readonly #options: RalphySessionOptions;
  #active: ActiveSession | null = null;
  #generation = 0;
  #rootEpoch = 0;
  #commitTail: Promise<void> = Promise.resolve();
  readonly #starting = new Map<number, RalphyBridgeClient>();

  constructor(options: RalphySessionOptions = {}) {
    this.#options = options;
  }

  get root(): string | null {
    return this.#active?.root ?? null;
  }

  get hello(): BridgeHello | null {
    return this.#active?.hello ?? null;
  }

  get rootEpoch(): number {
    return this.#rootEpoch;
  }

  get client(): RalphyBridgeClient {
    if (!this.#active) {
      throw new RalphyBridgeError(
        "E_BRIDGE_NOT_READY",
        "No active Ralphy root. Open a library first.",
      );
    }
    return this.#active.client;
  }

  open(root: string, hooks: RalphySessionOpenHooks = {}): Promise<BridgeHello> {
    const generation = ++this.#generation;
    const candidate = new RalphyBridgeClient({
      root,
      ...(this.#options.bin ? { bin: this.#options.bin } : {}),
      ...(this.#options.env ? { env: this.#options.env } : {}),
    });
    this.#starting.set(generation, candidate);
    void this.#closeStartingBefore(generation);
    return this.#openCandidate(generation, root, candidate, hooks);
  }

  close(): Promise<void> {
    const generation = ++this.#generation;
    const closingCandidates = this.#closeStartingBefore(generation);
    return this.#commit(async () => {
      const active = this.#active;
      this.#active = null;
      if (active) this.#rootEpoch += 1;
      await Promise.all([closingCandidates, active?.client.close()]);
    });
  }

  async #openCandidate(
    generation: number,
    root: string,
    candidate: RalphyBridgeClient,
    hooks: RalphySessionOpenHooks,
  ): Promise<BridgeHello> {
    let hello: BridgeHello;
    try {
      hello = await candidate.start();
    } catch (error) {
      await candidate.close();
      if (generation !== this.#generation) throw this.#supersededError();
      throw error;
    } finally {
      this.#starting.delete(generation);
    }

    return this.#commit(async () => {
      if (generation !== this.#generation) {
        await candidate.close();
        throw this.#supersededError();
      }
      const previous = this.#active;
      let rollback: RalphyPreparationRollback | void;
      try {
        rollback = await hooks.preparePreviousClose?.(previous?.root ?? null, candidate);
      } catch (error) {
        await candidate.close();
        throw error;
      }
      if (generation !== this.#generation) {
        try {
          await rollback?.();
        } finally {
          await candidate.close();
        }
        throw this.#supersededError();
      }
      try {
        await hooks.beforePreviousClose?.(previous?.root ?? null, previous?.client ?? null);
      } catch (error) {
        try {
          await rollback?.();
        } finally {
          await candidate.close();
        }
        throw error;
      }
      this.#active = { root, client: candidate, hello };
      this.#rootEpoch += 1;
      await previous?.client.close();
      await hooks.afterPreviousClose?.(previous?.root ?? null);
      return hello;
    });
  }

  async #closeStartingBefore(generation: number): Promise<void> {
    const closes: Promise<void>[] = [];
    for (const [candidateGeneration, candidate] of this.#starting) {
      if (candidateGeneration < generation) closes.push(candidate.close());
    }
    await Promise.all(closes);
  }

  #supersededError(): RalphyBridgeError {
    return new RalphyBridgeError(
      "E_BRIDGE_SUPERSEDED",
      "A newer Ralphy root selection superseded this request",
    );
  }

  #commit<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#commitTail.then(operation);
    this.#commitTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
