import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { guardedAtomicWrite } from "../electron/media/atomic-write";
import { MediaSessionState } from "../electron/media/session";

let directory: string | undefined;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("guarded atomic writes", () => {
  test("restores the previous settings if the session changes during rename", async () => {
    directory = await mkdtemp(join(tmpdir(), "ralphy-settings-"));
    const path = join(directory, "media-library-settings.json");
    await writeFile(path, "{\"lastLibrary\":\"first\"}\n");
    const state = new MediaSessionState();
    state.activateRoot("/tmp/first/.ralphy");
    const operation = state.captureActive();
    let switched = false;

    await expect(guardedAtomicWrite(
      path,
      "{\"lastLibrary\":\"second\"}\n",
      {
        maxBytes: 64 * 1024,
        assertCurrent: () => state.assertActive(operation),
        renameFile: async (from, to) => {
          await rename(from, to);
          if (!switched) {
            switched = true;
            state.activateRoot("/tmp/second/.ralphy");
          }
        },
      },
    )).rejects.toThrow(/stale media session/i);

    expect(await readFile(path, "utf8")).toBe("{\"lastLibrary\":\"first\"}\n");
  });
});
