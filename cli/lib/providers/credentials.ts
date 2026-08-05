import { DomainError } from "../errors/domain.js";
import type { ResolvedCommandContext } from "../context-state.js";
import { createSecretStore } from "../store/secrets.js";
import { updateSocialAccountCredentialInTransaction } from "../store/scopes.js";
import type {
  CredentialDescriptor,
  CredentialSource,
  RalphyConnector,
} from "./types.js";

export type { CredentialDescriptor, CredentialSource } from "./types.js";

export type CredentialScope = ResolvedCommandContext & {
  readonly accountId?: string;
};

export type ResolvedCredential = {
  configured: boolean;
  providerId: string;
  source: CredentialSource;
  value: string | null;
};

export type CredentialStatus = {
  configured: boolean;
  source: CredentialSource;
  relinkRequired: boolean;
};

export type CredentialTarget = { readonly accountId?: string };
export type CredentialMutationTarget =
  | { readonly accountId?: undefined; readonly expectedRowVersion?: undefined }
  | { readonly accountId: string; readonly expectedRowVersion: number };

type SecretStore = Pick<
  ReturnType<typeof createSecretStore>,
  "set" | "read" | "delete"
>;

export type CredentialResolver = {
  set(
    providerId: string,
    value: string,
    target?: CredentialMutationTarget,
  ): Promise<void>;
  clear(
    providerId: string,
    target?: CredentialMutationTarget,
  ): Promise<void>;
  resolve(
    providerId: string,
    target?: CredentialTarget,
  ): Promise<ResolvedCredential>;
  status(
    providerId: string,
    target?: CredentialTarget,
  ): Promise<CredentialStatus>;
  login(providerId: string): Promise<void>;
};

const FORBIDDEN_CREDENTIAL_ENV = new Set([
  "HOME",
  "PATH",
  "SHELL",
  "ENV",
  "BASH_ENV",
  "CDPATH",
  "NODE_OPTIONS",
  "BUN_OPTIONS",
  "NODE_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
]);
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/u;
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/u;
const SAFE_CHILD_ENV = [
  "HOME",
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
] as const;

export const OPENROUTER_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "openrouter",
  kind: "api-key",
  environmentVariable: "OPENROUTER_API_KEY",
});
export const ANTHROPIC_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "anthropic",
  kind: "api-key",
  environmentVariable: "ANTHROPIC_API_KEY",
});
export const ELEVENLABS_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "elevenlabs",
  kind: "api-key",
  environmentVariable: "ELEVENLABS_API_KEY",
});
export const FAL_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "fal",
  kind: "api-key",
  environmentVariable: "FAL_KEY",
});
export const FIRECRAWL_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "firecrawl",
  kind: "api-key",
  environmentVariable: "FIRECRAWL_API_KEY",
});
export const APIFY_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "apify",
  kind: "api-key",
  environmentVariable: "APIFY_TOKEN",
});
export const POSTIZ_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "postiz",
  kind: "api-key",
  environmentVariable: "POSTIZ_API_KEY",
});
export const YOUTUBE_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "youtube",
  kind: "api-key",
  environmentVariable: "YOUTUBE_API_KEY",
});
export const DEVTO_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "devto",
  kind: "api-key",
  environmentVariable: "DEVTO_API_KEY",
});
export const HASHNODE_CREDENTIAL: CredentialDescriptor = Object.freeze({
  providerId: "hashnode",
  kind: "api-key",
  environmentVariable: "HASHNODE_TOKEN",
});

export const STATIC_CREDENTIAL_DESCRIPTORS: readonly CredentialDescriptor[] =
  Object.freeze([
    OPENROUTER_CREDENTIAL,
    ANTHROPIC_CREDENTIAL,
    ELEVENLABS_CREDENTIAL,
    FAL_CREDENTIAL,
    FIRECRAWL_CREDENTIAL,
    APIFY_CREDENTIAL,
    POSTIZ_CREDENTIAL,
    YOUTUBE_CREDENTIAL,
    DEVTO_CREDENTIAL,
    HASHNODE_CREDENTIAL,
  ]);

class ImmutableCredentialMap extends Map<string, string> {
  private locked = false;

  constructor(entries: Iterable<readonly [string, string]>) {
    super();
    for (const [key, value] of entries) super.set(key, value);
    this.locked = true;
  }

  override set(key: string, value: string): this {
    if (this.locked) throw new TypeError("Captured credentials are immutable");
    return super.set(key, value);
  }

  override delete(_key: string): boolean {
    if (this.locked) throw new TypeError("Captured credentials are immutable");
    return false;
  }

  override clear(): void {
    if (this.locked) throw new TypeError("Captured credentials are immutable");
    super.clear();
  }
}

let startupCredentials: ReadonlyMap<string, string> | null = null;
let currentResolver: CredentialResolver | null = null;
const currentValues = new Map<string, string>();
let testCredentialSource:
  | ((providerId: string, environmentVariable: string | null) => string | null)
  | null = null;

export function captureCredentialEnvironment(
  environment: Record<string, string | undefined>,
  connectors: readonly Pick<RalphyConnector, "id" | "credential">[],
): Map<string, string> {
  const captured: Array<readonly [string, string]> = [];
  for (const connector of connectors) {
    const descriptor = checkedDescriptor(connector.credential);
    if (
      descriptor.kind !== "api-key" ||
      descriptor.environmentVariable === null
    ) {
      continue;
    }
    const value = environment[descriptor.environmentVariable];
    if (typeof value === "string" && value.length > 0) {
      captured.push([connector.id, value]);
    }
    delete environment[descriptor.environmentVariable];
  }
  return new ImmutableCredentialMap(captured);
}

export function captureStartupCredentialEnvironment(
  environment: Record<string, string | undefined> = process.env,
): ReadonlyMap<string, string> {
  const connectors = STATIC_CREDENTIAL_DESCRIPTORS.map((credential) => ({
    id: credential.providerId,
    credential,
  }));
  startupCredentials = captureCredentialEnvironment(environment, connectors);
  return startupCredentials;
}

export function startupCredentialTransfer(
  credentials: ReadonlyMap<string, string> = startupCredentials ?? new Map(),
): string {
  return JSON.stringify(Object.fromEntries(credentials));
}

export function parseStartupCredentialTransfer(
  payload: string,
): ReadonlyMap<string, string> {
  if (!payload.trim()) return new ImmutableCredentialMap([]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw providerInputError("provider", "invalid daemon credential transfer");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw providerInputError("provider", "invalid daemon credential transfer");
  }
  const allowed = new Set(
    STATIC_CREDENTIAL_DESCRIPTORS.map((descriptor) => descriptor.providerId),
  );
  const entries: Array<readonly [string, string]> = [];
  for (const [providerId, value] of Object.entries(parsed)) {
    if (!allowed.has(providerId) || typeof value !== "string" || !value) {
      throw providerInputError("provider", "invalid daemon credential transfer");
    }
    entries.push([providerId, value]);
  }
  return new ImmutableCredentialMap(entries);
}

export function scrubCredentialEnvironment(
  environment: Record<string, string | undefined>,
): void {
  for (const descriptor of STATIC_CREDENTIAL_DESCRIPTORS) {
    if (descriptor.kind === "api-key" && descriptor.environmentVariable) {
      delete environment[descriptor.environmentVariable];
    }
  }
}

/** @internal Test-only injection seam; production startup never installs one. */
export function setCredentialTestSource(
  source:
    | ((providerId: string, environmentVariable: string | null) => string | null)
    | null,
): void {
  testCredentialSource = source;
}

export function credentialSecretRef(
  providerId: string,
  context: CredentialScope,
): string {
  checkedProviderId(providerId);
  const scope = context.accountId
    ? ["account", context.accountId]
    : context.projectId
      ? ["project", context.projectId]
      : ["workspace", context.workspaceId];
  return ["provider", providerId, "workspace", context.workspaceId, ...scope]
    .map(checkedRefPart)
    .join("/");
}

export function createCredentialResolver(input: {
  dataRoot: string;
  context: CredentialScope;
  secretStore?: SecretStore;
  descriptors?: readonly CredentialDescriptor[];
  capturedEnvironment?: ReadonlyMap<string, string>;
}): CredentialResolver {
  const descriptors = new Map(
    (input.descriptors ?? STATIC_CREDENTIAL_DESCRIPTORS).map((descriptor) => {
      const checked = checkedDescriptor(descriptor);
      return [checked.providerId, checked] as const;
    }),
  );
  const secretStore =
    input.secretStore ?? createSecretStore({ dataRoot: input.dataRoot });
  const captured = input.capturedEnvironment ?? startupCredentials ?? new Map();

  const descriptorFor = (providerId: string): CredentialDescriptor => {
    checkedProviderId(providerId);
    const descriptor = descriptors.get(providerId);
    if (!descriptor) throw providerInputError(providerId, "unknown provider");
    return descriptor;
  };

  const scopeFor = (target?: CredentialTarget): CredentialScope =>
    target?.accountId
      ? { ...input.context, accountId: target.accountId }
      : input.context;

  const accountUpdate = (
    providerId: string,
    target: CredentialMutationTarget | undefined,
    credentialRef: string | null,
  ) => {
    if (!target?.accountId) return undefined;
    if (!Number.isSafeInteger(target.expectedRowVersion) || target.expectedRowVersion < 1) {
      throw providerInputError(providerId, "account row version is required");
    }
    return (db: import("bun:sqlite").Database): void => {
      updateSocialAccountCredentialInTransaction(db, {
        workspaceId: input.context.workspaceId,
        accountId: target.accountId,
        credentialRef,
        expectedRowVersion: target.expectedRowVersion,
      });
    };
  };

  const resolver: CredentialResolver = {
    async set(providerId, value, target) {
      const descriptor = descriptorFor(providerId);
      if (descriptor.kind === "none") {
        throw providerInputError(providerId, "provider does not accept credentials");
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        throw providerInputError(providerId, "credential input is empty");
      }
      const ref = credentialSecretRef(providerId, scopeFor(target));
      await secretStore.set(ref, value, accountUpdate(providerId, target, ref));
      if (currentResolver === resolver && !target?.accountId) {
        currentValues.set(providerId, value);
      }
    },
    async clear(providerId, target) {
      descriptorFor(providerId);
      await secretStore.delete(
        credentialSecretRef(providerId, scopeFor(target)),
        accountUpdate(providerId, target, null),
      );
      if (currentResolver === resolver && !target?.accountId) {
        currentValues.delete(providerId);
      }
    },
    async resolve(providerId, target) {
      const descriptor = descriptorFor(providerId);
      if (descriptor.kind === "none") {
        return { configured: true, providerId, source: "missing", value: null };
      }
      const encrypted = await secretStore.read(
        credentialSecretRef(providerId, scopeFor(target)),
      );
      if (encrypted !== null) {
        return { configured: true, providerId, source: "encrypted", value: encrypted };
      }
      if (target?.accountId) {
        return { configured: false, providerId, source: "missing", value: null };
      }
      const environment = captured.get(providerId);
      if (environment !== undefined) {
        return {
          configured: true,
          providerId,
          source: "environment",
          value: environment,
        };
      }
      const subscription = await descriptor.resolveSubscription?.();
      if (subscription) {
        return {
          configured: true,
          providerId,
          source: "subscription",
          value: subscription,
        };
      }
      return { configured: false, providerId, source: "missing", value: null };
    },
    async status(providerId, target) {
      const resolved = await resolver.resolve(providerId, target);
      return {
        configured: resolved.configured,
        source: resolved.source,
        relinkRequired: false,
      };
    },
    async login(providerId) {
      const descriptor = descriptorFor(providerId);
      if (descriptor.kind !== "api-key" || !descriptor.login) {
        throw providerInputError(
          providerId,
          "provider does not support owned login",
          "provider auth login",
        );
      }
      await descriptor.login();
    },
  };
  return resolver;
}

export async function activateCredentialResolver(
  resolver: CredentialResolver,
  providerIds: readonly string[],
): Promise<void> {
  currentResolver = resolver;
  currentValues.clear();
  for (const providerId of providerIds) {
    const resolved = await resolver.resolve(providerId);
    if (resolved.value !== null) currentValues.set(providerId, resolved.value);
  }
}

export function activeCredentialResolver(): CredentialResolver | null {
  return currentResolver;
}

/** @internal Test/process-lifecycle reset; does not alter persisted secrets. */
export function clearActiveCredentialResolver(): void {
  currentResolver = null;
  currentValues.clear();
}

export function credentialValue(providerId: string): string | null {
  const active = currentValues.get(providerId);
  if (active !== undefined) return active;
  const captured = startupCredentials?.get(providerId);
  if (captured !== undefined) return captured;
  const descriptor = STATIC_CREDENTIAL_DESCRIPTORS.find(
    (entry) => entry.providerId === providerId,
  );
  return (
    testCredentialSource?.(
      providerId,
      descriptor?.kind === "api-key"
        ? descriptor.environmentVariable
        : null,
    ) ?? null
  );
}

export function credentialConfigured(providerId: string): boolean {
  return credentialValue(providerId) !== null;
}

export function safeChildEnvironment(input: {
  inherited?: NodeJS.ProcessEnv;
  credential?: {
    descriptor: CredentialDescriptor;
    value: string;
  };
}): NodeJS.ProcessEnv {
  const inherited = input.inherited ?? process.env;
  const child: NodeJS.ProcessEnv = {};
  for (const key of SAFE_CHILD_ENV) {
    const value = inherited[key];
    if (value !== undefined) child[key] = value;
  }
  if (input.credential) {
    const descriptor = checkedDescriptor(input.credential.descriptor);
    if (descriptor.kind !== "api-key" || !descriptor.environmentVariable) {
      throw providerInputError(
        descriptor.providerId,
        "credential has no child environment target",
      );
    }
    child[descriptor.environmentVariable] = input.credential.value;
  }
  return child;
}

function checkedDescriptor(
  descriptor: CredentialDescriptor,
): CredentialDescriptor {
  checkedProviderId(descriptor.providerId);
  if (descriptor.kind === "none") {
    return descriptor;
  }
  const name = descriptor.environmentVariable;
  if (
    name !== null &&
    (!ENV_NAME.test(name) || FORBIDDEN_CREDENTIAL_ENV.has(name))
  ) {
    throw providerInputError(
      descriptor.providerId,
      "credential environment target is forbidden",
    );
  }
  return descriptor;
}

function checkedProviderId(providerId: string): string {
  if (!PROVIDER_ID.test(providerId)) {
    throw providerInputError("provider", "invalid provider id");
  }
  return providerId;
}

function checkedRefPart(part: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(part)) {
    throw providerInputError("provider", "invalid credential scope");
  }
  return part;
}

function providerInputError(
  providerId: string,
  detail: string,
  verb = "provider auth",
): DomainError {
  return new DomainError("E_INPUT_INVALID", undefined, {
    field: "provider",
    detail: `${providerId}: ${detail}`,
    verb,
  });
}
