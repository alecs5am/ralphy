import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadAnnotations,
  saveAnnotations,
  updateAnnotations,
  validateAnnotationUpdates,
} from "../electron/media/annotations";
import { MediaSessionState } from "../electron/media/session";
import { makeLibraryFixture, type LibraryFixture } from "./fixtures";

let fixture: LibraryFixture | undefined;
let secondFixture: LibraryFixture | undefined;

afterEach(async () => {
  if (fixture) await rm(fixture.parentPath, { recursive: true, force: true });
  if (secondFixture) await rm(secondFixture.parentPath, { recursive: true, force: true });
  fixture = undefined;
  secondFixture = undefined;
});

describe("media annotations", () => {
  test("atomically round-trips the complete review vocabulary", async () => {
    fixture = await makeLibraryFixture();
    const statuses = ["Unreviewed", "Approved", "Shortlist", "Needs Work", "Reject"] as const;

    await saveAnnotations(fixture.rootPath, {
      version: 1,
      items: Object.fromEntries(
        statuses.map((reviewStatus, index) => [
          `item-${index}`,
          {
            reviewStatus,
            favorite: index === 1,
            rating: index,
            tags: [`tag-${index}`],
            notes: `note-${index}`,
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
        ]),
      ),
    });

    expect(await loadAnnotations(fixture.rootPath)).toEqual({
      version: 1,
      items: expect.objectContaining({
        "item-3": expect.objectContaining({ reviewStatus: "Needs Work", rating: 3 }),
      }),
    });
    const storeDir = join(fixture.rootPath, "media-library");
    expect((await readdir(storeDir)).filter((name) => name !== "library.json")).toEqual([]);
    expect(JSON.parse(await readFile(join(storeDir, "library.json"), "utf8"))).toBeTruthy();
  });

  test("tolerates newer versions and normalizes invalid annotation fields", async () => {
    fixture = await makeLibraryFixture();
    const storeDir = join(fixture.rootPath, "media-library");
    await mkdir(storeDir, { recursive: true });
    await writeFile(
      join(storeDir, "library.json"),
      JSON.stringify({
        version: 99,
        future: true,
        items: {
          hero: {
            reviewStatus: "Maybe",
            favorite: "yes",
            rating: 12,
            tags: ["winner", 5],
            notes: 10,
            updatedAt: "invalid",
          },
        },
      }),
    );

    expect(await loadAnnotations(fixture.rootPath)).toEqual({
      version: 99,
      items: {
        hero: {
          reviewStatus: "Unreviewed",
          favorite: false,
          rating: 5,
          tags: ["winner"],
          notes: "",
          updatedAt: expect.any(String),
        },
      },
    });
  });

  test("rejects future-schema writes without dropping unknown fields", async () => {
    fixture = await makeLibraryFixture();
    const storeDir = join(fixture.rootPath, "media-library");
    const storePath = join(storeDir, "library.json");
    await mkdir(storeDir, { recursive: true });
    const future = {
      version: 99,
      futureTopLevel: { mode: "keep-me" },
      items: {
        hero: {
          reviewStatus: "Approved",
          favorite: false,
          rating: 4,
          tags: ["winner"],
          notes: "keep",
          updatedAt: "2026-07-30T00:00:00.000Z",
          futurePerItem: { score: 42 },
        },
      },
    };
    await writeFile(storePath, JSON.stringify(future));

    await expect(
      saveAnnotations(fixture.rootPath, await loadAnnotations(fixture.rootPath)),
    ).rejects.toThrow(/newer annotation schema/i);
    await expect(updateAnnotations(fixture.rootPath, {
      hero: {
        reviewStatus: "Reject",
        favorite: false,
        rating: 0,
        tags: [],
        notes: "replace",
      },
    })).rejects.toThrow(/newer annotation schema/i);
    expect(JSON.parse(await readFile(storePath, "utf8"))).toEqual(future);
  });

  test("updates one annotation without dropping existing entries", async () => {
    fixture = await makeLibraryFixture();
    await writeFile(
      join(fixture.rootPath, "media-library-seed.json"),
      "unrelated",
    );
    await updateAnnotations(fixture.rootPath, {
      first: { reviewStatus: "Approved", favorite: false, rating: 4, tags: [], notes: "" },
    });
    await updateAnnotations(fixture.rootPath, {
      second: { reviewStatus: "Reject", favorite: true, rating: 0, tags: ["bad"], notes: "redo" },
    });

    expect(Object.keys((await loadAnnotations(fixture.rootPath)).items)).toEqual(["first", "second"]);
  });

  test("rejects delayed loads and updates after switching libraries", async () => {
    fixture = await makeLibraryFixture();
    secondFixture = await makeLibraryFixture();
    await updateAnnotations(fixture.rootPath, {
      first: { reviewStatus: "Approved", favorite: false, rating: 4, tags: [], notes: "root-a" },
    });
    const before = await readFile(
      join(fixture.rootPath, "media-library", "library.json"),
      "utf8",
    );
    const state = new MediaSessionState();
    state.activateRoot(fixture.rootPath);
    const loadOperation = state.captureActive();
    const loading = loadAnnotations(fixture.rootPath, {
      assertCurrent: () => state.assertActive(loadOperation),
    });
    state.activateRoot(secondFixture.rootPath);

    await expect(loading).rejects.toThrow(/stale media session/i);

    state.activateRoot(fixture.rootPath);
    const updateOperation = state.captureActive();
    const updating = updateAnnotations(fixture.rootPath, {
      second: { reviewStatus: "Reject", favorite: false, rating: 0, tags: [], notes: "stale" },
    }, {
      assertCurrent: () => state.assertActive(updateOperation),
    });
    state.activateRoot(secondFixture.rootPath);

    await expect(updating).rejects.toThrow(/stale media session/i);
    expect(await readFile(join(fixture.rootPath, "media-library", "library.json"), "utf8"))
      .toBe(before);
  });

  test("rejects a delayed save before replacing the annotation store", async () => {
    fixture = await makeLibraryFixture();
    secondFixture = await makeLibraryFixture();
    const state = new MediaSessionState();
    state.activateRoot(fixture.rootPath);
    const operation = state.captureActive();
    const saving = saveAnnotations(fixture.rootPath, {
      version: 1,
      items: {},
    }, {
      assertCurrent: () => state.assertActive(operation),
    });
    state.activateRoot(secondFixture.rootPath);

    await expect(saving).rejects.toThrow(/stale media session/i);
    await expect(
      readFile(join(fixture.rootPath, "media-library", "library.json"), "utf8"),
    ).rejects.toThrow();
  });

  test("rolls back a store replacement that becomes stale during rename", async () => {
    fixture = await makeLibraryFixture();
    secondFixture = await makeLibraryFixture();
    const baseline = {
      version: 1,
      items: {
        first: {
          reviewStatus: "Approved" as const,
          favorite: false,
          rating: 4,
          tags: [],
          notes: "keep",
          updatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    };
    await saveAnnotations(fixture.rootPath, baseline);
    const state = new MediaSessionState();
    state.activateRoot(fixture.rootPath);
    const operation = state.captureActive();
    let switched = false;

    await expect(saveAnnotations(fixture.rootPath, {
      version: 1,
      items: {},
    }, {
      assertCurrent: () => state.assertActive(operation),
      renameFile: async (from, to) => {
        await rename(from, to);
        if (!switched) {
          switched = true;
          state.activateRoot(secondFixture!.rootPath);
        }
      },
    })).rejects.toThrow(/stale media session/i);

    expect(await loadAnnotations(fixture.rootPath)).toEqual(baseline);
  });

  test("rejects annotation batches above the IPC update limit", () => {
    const annotation = {
      reviewStatus: "Unreviewed",
      favorite: false,
      rating: 0,
      tags: [],
      notes: "",
    };
    const updates = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [`item-${index}`, annotation]),
    );

    expect(() => validateAnnotationUpdates(updates)).toThrow(/1,000/);
  });

  test("rejects aggregate annotation payloads before persistence", () => {
    const updates = Object.fromEntries(
      Array.from({ length: 3 }, (_, index) => [
        `item-${index}`,
        {
          reviewStatus: "Unreviewed",
          favorite: false,
          rating: 0,
          tags: [],
          notes: "x".repeat(1_500_000),
        },
      ]),
    );

    expect(() => validateAnnotationUpdates(updates)).toThrow(/payload is too large/);
  });
});
