import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  getObjectRow,
  prepareObject,
  registerPreparedObject,
  resolveObjectPath,
} from "../../cli/lib/store/internal-objects.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";

import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";
import type {
  ObjectRow,
} from "../../cli/lib/store/internal-types.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Object store", () => {
  test("removes promoted bytes when preparation fails after rename", async () => {
    const { root, project } = setupProject("prepare-cleanup");
    const sourcePath = writeSource(root, "prepare-cleanup.bin", "prepared bytes");

    await expect(prepareObject({
      scope: { workspaceId: project.workspaceId, projectId: project.id },
      sourcePath,
      originalName: "prepared.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
      transfer: "copy",
      testHooks: { afterPromotion: () => { throw new Error("injected post-rename failure"); } },
    })).rejects.toThrow("injected post-rename failure");

    const bucketRoot = path.join(root.dir, "buckets");
    const entries = fs.existsSync(bucketRoot)
      ? fs.readdirSync(bucketRoot, { recursive: true }).map(String)
      : [];
    expect(entries.filter((entry) => entry.endsWith(".bin"))).toEqual([]);
  });

  test("ingests shared and Project bytes without overwriting equal names", async () => {
    const { root, workspace, project } = setupProject("paths");
    const sharedSource = writeSource(root, "shared.bin", "object-bytes");
    const firstSource = writeSource(root, "first.bin", "first");
    const secondSource = writeSource(root, "second.bin", "second");

    const sharedDto = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: sharedSource,
      originalName: "reference.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });
    const firstDto = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: firstSource,
      originalName: "scene.mp4",
      mime: "video/mp4",
      storageClass: "working",
    });
    const secondDto = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: secondSource,
      originalName: "scene.mp4",
      mime: "video/mp4",
      storageClass: "working",
    });

    expect(Object.keys(sharedDto).sort()).toEqual([
      "bytes",
      "createdAt",
      "id",
      "mime",
      "projectId",
      "storageClass",
      "workspaceId",
    ]);
    const shared = storedObject(sharedDto.id);
    const first = storedObject(firstDto.id);
    const second = storedObject(secondDto.id);
    expect(shared).toMatchObject({
      workspaceId: workspace.id,
      projectId: null,
      bucket: `buckets/${workspace.id}/shared`,
      sha256:
        "fc074942211ba9e25216dd0c17a24511ce67f99b5c7b0de0c45c98a88faf74ed",
      bytes: 12,
      originalName: "reference.bin",
    });
    expect(shared.key).toBe(`objects/${shared.id}.bin`);
    expect(resolveObjectPath(shared)).toBe(
      path.join(root.dir, ".ralphy", shared.bucket, shared.key),
    );
    expect(fs.readFileSync(resolveObjectPath(shared), "utf8")).toBe(
      "object-bytes",
    );
    expect(first.bucket).toBe(`buckets/${workspace.id}/projects/${project.id}`);
    expect(first.key).not.toBe(second.key);
    expect(fs.readFileSync(resolveObjectPath(first), "utf8")).toBe("first");
    expect(fs.readFileSync(resolveObjectPath(second), "utf8")).toBe("second");
    expect(fs.existsSync(sharedSource)).toBe(true);
    expect(fs.existsSync(firstSource)).toBe(true);
    expect(fs.existsSync(secondSource)).toBe(true);
  });

  test("moves the source only after registration and keeps prepare separate", async () => {
    const { root, workspace, project } = setupProject("transfer");
    const preparedSource = writeSource(root, "prepared.txt", "prepared");
    const prepared = await prepareObject({
      scope: { workspaceId: workspace.id },
      sourcePath: preparedSource,
      originalName: "prepared.txt",
      mime: "text/plain",
      storageClass: "diagnostic",
      metadata: { purpose: "fixture" },
      transfer: "copy",
    });

    expect(
      openDomainDb()
        .query("SELECT id FROM objects WHERE id = ?")
        .get(prepared.id),
    ).toBeNull();
    expect(scopedActivity({ workspaceId: workspace.id })).toEqual([
      expect.objectContaining({ action: "workspace.created" }),
      expect.objectContaining({ action: "project.created" }),
    ]);
    const registered = registerPreparedObject(openDomainDb(), prepared);
    expect(registered).toMatchObject({
      id: prepared.id,
      metadata: { purpose: "fixture" },
    });
    expect(resolveObjectPath(registered)).toBe(prepared.finalPath);
    expect(fs.existsSync(preparedSource)).toBe(true);

    const moveSource = writeSource(root, "move.wav", "move-me");
    const movedDto = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: moveSource,
      originalName: "move.wav",
      mime: "audio/wav",
      storageClass: "working",
      transfer: "move",
    });
    expect(fs.existsSync(moveSource)).toBe(false);
    expect(fs.readFileSync(resolveObjectPath(storedObject(movedDto.id)), "utf8")).toBe("move-me");
    expect(
      scopedActivity({ projectId: project.id }).map((event) => event.action),
    ).toEqual(["project.created", "object.registered"]);
  });

  test("preserves changed move bytes and a concurrent replacement", async () => {
    const { root, workspace } = setupProject("move-race");
    const source = writeSource(root, "move-race.bin", "prepared-bytes");
    const canonicalSource = fs.realpathSync(source);
    const copyFile = fs.promises.copyFile.bind(fs.promises);
    const rename = fs.promises.rename.bind(fs.promises);
    const copySpy = spyOn(fs.promises, "copyFile").mockImplementation(
      async (from, to, mode) => {
        await copyFile(from, to, mode);
        fs.writeFileSync(source, "changed-bytes");
      },
    );
    const renameSpy = spyOn(fs.promises, "rename").mockImplementation(
      async (from, to) => {
        await rename(from, to);
        if (path.resolve(String(from)) === canonicalSource) {
          fs.writeFileSync(source, "replacement-bytes");
        }
      },
    );

    try {
      await expect(
        ingestObject({
          scope: { workspaceId: workspace.id },
          sourcePath: source,
          originalName: "move-race.bin",
          mime: "application/octet-stream",
          storageClass: "working",
          transfer: "move",
        }),
      ).rejects.toThrow(/changed/i);
    } finally {
      copySpy.mockRestore();
      renameSpy.mockRestore();
    }

    expect(fs.readFileSync(source, "utf8")).toBe("replacement-bytes");
    const preserved = fs
      .readdirSync(path.dirname(source))
      .filter((name) => name !== path.basename(source))
      .flatMap((name) => {
        const candidate = path.join(path.dirname(source), name);
        return fs.statSync(candidate).isDirectory()
          ? fs
              .readdirSync(candidate)
              .map((child) => path.join(candidate, child))
          : [candidate];
      })
      .filter((candidate) => fs.statSync(candidate).isFile());
    expect(
      preserved.some(
        (candidate) => fs.readFileSync(candidate, "utf8") === "changed-bytes",
      ),
    ).toBe(true);
    const object = openDomainDb()
      .query<{ bucket: string; key: string }, []>(
        "SELECT bucket, key FROM objects",
      )
      .get();
    expect(object).not.toBeNull();
    expect(
      fs.readFileSync(
        path.join(root.dir, ".ralphy", object!.bucket, object!.key),
        "utf8",
      ),
    ).toBe("prepared-bytes");
  });

  test("rejects invalid scope, sources, names, MIME, and storage class before promotion", async () => {
    const { root, workspace, project } = setupProject("validation");
    const otherWorkspace = createWorkspace({ slug: "other", name: "Other" });
    const source = writeSource(root, "valid.bin", "valid");
    const empty = writeSource(root, "empty.bin", "");
    const directory = path.join(root.dir, "source-directory");
    fs.mkdirSync(directory);
    const immutableSource = path.join(
      root.dir,
      ".ralphy",
      "buckets",
      workspace.id,
      "shared",
      "objects",
      "existing.bin",
    );
    fs.mkdirSync(path.dirname(immutableSource), { recursive: true });
    fs.writeFileSync(immutableSource, "immutable");
    const valid = {
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: source,
      originalName: "valid.bin",
      mime: "application/octet-stream",
      storageClass: "durable" as const,
      transfer: "copy" as const,
    };

    await expect(
      prepareObject({ ...valid, scope: { workspaceId: "ws_missing" } }),
    ).rejects.toThrow(/Workspace not found/);
    await expect(
      prepareObject({
        ...valid,
        scope: { workspaceId: otherWorkspace.id, projectId: project.id },
      }),
    ).rejects.toThrow(/does not belong/i);
    for (const sourcePath of [
      "https://example.com/file.bin",
      "data:application/octet-stream;base64,dmFsaWQ=",
      path.join(root.dir, "missing.bin"),
      empty,
      directory,
      immutableSource,
      `${root.dir}/source-directory/../valid.bin`,
      "C:\\fixture\\valid.bin",
    ]) {
      await expect(prepareObject({ ...valid, sourcePath })).rejects.toThrow();
    }
    for (const originalName of ["", ".", "..", "a/b.bin", "a\\b.bin"]) {
      await expect(prepareObject({ ...valid, originalName })).rejects.toThrow(
        /originalName/i,
      );
    }
    await expect(prepareObject({ ...valid, mime: "   " })).rejects.toThrow(
      /MIME/i,
    );
    await expect(
      prepareObject({ ...valid, storageClass: "cache" as never }),
    ).rejects.toThrow(/storageClass/i);
    await expect(
      prepareObject({
        ...valid,
        metadata: { preview: "prefix data:image/png;base64,dmFsaWQ= suffix" },
      }),
    ).rejects.toThrow(/data URL/i);
    await expect(
      prepareObject({ ...valid, metadata: { imageData: "dmFsaWQ=" } }),
    ).rejects.toThrow(/base64/i);
    await expect(
      prepareObject({
        ...valid,
        metadata: { score: Number.POSITIVE_INFINITY } as never,
      }),
    ).rejects.toThrow(/non-finite/i);
    expect(
      openDomainDb().query("SELECT COUNT(*) AS count FROM objects").get(),
    ).toEqual({ count: 0 });
  });

  test("rejects tampered Object locators and absent or invalid final bytes", async () => {
    const { root, workspace } = setupProject("resolve");
    const source = writeSource(root, "stored.bin", "stored");
    const objectDto = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: source,
      originalName: "stored.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });

    const object = storedObject(objectDto.id);
    for (const tampered of [
      { bucket: "/tmp", key: object.key },
      { bucket: "C:\\tmp", key: object.key },
      { bucket: object.bucket, key: "../escape.bin" },
      { bucket: object.bucket, key: "/escape.bin" },
      { bucket: object.bucket, key: "C:\\escape.bin" },
      { bucket: object.bucket, key: "data:text/plain,bytes" },
      { bucket: `buckets/${workspace.id}/shared/other`, key: object.key },
      { bucket: object.bucket, key: `objects/obj_wrong.bin` },
    ]) {
      expect(() =>
        resolveObjectPath({ ...object, ...tampered } as ObjectRow),
      ).toThrow(/Object|locator|bucket|key/i);
    }

    const finalPath = resolveObjectPath(object);
    fs.rmSync(finalPath);
    expect(() => resolveObjectPath(object)).toThrow(/missing/i);
    fs.mkdirSync(finalPath);
    expect(() => resolveObjectPath(object)).toThrow(/regular file/i);
    fs.rmSync(finalPath, { recursive: true });
    fs.writeFileSync(finalPath, "");
    expect(() => resolveObjectPath(object)).toThrow(/empty/i);
  });

  test("rejects a symlink alias to immutable bytes before move can delete them", async () => {
    const { root, workspace } = setupProject("symlink-source");
    const source = writeSource(root, "original.bin", "immutable-original");
    const originalDto = await ingestObject({
      scope: { workspaceId: workspace.id },
      sourcePath: source,
      originalName: "original.bin",
      mime: "application/octet-stream",
      storageClass: "durable",
    });
    const original = storedObject(originalDto.id);
    const originalPath = resolveObjectPath(original);
    const alias = path.join(root.dir, "bucket-alias");
    fs.symlinkSync(path.dirname(originalPath), alias, "dir");

    await expect(
      ingestObject({
        scope: { workspaceId: workspace.id },
        sourcePath: path.join(alias, path.basename(originalPath)),
        originalName: "copied.bin",
        mime: "application/octet-stream",
        storageClass: "durable",
        transfer: "move",
      }),
    ).rejects.toThrow(/immutable buckets/i);
    expect(fs.readFileSync(resolveObjectPath(original), "utf8")).toBe(
      "immutable-original",
    );
    expect(
      openDomainDb().query("SELECT COUNT(*) AS count FROM objects").get(),
    ).toEqual({ count: 1 });
  });

  test("preserves promoted bytes when the registration transaction aborts", async () => {
    const { root, workspace, project } = setupProject("orphan");
    const source = writeSource(root, "orphan.mov", "orphan-bytes");
    openDomainDb().exec(`
      CREATE TRIGGER fail_object_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'object.registered'
      BEGIN
        SELECT RAISE(ABORT, 'forced object activity failure');
      END;
    `);

    await expect(
      ingestObject({
        scope: { workspaceId: workspace.id, projectId: project.id },
        sourcePath: source,
        originalName: "orphan.mov",
        mime: "video/quicktime",
        storageClass: "working",
        transfer: "move",
      }),
    ).rejects.toThrow(/forced object activity failure/);

    expect(fs.existsSync(source)).toBe(true);
    expect(
      openDomainDb().query("SELECT COUNT(*) AS count FROM objects").get(),
    ).toEqual({ count: 0 });
    const objectsDir = path.join(
      root.dir,
      ".ralphy",
      "buckets",
      workspace.id,
      "projects",
      project.id,
      "objects",
    );
    const orphanNames = fs.readdirSync(objectsDir);
    expect(orphanNames).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(objectsDir, orphanNames[0]!), "utf8"),
    ).toBe("orphan-bytes");
  });
});

function storedObject(id: string): ObjectRow {
  const row = getObjectRow(openDomainDb(), id);
  if (!row) throw new Error(`Object not found: ${id}`);
  return row;
}

function setupProject(label: string) {
  const root = makeTmpRoot(`ralphy-domain-objects-${label}`);
  roots.push(root);
  const workspace = createWorkspace({
    slug: `${label}-workspace`,
    name: label,
  });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${label}-project`,
    name: label,
  });
  return { root, workspace, project };
}

function writeSource(root: TmpRoot, name: string, contents: string): string {
  const sourcePath = path.join(root.dir, name);
  fs.writeFileSync(sourcePath, contents);
  return sourcePath;
}
