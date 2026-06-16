// Unit tests for the library QA lint (#448).
//
// Three layers:
//   1. The REAL library.json passes the fast path (a future broken record fails CI).
//   2. A synthetic doc with one broken entity per category proves each check has teeth.
//   3. The net path with an injected fetchImpl (404) proves a broken-media finding
//      fires — without touching the real network.

import { describe, test, expect } from "bun:test";
import path from "node:path";
import { lintLibrary, type LibraryDoc, type FetchImpl } from "../../scripts/lint-library.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

describe("lintLibrary — real library (fast path)", () => {
  test("the committed library.json passes the fast path", async () => {
    const r = await lintLibrary({ repo: REPO, net: false });
    if (!r.ok) console.error(JSON.stringify(r.findings.filter((f) => f.severity === "fail"), null, 2));
    expect(r.ok).toBe(true);
    expect(r.scanned.units).toBeGreaterThan(0);
  });
});

// A minimal valid doc the teeth tests mutate one field at a time.
function validDoc(): LibraryDoc {
  return {
    schemaVersion: 1,
    formats: [{ id: "video", label: "Video" }],
    blocks: [
      { kind: "template", id: "tpl-a", name: "A", blurb: "b" },
      { kind: "recipe", id: "rec-a", name: "R", blurb: "b", recipeKind: "ffmpeg" },
      { kind: "asset", id: "ast-a", name: "X", blurb: "b", sub: "music" },
    ],
    units: [
      {
        id: "u1", format: "video", title: "T", blurb: "B", mediaCount: 1,
        templateId: "tpl-a", recipeIds: ["rec-a"], assetIds: ["ast-a"],
        media: [{ src: "/x.mp4", kind: "video", aspect: "9 / 16" }],
      },
    ],
    blueprints: [{ unitId: "u1" }],
  };
}

describe("lintLibrary — teeth (synthetic broken docs)", () => {
  test("baseline synthetic doc is clean", async () => {
    expect((await lintLibrary({ repo: REPO, doc: validDoc() })).ok).toBe(true);
  });

  test("dangling template ref fails (ref)", async () => {
    const doc = validDoc();
    doc.units![0]!.templateId = "tpl-ghost";
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.category === "ref" && f.message.includes("tpl-ghost"))).toBe(true);
  });

  test("dangling recipe ref fails (ref)", async () => {
    const doc = validDoc();
    doc.units![0]!.recipeIds = ["rec-ghost"];
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.findings.some((f) => f.category === "ref" && f.message.includes("rec-ghost"))).toBe(true);
  });

  test("missing required field fails (schema)", async () => {
    const doc = validDoc();
    delete doc.units![0]!.title;
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.category === "schema" && f.message.includes("title"))).toBe(true);
  });

  test("missing media aspect fails (preview)", async () => {
    const doc = validDoc();
    (doc.units![0]!.media as Array<Record<string, unknown>>)[0]!.aspect = "";
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.findings.some((f) => f.category === "preview")).toBe(true);
  });

  test("missing templateId is a provenance WARN, not a fail", async () => {
    const doc = validDoc();
    doc.units![0]!.templateId = "";
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.ok).toBe(true); // warn-only keeps it green
    expect(r.findings.some((f) => f.category === "provenance" && f.severity === "warn")).toBe(true);
  });

  test("dangling blueprint.unitId fails (ref)", async () => {
    const doc = validDoc();
    doc.blueprints![0]!.unitId = "u-ghost";
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.entityKind === "blueprint" && f.category === "ref")).toBe(true);
  });

  test("asset block missing sub fails (schema)", async () => {
    const doc = validDoc();
    delete doc.blocks![2]!.sub;
    const r = await lintLibrary({ repo: REPO, doc });
    expect(r.findings.some((f) => f.entityKind === "block" && f.message.includes("sub"))).toBe(true);
  });
});

describe("lintLibrary — net path (injected fetch)", () => {
  const doc: LibraryDoc = {
    ...validDoc(),
    units: [
      {
        id: "u1", format: "video", title: "T", blurb: "B", mediaCount: 1,
        templateId: "tpl-a", recipeIds: [], assetIds: [],
        media: [{ src: "/x.mp4", kind: "video", aspect: "9 / 16", storageUrl: "https://cdn.example/x.mp4" }],
      },
    ],
  };

  test("404 from injected fetch produces a broken-media finding", async () => {
    const fetch404: FetchImpl = async () => ({ status: 404 });
    const r = await lintLibrary({ repo: REPO, doc, net: true, fetchImpl: fetch404, timeoutMs: 100 });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.category === "media" && f.message.includes("404"))).toBe(true);
  });

  test("200 from injected fetch leaves the doc clean", async () => {
    const fetch200: FetchImpl = async () => ({ status: 200 });
    const r = await lintLibrary({ repo: REPO, doc, net: true, fetchImpl: fetch200, timeoutMs: 100 });
    expect(r.ok).toBe(true);
  });
});
