import { afterEach, describe, expect, test } from "bun:test";
import {
  assertLimit,
  buildPage,
  decodeCursor,
  encodeCursor,
  type CursorFamily,
} from "../../cli/lib/store/pagination.js";
import {
  appendActivity,
  latestActivitySequence,
  listActivity,
} from "../../cli/lib/store/activity.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FAMILIES: CursorFamily[] = ["c1", "v1", "p1"];

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-query-surfaces");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function raw(family: CursorFamily, json: string): string {
  return `${family}.${Buffer.from(json, "utf8").toString("base64url")}`;
}

describe("domain cursor codecs", () => {
  test("round-trips every family and keeps the prefixes distinct", () => {
    const encoded = FAMILIES.map((family) =>
      encodeCursor(family, { ordinal: 7, id: "entity-7" }),
    );
    for (const [index, family] of FAMILIES.entries()) {
      expect(encoded[index]!.startsWith(`${family}.`)).toBe(true);
      expect(decodeCursor(family, encoded[index]!)).toEqual({
        ordinal: 7,
        id: "entity-7",
      });
    }
    expect(new Set(encoded).size).toBe(FAMILIES.length);
  });

  test("rejects a cursor decoded by the wrong family", () => {
    for (const family of FAMILIES) {
      const cursor = encodeCursor(family, { ordinal: 1, id: "a" });
      for (const other of FAMILIES) {
        if (other === family) continue;
        expect(() => decodeCursor(other, cursor)).toThrow(/cursor/i);
      }
    }
  });

  test("accepts a zero ordinal and the longest allowed identifier", () => {
    const id = "a".repeat(128);
    expect(decodeCursor("p1", encodeCursor("p1", { ordinal: 0, id }))).toEqual({
      ordinal: 0,
      id,
    });
  });

  test("rejects malformed payloads", () => {
    const cases: string[] = [
      raw("c1", "[1]"),
      raw("c1", "[1,\"a\",2]"),
      raw("c1", "{\"ordinal\":1,\"id\":\"a\"}"),
      raw("c1", "[-1,\"a\"]"),
      raw("c1", "[1.5,\"a\"]"),
      raw("c1", `[${Number.MAX_SAFE_INTEGER + 2},"a"]`),
      raw("c1", "[1,\"\"]"),
      raw("c1", `[1,"${"a".repeat(129)}"]`),
      raw("c1", "[1,\"line\\nbreak\"]"),
      raw("c1", "[1,\"café\"]"),
      raw("c1", "[1,\"a\"] "),
      raw("c1", "[ 1,\"a\"]"),
      "c1.",
      "c1",
      "",
      "c1.not!base64url",
      `c1.${Buffer.from("[1,\"a\"]", "utf8").toString("base64")}=`,
    ];
    for (const cursor of cases) {
      expect(() => decodeCursor("c1", cursor)).toThrow(/cursor/i);
    }
  });

  test("rejects a cursor over 256 bytes before decoding it", () => {
    const oversized = `c1.${"A".repeat(254)}`;
    expect(oversized.length).toBeGreaterThan(256);
    expect(() => decodeCursor("c1", oversized)).toThrow(/cursor/i);
  });

  test("rejects encoding an out-of-range ordinal or identifier", () => {
    expect(() => encodeCursor("c1", { ordinal: -1, id: "a" })).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1.5, id: "a" })).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1, id: "" })).toThrow(/cursor/i);
    expect(() =>
      encodeCursor("c1", { ordinal: 1, id: "a".repeat(129) }),
    ).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1, id: "café" })).toThrow(
      /cursor/i,
    );
  });
});

describe("bounded page building", () => {
  const rows = [
    { createdAt: 10, id: "a" },
    { createdAt: 10, id: "b" },
    { createdAt: 11, id: "c" },
  ];
  const cursorOf = (row: (typeof rows)[number]) => ({
    ordinal: row.createdAt,
    id: row.id,
  });

  test("returns a cursor only when the extra row proves another page", () => {
    const full = buildPage(rows, 2, "c1", cursorOf);
    expect(full.items).toEqual([rows[0]!, rows[1]!]);
    expect(full.nextCursor).toBe(encodeCursor("c1", { ordinal: 10, id: "b" }));

    const last = buildPage(rows.slice(0, 2), 2, "c1", cursorOf);
    expect(last.items).toEqual([rows[0]!, rows[1]!]);
    expect(last.nextCursor).toBeNull();

    expect(buildPage([], 2, "c1", cursorOf)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  test("paginates equal timestamps by the tie-breaking identifier", () => {
    const first = buildPage(rows, 1, "c1", cursorOf);
    expect(first.items).toEqual([rows[0]!]);
    const after = decodeCursor("c1", first.nextCursor!);
    expect(after).toEqual({ ordinal: 10, id: "a" });
    const remaining = rows.filter(
      (row) =>
        row.createdAt > after.ordinal ||
        (row.createdAt === after.ordinal && row.id > after.id),
    );
    expect(remaining).toEqual([rows[1]!, rows[2]!]);
  });
});

describe("limit bounds", () => {
  test("accepts the inclusive integer range and rejects everything else", () => {
    expect(() => assertLimit(1)).not.toThrow();
    expect(() => assertLimit(100)).not.toThrow();
    expect(() => assertLimit(50, 50)).not.toThrow();
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
      expect(() => assertLimit(limit)).toThrow(/limit/i);
    }
    expect(() => assertLimit(51, 50)).toThrow(/limit/i);
  });
});

describe("global activity sequence", () => {
  test("returns an empty store as sequence zero", () => {
    makeRoot();
    openDomainDb();
    expect(latestActivitySequence()).toBe(0);
    expect(listActivity({ afterSequence: 0, limit: 10 })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  test("pages 101 events with no gap and no duplicate", () => {
    makeRoot();
    const db = openDomainDb();
    const workspace = createWorkspace({ slug: "activity", name: "Activity" });
    const baseline = latestActivitySequence();
    for (let index = 0; index < 101; index += 1) {
      appendActivity(db, {
        workspaceId: workspace.id,
        entityType: "document",
        entityId: `document-${index}`,
        action: "document.created",
        payload: { revisionNo: index },
        createdAt: 1_000 + index,
      });
    }
    const seen: number[] = [];
    let afterSequence = baseline;
    for (;;) {
      const page = listActivity({ afterSequence, limit: 100 });
      for (const item of page.items) seen.push(item.sequence);
      if (page.nextCursor === null) break;
      expect(page.nextCursor).toBe(page.items.at(-1)!.sequence);
      afterSequence = page.nextCursor;
    }
    expect(seen.length).toBe(101);
    expect(new Set(seen).size).toBe(101);
    expect(seen).toEqual(
      Array.from({ length: 101 }, (_, index) => baseline + index + 1),
    );
    expect(latestActivitySequence()).toBe(baseline + 101);
  });

  test("exposes only the safe DTO shape and never a raw payload", () => {
    makeRoot();
    const db = openDomainDb();
    const workspace = createWorkspace({ slug: "shape", name: "Shape" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "shape",
      name: "Shape",
    });
    appendActivity(db, {
      workspaceId: workspace.id,
      projectId: project.id,
      entityType: "run",
      entityId: "run-1",
      action: "run.started",
      payload: { kind: "generation" },
      createdAt: 5,
    });
    const page = listActivity({ afterSequence: 0, limit: 100 });
    const event = page.items.at(-1)!;
    expect(Object.keys(event).sort()).toEqual([
      "action",
      "createdAt",
      "entityId",
      "entityType",
      "projectId",
      "sequence",
      "workspaceId",
    ]);
    expect(event).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      entityType: "run",
      entityId: "run-1",
      action: "run.started",
      createdAt: 5,
    });
    expect(typeof event.sequence).toBe("number");
    expect(JSON.stringify(page)).not.toContain("generation");
  });

  test("rejects a malformed afterSequence or limit", () => {
    makeRoot();
    openDomainDb();
    for (const afterSequence of [-1, 1.5, Number.NaN]) {
      expect(() => listActivity({ afterSequence, limit: 10 })).toThrow(
        /sequence/i,
      );
    }
    for (const limit of [0, 101, 2.5]) {
      expect(() => listActivity({ afterSequence: 0, limit })).toThrow(/limit/i);
    }
  });
});

describe("activity payload safety", () => {
  function write(payload: unknown): void {
    const db = openDomainDb();
    appendActivity(db, {
      entityType: "document",
      entityId: "document-1",
      action: "document.created",
      payload: payload as never,
      createdAt: 1,
    });
  }

  test("accepts bounded identifiers, enums, counts, booleans, and null", () => {
    makeRoot();
    expect(() =>
      write({
        revisionId: "rev_01HX",
        revisionNo: 3,
        state: "approved",
        selected: true,
        parentRevisionId: null,
        mime: "image/png",
        fields: ["slug", "name"],
      }),
    ).not.toThrow();
  });

  test("rejects locators, hashes, secrets, and raw text", () => {
    makeRoot();
    openDomainDb();
    const rejected: Record<string, unknown>[] = [
      { path: "tmp/run/object.bin" },
      { locator: "buckets/ws/objects/a" },
      { sha256: "a".repeat(64) },
      { digest: "b".repeat(64) },
      { bucket: "buckets/ws/shared" },
      { idempotencyKey: "key-1" },
      { token: "abc" },
      { credential: "abc" },
      { secretRef: "abc" },
      { password: "abc" },
      { metadata: { any: 1 } },
      { config: { any: 1 } },
      { response: "ok" },
      { error: "boom" },
      { errorMessage: "boom" },
      { body: "text" },
      { promptText: "hello" },
      { url: "https://example.test" },
      { source: "https://example.test" },
      { source: "/absolute/path" },
      { source: "relative/nested/path" },
      { source: "a".repeat(129) },
      { source: "line\nbreak" },
      { source: "café" },
      { count: Number.NaN },
      { count: Number.POSITIVE_INFINITY },
      { fields: [{ nested: 1 }] },
      { "not a key": 1 },
    ];
    for (const payload of rejected) {
      expect(() => write(payload)).toThrow(/activity payload/i);
    }
    expect(latestActivitySequence()).toBe(0);
  });

  test("rejects a non-object payload and unbounded nesting", () => {
    makeRoot();
    openDomainDb();
    for (const payload of ["text", 1, true, ["a"], { a: { b: { c: 1 } } }]) {
      expect(() => write(payload)).toThrow(/activity payload/i);
    }
  });

  test("stores no forbidden raw payload anywhere in the domain suite writers", () => {
    makeRoot();
    const db = openDomainDb();
    const workspace = createWorkspace({ slug: "writers", name: "Writers" });
    createProject({
      workspaceId: workspace.id,
      slug: "writers",
      name: "Writers",
    });
    const stored = db
      .query<{ payload_json: string }, []>(
        "SELECT payload_json FROM activity_events",
      )
      .all()
      .map((row) => row.payload_json);
    expect(stored.length).toBeGreaterThan(0);
    for (const payload of stored) {
      expect(payload).not.toMatch(/"(path|sha256|locator|bucket|token)"/);
    }
  });
});

describe("internal row boundary", () => {
  const STORE_OWNED = /^cli\/lib\/(store|migrate)\//;

  test("only store, verifier, and migration modules import internal-types", async () => {
    const glob = new Bun.Glob("cli/**/*.ts");
    const offenders: string[] = [];
    for await (const file of glob.scan(".")) {
      if (STORE_OWNED.test(file)) continue;
      const source = await Bun.file(file).text();
      if (source.includes("store/internal-types")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("internal-types never becomes a cycle with the public types", async () => {
    const internal = await Bun.file("cli/lib/store/internal-types.ts").text();
    const publicTypes = await Bun.file("cli/lib/store/types.ts").text();
    // One-way: internal may import type-only from public, never the reverse.
    expect(internal).toContain('from "./types.js"');
    expect(internal.match(/^import (?!type )/m)).toBeNull();
    expect(publicTypes).not.toContain("internal-types");
  });

});
