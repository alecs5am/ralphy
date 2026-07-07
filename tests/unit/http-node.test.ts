// The generic allowlisted `http` node (#520) — zero-network unit tests.
//
// Executor: allowlist refusal (naming the host), banned provider hosts,
// $ENV header resolution, typed output (json → object, else text), size cap,
// non-2xx. Lint: allowed_hosts required, provider hosts rejected, secret
// literals rejected (env refs pass). HTTP goes through ctx.fetchImpl.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getExecutor, type ExecutorContext } from "../../cli/lib/workflow/executors/index.js";
import { hostAllowed } from "../../cli/lib/workflow/executors/http.js";
import { bannedProviderHost } from "../../cli/lib/providers/banned-hosts.js";
import { isEnvRef, resolveEnvRef, looksLikeSecretLiteral, findSecretLiterals } from "../../cli/lib/workflow/env-refs.js";
import { validateWorkflowGraph } from "../../cli/lib/workflow-graph.js";
import { deriveBundleRequirements } from "../../cli/lib/bundle.js";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

const http = getExecutor("http")!;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "http-node-"));
  delete process.env.TEST_HTTP_TOKEN;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.TEST_HTTP_TOKEN;
});

function makeNode(params: Record<string, unknown>, type: WorkflowNodeType = "http", id = "pull"): WorkflowNode {
  return { id, type, in: {}, params, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true };
}

function makeCtx(over: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    workspace: "test",
    workspaceDir: dir,
    artifactsDir: path.join(dir, "artifacts"),
    inputs: {},
    log: async () => {},
    reportCost: () => {},
    ...over,
  };
}

/** A fetch stub that records the call and returns a canned Response. */
function stubFetch(response: Response, calls: Array<{ url: string; init: RequestInit }> = []) {
  const impl = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return response;
  }) as typeof fetch;
  return { impl, calls };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("http executor — allowlist enforcement", () => {
  test("refuses without allowed_hosts", async () => {
    const node = makeNode({ url: "https://api.example.com/data" });
    await expect(http(node, makeCtx())).rejects.toThrow(/allowed_hosts/);
  });

  test("refuses a host outside the allowlist, NAMING the host", async () => {
    const node = makeNode({ url: "https://evil.example.org/x", allowed_hosts: ["api.example.com"] });
    const err = await http(node, makeCtx()).catch((e) => e);
    expect(err.message).toContain('"evil.example.org"');
    expect(err.message).toContain("api.example.com");
  });

  test("exact host and *.suffix wildcard match; the wildcard never matches the apex", () => {
    expect(hostAllowed("api.example.com", ["api.example.com"])).toBe(true);
    expect(hostAllowed("API.EXAMPLE.COM", ["api.example.com"])).toBe(true);
    expect(hostAllowed("deep.api.example.com", ["api.example.com"])).toBe(false);
    expect(hostAllowed("a.example.com", ["*.example.com"])).toBe(true);
    expect(hostAllowed("example.com", ["*.example.com"])).toBe(false);
    expect(hostAllowed("badexample.com", ["*.example.com"])).toBe(false);
  });

  test("a provider host in allowed_hosts refuses at execution (invariant #1)", async () => {
    const node = makeNode({ url: "https://api.example.com/x", allowed_hosts: ["api.openrouter.ai"] });
    await expect(http(node, makeCtx())).rejects.toThrow(/openrouter/);
  });

  test("a provider host as the request target refuses even when allowlisted via wildcard", async () => {
    // A wildcard covering a provider host is refused in the allowlist check.
    const node = makeNode({ url: "https://queue.fal.run/x", allowed_hosts: ["*.fal.run"] });
    await expect(http(node, makeCtx())).rejects.toThrow(/fal/);
  });
});

describe("http executor — request + response", () => {
  test("GET with a JSON content-type parses into an object output and writes <id>.json", async () => {
    const { impl, calls } = stubFetch(jsonResponse({ items: [1, 2] }));
    const node = makeNode({ url: "https://api.example.com/data", allowed_hosts: ["api.example.com"] });
    const r = await http(node, makeCtx({ fetchImpl: impl }));
    expect(r.output).toEqual({ items: [1, 2] });
    expect(r.artifactPath).toContain("pull.json");
    expect(calls[0]!.url).toBe("https://api.example.com/data");
    expect((calls[0]!.init.method as string).toUpperCase()).toBe("GET");
  });

  test("non-JSON content-type returns text output", async () => {
    const { impl } = stubFetch(new Response("plain body", { headers: { "content-type": "text/plain" } }));
    const node = makeNode({ url: "https://api.example.com/txt", allowed_hosts: ["api.example.com"] });
    const r = await http(node, makeCtx({ fetchImpl: impl }));
    expect(r.output).toBe("plain body");
    expect(r.artifactPath).toContain("pull.txt");
  });

  test("$ENV header references resolve at execution; a missing var errors naming it", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { impl } = stubFetch(jsonResponse({ ok: true }), calls);
    const node = makeNode({
      url: "https://api.example.com/auth",
      allowed_hosts: ["api.example.com"],
      headers: { authorization: "$TEST_HTTP_TOKEN", "x-static": "v2" },
    });
    await expect(http(node, makeCtx({ fetchImpl: impl }))).rejects.toThrow(/TEST_HTTP_TOKEN/);

    process.env.TEST_HTTP_TOKEN = "resolved-secret-value";
    const r = await http(node, makeCtx({ fetchImpl: impl }));
    expect(r.output).toEqual({ ok: true });
    const sent = calls.at(-1)!.init.headers as Record<string, string>;
    expect(sent.authorization).toBe("resolved-secret-value");
    expect(sent["x-static"]).toBe("v2");
  });

  test("POST with an object body JSON-encodes and defaults the content-type", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { impl } = stubFetch(jsonResponse({ ok: true }), calls);
    const node = makeNode({
      url: "https://api.example.com/submit",
      method: "POST",
      body: { q: "news" },
      allowed_hosts: ["api.example.com"],
    });
    await http(node, makeCtx({ fetchImpl: impl }));
    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ q: "news" }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  test("non-2xx status throws with the status code", async () => {
    const { impl } = stubFetch(new Response("nope", { status: 503 }));
    const node = makeNode({ url: "https://api.example.com/down", allowed_hosts: ["api.example.com"] });
    await expect(http(node, makeCtx({ fetchImpl: impl }))).rejects.toThrow(/503/);
  });

  test("response size cap refuses an over-cap body", async () => {
    const { impl } = stubFetch(new Response("x".repeat(2048), { headers: { "content-type": "text/plain" } }));
    const node = makeNode({
      url: "https://api.example.com/big",
      allowed_hosts: ["api.example.com"],
      max_response_bytes: 1024,
    });
    await expect(http(node, makeCtx({ fetchImpl: impl }))).rejects.toThrow(/1024-byte cap/);
  });
});

describe("env-refs vocabulary", () => {
  test("isEnvRef / resolveEnvRef / looksLikeSecretLiteral", () => {
    expect(isEnvRef("$MY_API_TOKEN")).toBe(true);
    expect(isEnvRef("Bearer $MY_API_TOKEN")).toBe(false);
    expect(isEnvRef("$lowercase")).toBe(false);
    expect(resolveEnvRef("not-a-ref")).toBe("not-a-ref");
    expect(() => resolveEnvRef("$DEFINITELY_UNSET_VAR_520")).toThrow(/DEFINITELY_UNSET_VAR_520/);
    expect(looksLikeSecretLiteral("$MY_API_TOKEN")).toBe(false);
    expect(looksLikeSecretLiteral("sk-abc123def456ghi789")).toBe(true);
    expect(looksLikeSecretLiteral("Bearer abcdef0123456789abcdef")).toBe(true);
    expect(looksLikeSecretLiteral("v2")).toBe(false);
    expect(looksLikeSecretLiteral("a sentence with spaces that is long")).toBe(false);
  });

  test("findSecretLiterals scans secret-ish keys incl. nested headers", () => {
    const offenders = findSecretLiterals({
      headers: { authorization: "Bearer abcdef0123456789abcdef", "x-version": "2026-01-01" },
      api_key: "sk-abc123def456ghi789",
      note: "sk-abc123def456ghi789", // non-secret key name — ignored
      token: "$MY_API_TOKEN", // env ref — fine
    });
    expect(offenders.map((o) => o.key).sort()).toEqual(["api_key", "headers.authorization"]);
  });
});

// ─── Lint (#520 checks in validateWorkflowGraph) ─────────────────────────────

function graphOf(nodes: WorkflowNode[]): WorkflowGraph {
  return { version: "2.0", name: "wf", nodes };
}

describe("workflow lint — http / webhook-trigger (#520)", () => {
  test("http node without allowed_hosts is a lint error", () => {
    const v = validateWorkflowGraph(graphOf([makeNode({ url: "https://api.example.com" })]));
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "http-allowed-hosts" && e.node === "pull")).toBe(true);
  });

  test("a provider host in allowed_hosts is a lint error naming the entry", () => {
    const v = validateWorkflowGraph(
      graphOf([
        makeNode({ url: "https://api.example.com", allowed_hosts: ["api.example.com", "api.elevenlabs.io"] }),
      ]),
    );
    const err = v.errors.find((e) => e.code === "http-provider-host");
    expect(err).toBeDefined();
    expect(err!.message).toContain("api.elevenlabs.io");
  });

  test("clean http node lints green; wildcard covering a provider host does not", () => {
    const clean = validateWorkflowGraph(
      graphOf([makeNode({ url: "https://api.example.com", allowed_hosts: ["api.example.com"] })]),
    );
    expect(clean.errors).toEqual([]);
    const wild = validateWorkflowGraph(
      graphOf([makeNode({ url: "https://x.googleapis.com", allowed_hosts: ["*.googleapis.com"] })]),
    );
    expect(wild.errors.some((e) => e.code === "http-provider-host")).toBe(true);
  });

  test("secret literal in http headers is a lint error; $ENV reference passes", () => {
    const literal = validateWorkflowGraph(
      graphOf([
        makeNode({
          url: "https://api.example.com",
          allowed_hosts: ["api.example.com"],
          headers: { authorization: "Bearer abcdef0123456789abcdef" },
        }),
      ]),
    );
    expect(literal.errors.some((e) => e.code === "secret-literal")).toBe(true);

    const envRef = validateWorkflowGraph(
      graphOf([
        makeNode({
          url: "https://api.example.com",
          allowed_hosts: ["api.example.com"],
          headers: { authorization: "$MY_API_TOKEN" },
        }),
      ]),
    );
    expect(envRef.errors).toEqual([]);
  });

  test("secret literal on a webhook-trigger node is a lint error pointing at the token store", () => {
    const v = validateWorkflowGraph(
      graphOf([makeNode({ secret: "abcdef0123456789abcdef" }, "webhook-trigger", "hook")]),
    );
    const err = v.errors.find((e) => e.code === "secret-literal" && e.node === "hook");
    expect(err).toBeDefined();
    expect(err!.fix).toContain("farm trigger token");
  });
});

describe("bundle manifest declares the http host surface (#520)", () => {
  test("deriveBundleRequirements unions allowed_hosts into httpAllowedHosts", () => {
    const reqs = deriveBundleRequirements([
      graphOf([
        makeNode({ url: "https://api.example.com", allowed_hosts: ["api.example.com", "*.cdn.example.com"] }),
        makeNode({ url: "https://feeds.example.org", allowed_hosts: ["feeds.example.org"] }, "http", "pull2"),
      ]),
    ]);
    expect(reqs.httpAllowedHosts).toEqual(["*.cdn.example.com", "api.example.com", "feeds.example.org"]);
  });
});

describe("bannedProviderHost", () => {
  test("suffix-matches provider hosts, strips *. prefixes, ignores lookalikes", () => {
    expect(bannedProviderHost("openrouter.ai")?.label).toBe("openrouter");
    expect(bannedProviderHost("*.elevenlabs.io")?.label).toBe("elevenlabs");
    expect(bannedProviderHost("sub.api.apify.com")?.label).toBe("apify");
    expect(bannedProviderHost("myopenrouter.ai")).toBeNull();
    expect(bannedProviderHost("example.com")).toBeNull();
  });
});
