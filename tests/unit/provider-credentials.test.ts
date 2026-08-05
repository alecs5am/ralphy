import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import {
  createSecretStore,
  type KeyProvider,
} from "../../cli/lib/store/secrets.js";
import {
  captureCredentialEnvironment,
  createCredentialResolver,
  credentialSecretRef,
  OPENROUTER_CREDENTIAL,
  STATIC_CREDENTIAL_DESCRIPTORS,
  scrubCredentialEnvironment,
  type CredentialDescriptor,
} from "../../cli/lib/providers/credentials.js";
import {
  listConnectors,
  resetProviderCache,
} from "../../cli/lib/providers/registry.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXED_KEY = Buffer.alloc(32, 19);
const SECRET_SENTINEL = "task-2b-secret-sentinel";

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  resetProviderCache();
  root?.cleanup();
  root = null;
});

function fixedKeyProvider(): KeyProvider {
  return {
    lookupKey: async () => FIXED_KEY,
    createKey: async () => FIXED_KEY,
  };
}

function fixture() {
  root = makeTmpRoot("ralphy-provider-credentials");
  openDomainDb();
  const dataRoot = path.join(root.dir, ".ralphy");
  const secretStore = createSecretStore({
    dataRoot,
    keyProvider: fixedKeyProvider(),
  });
  return { dataRoot, secretStore };
}

describe("provider credential descriptors", () => {
  test("the fixed descriptor allowlist covers every credentialed connector module", () => {
    expect(
      STATIC_CREDENTIAL_DESCRIPTORS.map((descriptor) => descriptor.providerId),
    ).toEqual([
      "openrouter",
      "anthropic",
      "elevenlabs",
      "fal",
      "firecrawl",
      "apify",
      "postiz",
      "youtube",
      "devto",
      "hashnode",
    ]);
  });

  test("every connector registry entry carries an explicit typed descriptor", () => {
    const { dataRoot } = fixture();
    fs.writeFileSync(
      path.join(dataRoot, "config.json"),
      JSON.stringify({
        providers: [
          {
            id: "local-keyless",
            kind: "openai-compatible",
            baseUrl: "http://127.0.0.1:11434/v1",
            capabilities: ["text"],
          },
          {
            id: "private-llm",
            kind: "openai-compatible",
            baseUrl: "https://llm.invalid/v1",
            envVar: "ARBITRARY_PROJECT_SECRET",
            capabilities: ["text"],
          },
        ],
      }),
    );
    resetProviderCache();

    const connectors = listConnectors();
    expect(connectors.map((connector) => connector.id)).toEqual([
      "openrouter",
      "elevenlabs",
      "fal",
      "local-keyless",
      "private-llm",
    ]);
    for (const connector of connectors) {
      expect(connector.credential).toBeDefined();
      expect(connector.credential.providerId).toBe(connector.id);
      expect(["api-key", "none"]).toContain(connector.credential.kind);
    }

    expect(
      connectors.find((connector) => connector.id === "private-llm")?.credential,
    ).toMatchObject({
      providerId: "private-llm",
      kind: "api-key",
      environmentVariable: null,
    });
  });

  test("startup capture reads only descriptor-allowlisted names and removes them", () => {
    const environment: Record<string, string | undefined> = {
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      ELEVENLABS_API_KEY: "second-test-value",
      ARBITRARY_PROJECT_SECRET: "must-stay-private-to-the-project",
      HOME: "/tmp/not-a-credential",
      PATH: "/usr/bin:/bin",
      NODE_OPTIONS: "--require loader.js",
    };

    const captured = captureCredentialEnvironment(environment, listConnectors());

    expect(captured.get("openrouter")).toBe(SECRET_SENTINEL);
    expect(captured.get("elevenlabs")).toBe("second-test-value");
    expect(captured.has("fal")).toBe(false);
    expect(environment.OPENROUTER_API_KEY).toBeUndefined();
    expect(environment.ELEVENLABS_API_KEY).toBeUndefined();
    expect(environment.ARBITRARY_PROJECT_SECRET).toBe(
      "must-stay-private-to-the-project",
    );
    expect(environment.HOME).toBe("/tmp/not-a-credential");
    expect(environment.PATH).toBe("/usr/bin:/bin");
    expect(environment.NODE_OPTIONS).toBe("--require loader.js");
    expect(() => captured.set("openrouter", "replacement")).toThrow();
  });

  test("project env credentials are scrubbed without becoming a resolver source", () => {
    const projectEnvironment: Record<string, string | undefined> = {
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      ELEVENLABS_API_KEY: "project-env-test-value",
      PUBLIC_SETTING: "kept",
    };
    scrubCredentialEnvironment(projectEnvironment);
    expect(projectEnvironment).toEqual({ PUBLIC_SETTING: "kept" });
  });
});

describe("scoped credential resolver", () => {
  test("resolves the canonical Anthropic Workspace credential", async () => {
    const { dataRoot, secretStore } = fixture();
    const context = Object.freeze({ kind: "scope" as const, workspaceId: "ws_anthropic" });
    const resolver = createCredentialResolver({
      dataRoot,
      context,
      secretStore,
      capturedEnvironment: new Map(),
    });

    await resolver.set("anthropic", SECRET_SENTINEL);
    expect(await resolver.resolve("anthropic")).toEqual({
      configured: true,
      providerId: "anthropic",
      source: "encrypted",
      value: SECRET_SENTINEL,
    });
  });

  test("uses encrypted, captured environment, subscription, then missing precedence", async () => {
    const { dataRoot, secretStore } = fixture();
    const context = Object.freeze({
      kind: "scope" as const,
      workspaceId: "ws_alpha",
      projectId: "project_one",
    });
    let subscriptionCalls = 0;
    const descriptor: CredentialDescriptor = {
      providerId: "owned-provider",
      kind: "api-key",
      environmentVariable: "OWNED_PROVIDER_API_KEY",
      resolveSubscription: async () => {
        subscriptionCalls += 1;
        return "subscription-test-value";
      },
    };
    const captured = new Map([
      ["owned-provider", "captured-test-value"],
    ]);
    const resolver = createCredentialResolver({
      dataRoot,
      context,
      secretStore,
      descriptors: [descriptor],
      capturedEnvironment: captured,
    });

    await secretStore.set(
      credentialSecretRef("owned-provider", context),
      SECRET_SENTINEL,
    );
    expect(await resolver.resolve("owned-provider")).toEqual({
      configured: true,
      providerId: "owned-provider",
      source: "encrypted",
      value: SECRET_SENTINEL,
    });
    expect(subscriptionCalls).toBe(0);

    await resolver.clear("owned-provider");
    expect(await resolver.resolve("owned-provider")).toMatchObject({
      source: "environment",
      value: "captured-test-value",
    });
    expect(subscriptionCalls).toBe(0);

    const subscriptionResolver = createCredentialResolver({
      dataRoot,
      context,
      secretStore,
      descriptors: [descriptor],
      capturedEnvironment: new Map(),
    });
    expect(await subscriptionResolver.resolve("owned-provider")).toMatchObject({
      source: "subscription",
      value: "subscription-test-value",
    });
    expect(subscriptionCalls).toBe(1);

    const missingDescriptor: CredentialDescriptor = {
      providerId: "missing-provider",
      kind: "api-key",
      environmentVariable: null,
    };
    const missingResolver = createCredentialResolver({
      dataRoot,
      context,
      secretStore,
      descriptors: [missingDescriptor],
      capturedEnvironment: new Map(),
    });
    expect(await missingResolver.resolve("missing-provider")).toEqual({
      configured: false,
      providerId: "missing-provider",
      source: "missing",
      value: null,
    });
  });

  test("never crosses Workspace, Project, or account scope", async () => {
    const { dataRoot, secretStore } = fixture();
    const descriptor: CredentialDescriptor = {
      providerId: "openrouter",
      kind: "api-key",
      environmentVariable: "OPENROUTER_API_KEY",
    };
    const contexts = {
      workspaceA: Object.freeze({ kind: "scope" as const, workspaceId: "ws_a" }),
      workspaceB: Object.freeze({ kind: "scope" as const, workspaceId: "ws_b" }),
      projectA: Object.freeze({
        kind: "scope" as const,
        workspaceId: "ws_a",
        projectId: "project_a",
      }),
      projectB: Object.freeze({
        kind: "scope" as const,
        workspaceId: "ws_a",
        projectId: "project_b",
      }),
      accountA: Object.freeze({
        kind: "scope" as const,
        workspaceId: "ws_a",
        accountId: "account_a",
      }),
      accountB: Object.freeze({
        kind: "scope" as const,
        workspaceId: "ws_a",
        accountId: "account_b",
      }),
    };
    await secretStore.set(
      credentialSecretRef("openrouter", contexts.workspaceA),
      SECRET_SENTINEL,
    );
    await secretStore.set(
      credentialSecretRef("openrouter", contexts.projectA),
      "project-a-test-value",
    );
    await secretStore.set(
      credentialSecretRef("openrouter", contexts.accountA),
      "account-a-test-value",
    );

    for (const context of [
      contexts.workspaceB,
      contexts.projectB,
      contexts.accountB,
    ]) {
      const resolver = createCredentialResolver({
        dataRoot,
        context,
        secretStore,
        descriptors: [descriptor],
        capturedEnvironment: new Map(),
      });
      expect(await resolver.resolve("openrouter")).toMatchObject({
        configured: false,
        source: "missing",
        value: null,
      });
    }
  });

  test("account targets use only their encrypted account secret", async () => {
    const { dataRoot, secretStore } = fixture();
    const workspace = createWorkspace({ slug: "account-target", name: "Account" });
    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "postiz",
      externalId: "account-target",
    });
    const resolver = createCredentialResolver({
      dataRoot,
      context: { kind: "scope", workspaceId: workspace.id },
      secretStore,
      descriptors: [OPENROUTER_CREDENTIAL],
      capturedEnvironment: new Map([["openrouter", SECRET_SENTINEL]]),
    });
    const target = { accountId: account.id };

    expect(await resolver.resolve("openrouter", target)).toMatchObject({
      configured: false,
      source: "missing",
      value: null,
    });
    await resolver.set("openrouter", "account-only-value", {
      ...target,
      expectedRowVersion: 1,
    });
    expect(await resolver.resolve("openrouter", target)).toMatchObject({
      configured: true,
      source: "encrypted",
      value: "account-only-value",
    });
    await resolver.clear("openrouter", { ...target, expectedRowVersion: 2 });
    expect(await resolver.resolve("openrouter", target)).toMatchObject({
      configured: false,
      source: "missing",
      value: null,
    });
  });

  test("status and failures redact the value and persistence never contains it", async () => {
    const { dataRoot, secretStore } = fixture();
    const context = Object.freeze({ kind: "scope" as const, workspaceId: "ws_a" });
    const descriptor: CredentialDescriptor = {
      providerId: "openrouter",
      kind: "api-key",
      environmentVariable: "OPENROUTER_API_KEY",
    };
    const resolver = createCredentialResolver({
      dataRoot,
      context,
      secretStore,
      descriptors: [descriptor],
      capturedEnvironment: new Map(),
    });

    await resolver.set("openrouter", SECRET_SENTINEL);
    expect(await resolver.status("openrouter")).toEqual({
      configured: true,
      source: "encrypted",
      relinkRequired: false,
    });

    const unsupported = await resolver
      .login("openrouter")
      .catch((error: unknown) => error);
    expect(unsupported).toMatchObject({ code: "E_INPUT_INVALID" });
    expect(JSON.stringify(unsupported)).not.toContain(SECRET_SENTINEL);
    expect(String(unsupported)).not.toContain(SECRET_SENTINEL);

    const database = fs.readFileSync(path.join(dataRoot, "ralphy.db"));
    expect(database.includes(Buffer.from(SECRET_SENTINEL))).toBe(false);
    const activity = openDomainDb()
      .query<{ payload: string }, []>(
        "SELECT payload_json AS payload FROM activity_events",
      )
      .all();
    expect(JSON.stringify(activity)).not.toContain(SECRET_SENTINEL);
    const objectRoot = path.join(dataRoot, "objects");
    expect(
      fs.existsSync(objectRoot)
        ? fs.readdirSync(objectRoot, { recursive: true }).some((entry) => {
            const candidate = path.join(objectRoot, String(entry));
            return (
              fs.statSync(candidate).isFile() &&
              fs.readFileSync(candidate).includes(Buffer.from(SECRET_SENTINEL))
            );
          })
        : false,
    ).toBe(false);
  });
});
