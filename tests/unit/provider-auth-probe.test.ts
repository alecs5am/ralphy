import { expect, test } from "bun:test";
import { probeOpenRouterKey } from "../../cli/lib/providers/openrouter";

test("OpenRouter authentication uses metadata only and distinguishes rejected keys from unavailable checks", async () => {
  const key = "sk-or-nonfunctional-test-credential"; // gitleaks:allow
  const calls: { url: unknown; init?: RequestInit }[] = [];
  const fetcher = ((url: unknown, init?: RequestInit) => { calls.push({ url, init }); return Promise.resolve(new Response(JSON.stringify({ data: { label: key } }))); }) as typeof fetch;
  expect(await probeOpenRouterKey(key, fetcher)).toBe("valid");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/key");
  expect(calls[0]!.init).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${key}` } });
  expect(calls[0]!.init?.body).toBeUndefined();
  for (const status of [401, 403, 429, 500]) {
    const probe = (() => Promise.resolve(new Response(key, { status }))) as unknown as typeof fetch;
    expect(await probeOpenRouterKey(key, probe)).toBe(status === 401 || status === 403 ? "invalid" : "unreachable");
  }
  expect(await probeOpenRouterKey(key, (() => Promise.reject(new Error(key))) as unknown as typeof fetch)).toBe("unreachable");
  expect(await probeOpenRouterKey(key, (() => Promise.resolve(new Response("{}"))) as unknown as typeof fetch)).toBe("unreachable");
  expect(await probeOpenRouterKey(null, fetcher)).toBe("missing");
  expect(await probeOpenRouterKey("bad\nkey", fetcher)).toBe("invalid");
  expect(calls).toHaveLength(1);
});
