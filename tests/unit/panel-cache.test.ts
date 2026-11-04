import { describe, expect, test } from "bun:test";
import { TaskCache } from "../../cli/lib/panel/server.js";

function setup() {
  let clock = 1_000;
  const cache = new TaskCache(() => clock);
  const state = { runs: 0, value: "v1" as unknown, fail: null as Error | null, release: null as null | (() => void) };
  const run = () => {
    state.runs++;
    const current = state.value;
    const failure = state.fail;
    return new Promise<unknown>((resolve, reject) => {
      state.release = () => (failure ? reject(failure) : resolve({ items: [current] }));
    });
  };
  const get = (extra: { fresh?: boolean; ttlMs?: number; kind?: string; defaultMs?: number } = {}) =>
    cache.get({ key: "k", kind: extra.kind ?? "report", ttlMs: extra.ttlMs ?? 1_000, fresh: extra.fresh ?? false, run, message: "Working", defaultMs: extra.defaultMs ?? 5_000 });
  const finish = async () => { state.release!(); await cache.idle(); };
  return { cache, state, get, finish, tick: (ms: number) => { clock += ms; } };
}

describe("TaskCache", () => {
  test("first get answers 202 and starts the task", () => {
    const { get, state } = setup();
    const result = get();
    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({ computing: true, expectedMs: 5_000, message: "Working", startedAt: 1_000 });
    expect(state.runs).toBe(1);
  });

  test("a second get while running does not start another run", () => {
    const { get, state } = setup();
    get();
    expect(get().status).toBe(202);
    expect(state.runs).toBe(1);
  });

  test("answers 200 with computedAt once the task resolves", async () => {
    const { get, finish, tick } = setup();
    get();
    tick(50);
    await finish();
    const result = get();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: ["v1"], computedAt: 1_050 });
  });

  test("after ttl serves the old value and refreshes in the background", async () => {
    const { get, finish, tick, state } = setup();
    get();
    await finish();
    tick(500);
    expect(get().status).toBe(200);
    expect(state.runs).toBe(1);
    tick(600);
    state.value = "v2";
    const stale = get();
    expect(stale.status).toBe(200);
    expect((stale.body as any).items).toEqual(["v1"]);
    expect(state.runs).toBe(2);
    await finish();
    expect((get().body as any).items).toEqual(["v2"]);
    expect(state.runs).toBe(2);
  });

  test("fresh:true answers 202 until the forced run is done", async () => {
    const { get, finish, state } = setup();
    get();
    await finish();
    state.value = "v2";
    const forced = get({ fresh: true });
    expect(forced.status).toBe(202);
    expect(state.runs).toBe(2);
    // A plain get during the forced run must not serve the old value.
    expect(get().status).toBe(202);
    expect(state.runs).toBe(2);
    await finish();
    const done = get();
    expect(done.status).toBe(200);
    expect((done.body as any).items).toEqual(["v2"]);
  });

  test("a background (non-forced) refresh keeps answering 200", async () => {
    const { get, finish, tick, state } = setup();
    get();
    await finish();
    tick(2_000);
    get();
    expect(state.runs).toBe(2);
    expect(get().status).toBe(200);
    await finish();
  });

  test("a failing run answers one 502 with message and hint, then starts again", async () => {
    const { get, finish, state } = setup();
    state.fail = Object.assign(new Error("boom"), { hint: "try again later" });
    get();
    await finish();
    const failed = get();
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ error: { message: "boom", hint: "try again later" } });
    expect(state.runs).toBe(1);
    state.fail = null;
    const next = get();
    expect(next.status).toBe(202);
    expect(state.runs).toBe(2);
    await finish();
    expect(get().status).toBe(200);
  });

  test("an error without a hint reports hint null", async () => {
    const { get, finish, state } = setup();
    state.fail = new Error("plain");
    get();
    await finish();
    expect(get().body).toEqual({ error: { message: "plain", hint: null } });
  });

  test("a failed refresh keeps serving the cached value", async () => {
    const { get, finish, tick, state } = setup();
    get();
    await finish();
    tick(2_000);
    state.fail = new Error("later failure");
    expect(get().status).toBe(200);
    await finish();
    const result = get();
    expect(result.status).toBe(200);
    expect((result.body as any).items).toEqual(["v1"]);
  });

  test("the duration of a run becomes the next expectedMs for that kind", async () => {
    const { get, finish, tick, state } = setup();
    get();
    tick(7_300);
    await finish();
    state.value = "v2";
    const forced = get({ fresh: true });
    expect(forced.body).toMatchObject({ expectedMs: 7_300 });
    await finish();
    expect(get({ kind: "other", fresh: true }).body).toMatchObject({ expectedMs: 5_000 });
  });
});
