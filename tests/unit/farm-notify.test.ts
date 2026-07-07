// Farm notifications (#518) — event→channel mapping config, notifier dispatch
// (payload shape, fired events), and failure isolation (a throwing channel
// never fails the caller). ZERO network — fetch is injected.

import { describe, test, expect, afterEach } from "bun:test";
import {
  channelsForEvent,
  parseNotificationsConfig,
  type NotificationsConfig,
} from "../../cli/lib/schemas/notifications.js";
import {
  notifyFarmEvent,
  approvalDeepLink,
  type FarmNotification,
  type FetchLike,
} from "../../cli/lib/farm/notify.js";

const baseNote = (over: Partial<FarmNotification> = {}): FarmNotification => ({
  event: "run-parked",
  workspace: "studio",
  title: "parked",
  ts: "2026-07-06T00:00:00.000Z",
  ...over,
});

/** A fetch mock that records calls and returns a configurable status. */
function recordingFetch(ok = true, status = 200): { fetch: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: ok ? status : status });
  };
  return { fetch, calls };
}

describe("channelsForEvent — event→channel mapping", () => {
  test("quiet by default: no config = no channels", () => {
    const cfg = parseNotificationsConfig({});
    expect(channelsForEvent(cfg, "run-parked")).toEqual([]);
  });

  test("enabled:false disables every event even with a mapping", () => {
    const cfg = parseNotificationsConfig({
      enabled: false,
      channels: { webhook: { url: "https://hook.example.com/x" } },
      events: { "run-parked": ["webhook"] },
    });
    expect(channelsForEvent(cfg, "run-parked")).toEqual([]);
  });

  test("a mapped-but-unconfigured channel is filtered out", () => {
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { webhook: { url: "https://hook.example.com/x" } },
      events: { "run-parked": ["webhook", "telegram"] }, // telegram not configured
    });
    expect(channelsForEvent(cfg, "run-parked")).toEqual(["webhook"]);
  });

  test("distinct events map to distinct channel sets", () => {
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { webhook: { url: "https://hook.example.com/x" }, telegram: { chatId: "42" } },
      events: { "run-parked": ["telegram"], "budget-halt": ["webhook", "telegram"] },
    });
    expect(channelsForEvent(cfg, "run-parked")).toEqual(["telegram"]);
    expect(channelsForEvent(cfg, "budget-halt")).toEqual(["webhook", "telegram"]);
    expect(channelsForEvent(cfg, "run-failed")).toEqual([]);
  });
});

describe("notifyFarmEvent — dispatch + payload shape", () => {
  test("webhook POSTs the notification JSON as the body", async () => {
    const cfg: NotificationsConfig = parseNotificationsConfig({
      enabled: true,
      channels: { webhook: { url: "https://hook.example.com/x" } },
      events: { "run-parked": ["webhook"] },
    });
    const { fetch, calls } = recordingFetch();
    const note = baseNote({ body: "waiting", runId: "r1", url: "https://d/#studio/run/r1" });
    const results = await notifyFarmEvent(note, { config: cfg, fetchImpl: fetch });
    expect(results).toEqual([{ channel: "webhook", ok: true, status: 200 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://hook.example.com/x");
    expect(calls[0]!.init?.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ event: "run-parked", workspace: "studio", title: "parked", runId: "r1" });
  });

  test("telegram sends to the bot API with chat_id + message text", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { telegram: { chatId: "999" } },
      events: { "budget-halt": ["telegram"] },
    });
    const { fetch, calls } = recordingFetch();
    const results = await notifyFarmEvent(baseNote({ event: "budget-halt", title: "halted", body: "cap hit" }), {
      config: cfg,
      fetchImpl: fetch,
    });
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(results[0]!.ok).toBe(true);
    expect(calls[0]!.url).toContain("/bottest-token/sendMessage");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("halted");
    expect(body.text).toContain("cap hit");
  });

  test("telegram with no token set fails softly (no throw, ok:false)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { telegram: { chatId: "1" } },
      events: { "run-failed": ["telegram"] },
    });
    const errs: string[] = [];
    const { fetch } = recordingFetch();
    const results = await notifyFarmEvent(baseNote({ event: "run-failed" }), {
      config: cfg,
      fetchImpl: fetch,
      onError: (_c, e) => errs.push(e),
    });
    expect(results[0]!.ok).toBe(false);
    expect(errs[0]).toContain("TELEGRAM_BOT_TOKEN");
  });

  test("no channels mapped → empty result, no fetch", async () => {
    const cfg = parseNotificationsConfig({ enabled: true, channels: {}, events: {} });
    const { fetch, calls } = recordingFetch();
    const results = await notifyFarmEvent(baseNote(), { config: cfg, fetchImpl: fetch });
    expect(results).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("notifyFarmEvent — failure isolation (never fails the run)", () => {
  test("a throwing channel is caught and reported, not propagated", async () => {
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { webhook: { url: "https://hook.example.com/x" } },
      events: { "node-quarantined": ["webhook"] },
    });
    const throwingFetch: FetchLike = async () => {
      throw new Error("network down");
    };
    const errs: Array<{ channel: string; error: string }> = [];
    // The call resolves (does not reject) despite the throwing fetch.
    const results = await notifyFarmEvent(baseNote({ event: "node-quarantined" }), {
      config: cfg,
      fetchImpl: throwingFetch,
      onError: (channel, error) => errs.push({ channel, error }),
    });
    expect(results).toEqual([{ channel: "webhook", ok: false, error: "network down" }]);
    expect(errs).toEqual([{ channel: "webhook", error: "network down" }]);
  });

  test("a non-ok HTTP status is reported ok:false, still no throw", async () => {
    const cfg = parseNotificationsConfig({
      enabled: true,
      channels: { webhook: { url: "https://hook.example.com/x" } },
      events: { "run-parked": ["webhook"] },
    });
    const { fetch } = recordingFetch(false, 500);
    const results = await notifyFarmEvent(baseNote(), { config: cfg, fetchImpl: fetch });
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.status).toBe(500);
  });
});

describe("approvalDeepLink", () => {
  test("uses the configured dashboard base when present", () => {
    const cfg = parseNotificationsConfig({ enabled: true, dashboardBaseUrl: "https://studio.example.com/" });
    expect(approvalDeepLink(cfg, "studio", "r1")).toBe("https://studio.example.com/#studio/run/r1");
  });

  test("falls back to a relative hash route with no base", () => {
    const cfg = parseNotificationsConfig({ enabled: true });
    expect(approvalDeepLink(cfg, "studio", "r1")).toBe("/#studio/run/r1");
  });
});
