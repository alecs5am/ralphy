import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { setRoot } from "../../cli/lib/paths.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let fixtureRoot: string;
let dataRoot: string;
let workspaceId: string;
let projectId: string;

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-unit-domain-cli-"));
  dataRoot = path.join(fixtureRoot, ".ralphy");
  fs.mkdirSync(dataRoot);
  setRoot(fixtureRoot);
  openDomainDb();
  const workspace = createWorkspace({ slug: "unit-domain", name: "Unit Domain" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "delivery",
    name: "Delivery",
  });
  workspaceId = workspace.id;
  projectId = project.id;
});

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("entity-first Unit CLI", () => {
  test("creates an ordered eight-image Unit revision without copying media", async () => {
    const revisions = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        artifactRevision(`slide-${index + 1}`, `image-${index + 1}`),
      ),
    );
    const bucketFilesBefore = regularFiles(path.join(dataRoot, "buckets"));

    const created = expectOk<UnitView>(
      await runCli([
        "unit",
        "create",
        "--project",
        projectId,
        "--slug",
        "eight-slides",
        "--format",
        "carousel",
        "--items",
        JSON.stringify(
          revisions.map((revision, position) => ({
            artifactRevisionId: revision.id,
            role: "slide",
            position,
          })),
        ),
      ]),
    );

    expect(created.unit).toMatchObject({
      id: created.unit.id,
      projectId,
      slug: "eight-slides",
      format: "carousel",
      latestRevisionId: created.revision.id,
    });
    expect(created.items.map((item) => item.artifactRevisionId)).toEqual(
      revisions.map((revision) => revision.id),
    );
    expect(created.items.map((item) => item.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(regularFiles(path.join(dataRoot, "buckets"))).toEqual(bucketFilesBefore);
    expect(findNamed(fixtureRoot, "unit.json")).toEqual([]);
  });

  test("previews one video Unit through three platform presentations", async () => {
    const video = await artifactRevision("master-video", "video");
    const thumbnail = await artifactRevision("thumbnail", "thumbnail");
    const items = [
      { artifactRevisionId: video.id, role: "video", position: 0 },
      { artifactRevisionId: thumbnail.id, role: "thumbnail", position: 1 },
    ];
    const created = expectOk<UnitView>(
      await runCli([
        "unit",
        "create",
        "--project",
        projectId,
        "--slug",
        "platform-video",
        "--format",
        "video",
        "--items",
        JSON.stringify(items),
        "--presentations",
        JSON.stringify([
          {
            platform: "tiktok",
            caption: "TikTok caption",
            options: { privacy: "public" },
          },
          {
            platform: "instagram",
            caption: "Instagram caption",
            options: { placement: "reel" },
            items: [{ unitItemPosition: 0, position: 0 }],
          },
          {
            platform: "youtube",
            caption: "YouTube caption",
            options: { category: "education" },
          },
        ]),
      ]),
    );

    const tiktok = expectOk<UnitPreview>(
      await runCli(["--project", projectId, "unit", "preview", created.unit.id, "--platform", "tiktok"]),
    );
    const instagram = expectOk<UnitPreview>(
      await runCli(["--project", projectId, "unit", "preview", created.unit.id, "--platform", "instagram"]),
    );
    const youtube = expectOk<UnitPreview>(
      await runCli(["--project", projectId, "unit", "preview", created.unit.id, "--platform", "youtube"]),
    );

    expect([tiktok.unitId, instagram.unitId, youtube.unitId]).toEqual([
      created.unit.id,
      created.unit.id,
      created.unit.id,
    ]);
    expect(tiktok).toMatchObject({ inheritedItems: true, caption: "TikTok caption" });
    expect(tiktok.items.map((item) => item.artifactRevisionId)).toEqual([
      video.id,
      thumbnail.id,
    ]);
    expect(instagram).toMatchObject({
      inheritedItems: false,
      caption: "Instagram caption",
      options: { placement: "reel" },
    });
    expect(instagram.items.map((item) => item.artifactRevisionId)).toEqual([
      video.id,
    ]);
    expect(youtube).toMatchObject({
      inheritedItems: true,
      caption: "YouTube caption",
      options: { category: "education" },
    });
    expect(JSON.stringify([tiktok, instagram, youtube])).not.toContain(dataRoot);
  });

  test("keeps latest and selected optimistic expectations independent", async () => {
    const first = await artifactRevision("first", "first");
    const second = await artifactRevision("second", "second");
    const created = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "create",
        "--project",
        projectId,
        "--slug",
        "independent-heads",
        "--format",
        "video",
        "--items",
        itemsJson(first.id),
      ]),
    );
    const selected = expectOk<{ selectedRevisionId: string }>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "select",
        created.unit.id,
        "--revision",
        created.revision.id,
        "--expected",
        "none",
      ]),
    );
    expect(selected.selectedRevisionId).toBe(created.revision.id);

    const revised = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "revise",
        created.unit.id,
        "--expected",
        created.revision.id,
        "--items",
        itemsJson(second.id),
      ]),
    );
    expect(revised.unit).toMatchObject({
      latestRevisionId: revised.revision.id,
      selectedRevisionId: created.revision.id,
    });

    expect(
      errorCode(
        (
          await runCli([
            "--project",
            projectId,
            "unit",
            "revise",
            created.unit.id,
            "--expected",
            created.revision.id,
            "--items",
            itemsJson(first.id),
          ])
        ).stderr,
      ),
    ).toBe("E_CONFLICT");
    expect(
      errorCode(
        (
          await runCli([
            "--project",
            projectId,
            "unit",
            "select",
            created.unit.id,
            "--revision",
            revised.revision.id,
            "--expected",
            "none",
          ])
        ).stderr,
      ),
    ).toBe("E_CONFLICT");
  });

  test("rolls back a failed first revision so the corrected slug can be retried", async () => {
    const valid = await artifactRevision("retry-valid", "valid");
    const failed = await runCli([
      "--project",
      projectId,
      "unit",
      "create",
      "--slug",
      "atomic-retry",
      "--format",
      "video",
      "--items",
      itemsJson("arev_missing"),
    ]);
    expect(failed.exitCode).not.toBe(0);

    const corrected = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "create",
        "--slug",
        "atomic-retry",
        "--format",
        "video",
        "--items",
        itemsJson(valid.id),
      ]),
    );
    expect(corrected.unit).toMatchObject({
      slug: "atomic-retry",
      latestRevisionId: corrected.revision.id,
    });
  });

  test("caption creates a missing Presentation and add preserves immutable history", async () => {
    const first = await artifactRevision("caption-first", "first");
    const second = await artifactRevision("caption-second", "second");
    const created = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "create",
        "--slug",
        "caption-history",
        "--format",
        "video",
        "--items",
        itemsJson(first.id),
      ]),
    );

    const firstCaption = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "caption",
        created.unit.id,
        "--expected",
        created.revision.id,
        "--platform",
        "tiktok",
        "--text",
        "First human caption",
        "--state",
        "humanized",
      ]),
    );
    expect(firstCaption.presentations).toHaveLength(1);
    expect(firstCaption.presentations[0]!.captions.map((caption) => caption.state)).toEqual([
      "humanized",
    ]);

    const added = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "add",
        created.unit.id,
        "--expected",
        firstCaption.revision.id,
        "--artifact-revision",
        second.id,
        "--role",
        "supporting",
      ]),
    );
    expect(added.items.map((item) => item.artifactRevisionId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(added.presentations[0]!.captions.map((caption) => caption.text)).toEqual([
      "First human caption",
    ]);

    const revisedCaption = expectOk<UnitView>(
      await runCli([
        "--project",
        projectId,
        "unit",
        "caption",
        created.unit.id,
        "--expected",
        added.revision.id,
        "--platform",
        "tiktok",
        "--text",
        "Second human caption",
        "--state",
        "humanized",
      ]),
    );
    expect(revisedCaption.presentations[0]!.captions.map((caption) => [
      caption.state,
      caption.text,
    ])).toEqual([
      ["humanized", "First human caption"],
      ["auto-draft-archived", "First human caption"],
      ["humanized", "Second human caption"],
    ]);
    expect(revisedCaption.presentations[0]!.effectiveCaptionRevisionId).toBe(
      revisedCaption.presentations[0]!.captions[2]!.id,
    );
  });
});

async function artifactRevision(slug: string, bytes: string) {
  const sourcePath = path.join(fixtureRoot, `${slug}.bin`);
  fs.writeFileSync(sourcePath, bytes);
  const object = await ingestObject({
    scope: { workspaceId, projectId },
    sourcePath,
    originalName: `${slug}.bin`,
    mime: "application/octet-stream",
    storageClass: "durable",
    transfer: "copy",
  });
  const artifact = createArtifact({ projectId, slug, kind: "image" });
  return addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    parentRevisionId: null,
    state: "approved",
  });
}

function itemsJson(artifactRevisionId: string): string {
  return JSON.stringify([{ artifactRevisionId, role: "primary", position: 0 }]);
}

function regularFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function findNamed(root: string, name: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

async function runCli(args: string[]) {
  const child = Bun.spawn(
    [process.execPath, "run", CLI, "--json", "--root", dataRoot, ...args],
    {
      cwd: fixtureRoot,
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let json: unknown = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Error paths emit their structured envelope on stderr.
  }
  return { exitCode, stdout, stderr, json };
}

function expectOk<T>(result: Awaited<ReturnType<typeof runCli>>): T {
  expect(result.exitCode, result.stderr).toBe(0);
  return result.json as T;
}

function errorCode(stderr: string): string | null {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code) return parsed.error.code;
    } catch {
      // Ignore human diagnostics before the machine error envelope.
    }
  }
  return null;
}

type UnitItem = {
  artifactRevisionId: string | null;
  position: number;
};

type UnitView = {
  unit: {
    id: string;
    projectId: string | null;
    slug: string;
    format: string;
    latestRevisionId: string | null;
    selectedRevisionId: string | null;
  };
  revision: { id: string };
  items: UnitItem[];
  presentations: Array<{
    effectiveCaptionRevisionId: string | null;
    captions: Array<{
      id: string;
      state: string;
      text: string;
    }>;
  }>;
};

type UnitPreview = {
  unitId: string;
  inheritedItems: boolean;
  caption: string | null;
  options: unknown;
  items: UnitItem[];
};
