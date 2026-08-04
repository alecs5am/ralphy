import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type SourceKind = "ralphy" | "legacy-workspace" | "desktop";

type Inventory = {
  entries: number;
  files: number;
  bytes: number;
};

export type LegacyFixture = {
  root: string;
  sourceRoots: Array<{
    id: string;
    kind: SourceKind;
    path: string;
    device: bigint;
    inode: bigint;
  }>;
  expected: Inventory & {
    bySource: Record<SourceKind, Inventory>;
    sha256: Record<string, string>;
  };
  paths: {
    currentRoot: string;
    legacyRoot: string;
    desktopRoot: string;
    registry: string;
    registeredProject: string;
    physicalOnlyProject: string;
    assetManifest: string;
    jsonl: string;
    carousel: string;
    stickerPack: string;
    repeatedPack: string;
    instagramCookies: string;
    jobsDb: string;
    symlink: string;
    fifo: string;
    socket: string;
  };
  cleanup(): void;
};

export function buildLegacyLibrary(root: string): LegacyFixture {
  const currentRoot = path.join(root, ".ralphy");
  const legacyRoot = path.join(root, "workspace", ".ralph");
  const desktopRoot = path.join(root, "desktop-data");
  const registeredProject = path.join(
    currentRoot,
    "workspaces",
    "studio",
    "projects",
    "registered-project",
  );
  const physicalOnlyProject = path.join(
    currentRoot,
    "workspaces",
    "studio",
    "projects",
    "physical-only-project",
  );
  fs.mkdirSync(currentRoot, { recursive: true });
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.mkdirSync(desktopRoot, { recursive: true });

  const registry = path.join(currentRoot, "registry.json");
  writeJson(registry, {
    version: 3,
    currentWorkspace: "studio",
    projects: {
      "registered-project": {
        workspace: "studio",
        path: "workspaces/studio/projects/registered-project",
      },
      "registry-only-project": {
        workspace: "studio",
        path: "workspaces/studio/projects/registry-only-project",
      },
    },
  });
  writeJson(path.join(currentRoot, "config.json"), {
    x: { accessToken: "fixture-x-plaintext-token" },
    postiz: { apiKey: "fixture-postiz-plaintext-key" },
  });
  writeJson(path.join(currentRoot, "workspaces", "studio", "workspace.json"), {
    slug: "studio",
    name: "Studio Fixture",
    telegram: { botToken: "fixture-telegram-plaintext-token" },
    channels: ["x", "telegram", "postiz"],
  });

  buildLegacyLayout(legacyRoot);
  buildProject(registeredProject, root);
  writeJson(path.join(physicalOnlyProject, "project.json"), {
    id: "physical-only-project",
    name: "Physical Only Project",
  });
  write(path.join(physicalOnlyProject, "BRIEF.md"), "Physical-only evidence.\n");
  fs.mkdirSync(path.join(physicalOnlyProject, "semantic-empty-directory"), {
    recursive: true,
  });
  write(path.join(physicalOnlyProject, "semantic-empty.md"), "");

  const workspaceUnits = path.join(currentRoot, "workspaces", "studio", "units");
  writeJson(path.join(workspaceUnits, "workspace-announcement", "unit.json"), {
    id: "workspace-announcement",
    format: "post",
    media: [],
    body: "Workspace-level announcement",
  });
  buildOperationalEvidence(currentRoot);
  buildUnusualRoots(currentRoot);
  buildFarmRawEvidence(currentRoot);
  buildDesktopEvidence(desktopRoot);

  const instagramCookies = path.join(currentRoot, "tmp", "ig-cookies.txt");
  write(
    instagramCookies,
    Buffer.from("fixture-instagram-cookie\n".repeat(30_000)).subarray(0, 667_395),
  );
  if (fs.statSync(instagramCookies).size !== 667_395) {
    const fd = fs.openSync(instagramCookies, "a");
    try {
      const missing = 667_395 - fs.fstatSync(fd).size;
      if (missing > 0) fs.writeSync(fd, Buffer.alloc(missing, 0x78));
    } finally {
      fs.closeSync(fd);
    }
  }

  const blockers = path.join(currentRoot, "blockers");
  fs.mkdirSync(blockers, { recursive: true });
  const symlink = path.join(blockers, "profile-link");
  fs.symlinkSync("../PROFILE.md", symlink);
  const fifo = path.join(blockers, "migration.fifo");
  const mkfifo = Bun.which("mkfifo");
  if (mkfifo === null || Bun.spawnSync([mkfifo, fifo]).exitCode !== 0) {
    throw new Error("mkfifo is required for the migration fixture");
  }
  const socket = path.join(currentRoot, "migration.sock");
  const socketServer = Bun.listen({
    unix: socket,
    socket: {
      data() {},
    },
  });

  const jobsDb = path.join(currentRoot, "jobs.db");
  const jobs = new Database(jobsDb, { create: true });
  jobs.exec("PRAGMA journal_mode = WAL");
  jobs.exec("PRAGMA wal_autocheckpoint = 0");
  jobs.exec(`
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE job_logs (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL,
      line TEXT NOT NULL
    );
  `);
  jobs.transaction(() => {
    jobs.prepare(
      "INSERT INTO jobs (id, status, command, created_at) VALUES (1, 'pending', ?, 1700000000000)",
    ).run('{"argv":["render","registered-project"]}');
    jobs.prepare(
      "INSERT INTO job_logs (id, job_id, line) VALUES (1, 1, 'legacy pending job')",
    ).run();
  }).immediate();
  write(path.join(currentRoot, "job-logs", "1.log"), "legacy pending job\n");
  write(path.join(currentRoot, "logs", "old-daemon.log"), "daemon stopped\n");

  const sourceRoots = [
    source("source-ralphy", "ralphy", currentRoot),
    source("source-legacy", "legacy-workspace", legacyRoot),
    source("source-desktop", "desktop", desktopRoot),
  ];
  const snapshots = sourceRoots.map((item) => [item.kind, snapshot(item.path)] as const);
  const bySource = Object.fromEntries(
    snapshots.map(([kind, value]) => [kind, value.inventory]),
  ) as Record<SourceKind, Inventory>;
  const expected = {
    entries: snapshots.reduce((total, [, value]) => total + value.inventory.entries, 0),
    files: snapshots.reduce((total, [, value]) => total + value.inventory.files, 0),
    bytes: snapshots.reduce((total, [, value]) => total + value.inventory.bytes, 0),
    bySource,
    sha256: Object.fromEntries(
      snapshots.flatMap(([kind, value]) =>
        Object.entries(value.sha256).map(([relative, digest]) => [
          `${kind}:${relative}`,
          digest,
        ]),
      ),
    ),
  };

  let closed = false;
  return {
    root,
    sourceRoots,
    expected,
    paths: {
      currentRoot,
      legacyRoot,
      desktopRoot,
      registry,
      registeredProject,
      physicalOnlyProject,
      assetManifest: path.join(registeredProject, "asset-manifest.json"),
      jsonl: path.join(registeredProject, "generations.jsonl"),
      carousel: path.join(registeredProject, "units", "carousel", "unit.json"),
      stickerPack: path.join(registeredProject, "units", "sticker-pack", "unit.json"),
      repeatedPack: path.join(registeredProject, "units", "repeated-pack", "unit.json"),
      instagramCookies,
      jobsDb,
      symlink,
      fifo,
      socket,
    },
    cleanup() {
      if (closed) return;
      closed = true;
      jobs.close();
      socketServer.stop(true);
    },
  };
}

function buildLegacyLayout(legacyRoot: string): void {
  writeJson(path.join(legacyRoot, "registry.json"), {
    projects: {
      "legacy-registered": { path: "projects/legacy-registered" },
      "legacy-registry-only": { path: "projects/legacy-registry-only" },
    },
  });
  writeJson(path.join(legacyRoot, "projects", "legacy-registered", "project.json"), {
    id: "legacy-registered",
    workspace: "default",
  });
  writeJson(path.join(legacyRoot, "projects", "legacy-physical-only", "project.json"), {
    id: "legacy-physical-only",
    workspace: "default",
  });
  write(path.join(legacyRoot, "projects", "legacy-registered", "scenario.md"), "Legacy scenario.\n");
  write(path.join(legacyRoot, "projects", "legacy-registered", "render", "final.mp4"), "legacy-render");
  write(path.join(legacyRoot, "generations.jsonl"), '{"id":"legacy-generation","status":"completed"}\n');
  fs.mkdirSync(path.join(legacyRoot, "empty-directory"), { recursive: true });
  write(path.join(legacyRoot, "unknown.empty"), "");
  buildConflictingProductionAndDelivery(
    path.join(legacyRoot, "projects", "legacy-registered"),
  );
}

function buildProject(project: string, root: string): void {
  writeJson(path.join(project, "project.json"), {
    id: "registered-project",
    title: "Denti-style Migration Fixture",
    stage: "delivery",
  });
  write(path.join(project, "BRIEF.md"), "A complete migration fixture.\n");
  writeJson(path.join(project, "feedback", "R2.json"), {
    round: 2,
    verdict: "needs-work",
    notes: ["Tighten the hook", "Keep the product visible"],
  });
  writeJson(path.join(project, "feedback", "R3.json"), {
    round: 3,
    verdict: "approved",
    resolvedFrom: "R2",
  });
  for (const name of [
    "index.html",
    "index.branch-a.html",
    "index.branch-a.v2.html",
    "index-v2.html",
    "index.r3.html",
    "index-final.html",
    "index-final-final.html",
  ]) {
    write(path.join(project, "composition", name), `<html><body>${name}</body></html>\n`);
  }
  for (const name of [
    "master.mp4",
    "master.v2.mp4",
    "social.mp4",
    "social.v3.mp4",
    "final.mp4",
    "final2.mp4",
    "r2.mp4",
    "clip-v2.mp4",
  ]) {
    write(path.join(project, "render", name), `fixture-video:${name}`);
  }
  write(path.join(project, "render", "work-001", "frames.txt"), "1\n2\n3\n");
  write(path.join(project, "render", "work-crashed", "stderr.log"), "injected crash\n");
  write(path.join(project, "notes", "loose.md"), "Loose project note.\n");
  write(path.join(project, "exports", "loose.zip"), Buffer.from("504b0304", "hex"));
  buildConflictingProductionAndDelivery(project);

  const anchor = path.join(project, "artifacts", "images", "anchor.png");
  write(anchor, "anchor-image");
  writeJson(path.join(project, "asset-manifest.json"), {
    version: 1,
    assets: [
      { slot: "absolute", path: anchor },
      { slot: "embedded", dataUrl: "data:image/png;base64,UE5H" },
    ],
  });
  write(
    path.join(project, "generations.jsonl"),
    '{"id":"before","status":"failed"}\n' +
      '{"id":"malformed",\n' +
      '{"id":"after","status":"succeeded"}\n',
  );

  const carouselMedia = Array.from({ length: 8 }, (_, index) =>
    `artifacts/images/carousel-${String(index + 1).padStart(2, "0")}.png`,
  );
  const stickerMedia = Array.from({ length: 32 }, (_, index) =>
    `artifacts/images/sticker-${String(index + 1).padStart(2, "0")}.png`,
  );
  const repeatedMedia = Array.from({ length: 40 }, (_, index) =>
    `artifacts/images/pack-${String((index % 10) + 1).padStart(2, "0")}.png`,
  );
  for (const relative of [...carouselMedia, ...stickerMedia, ...new Set(repeatedMedia)]) {
    write(path.join(project, relative), `fixture-media:${relative}`);
  }
  const units = path.join(project, "units");
  writeJson(path.join(units, "carousel", "unit.json"), {
    id: "carousel",
    format: "carousel",
    media: carouselMedia,
    presentations: [{ platform: "instagram", media: carouselMedia }],
  });
  writeJson(path.join(units, "sticker-pack", "unit.json"), {
    id: "sticker-pack",
    format: "pack",
    media: stickerMedia,
  });
  writeJson(path.join(units, "repeated-pack", "unit.json"), {
    id: "repeated-pack",
    format: "pack",
    media: repeatedMedia,
  });
  writeJson(path.join(units, "article", "unit.json"), {
    id: "article",
    format: "article",
    media: [carouselMedia[0]],
    bodyPath: "article.md",
    manifestOnlyAttempt: { provider: "manual", status: "exported" },
  });
  write(path.join(units, "article", "article.md"), "# Fixture article\n\nArticle body.\n");
  writeJson(path.join(units, "duplicate-media", "unit.json"), {
    id: "duplicate-media",
    format: "post",
    media: [carouselMedia[0], carouselMedia[0]],
  });
  writeJson(path.join(units, "text-post", "unit.json"), {
    id: "text-post",
    format: "post",
    media: [],
    body: "Text-only post",
  });
  writeJson(path.join(units, "text-thread", "unit.json"), {
    id: "text-thread",
    format: "thread",
    media: [],
    items: ["First", "Second"],
  });
  for (const [directory, revision] of [
    ["campaign", 1],
    ["campaign.v2", 2],
    ["foo-v2", 1],
  ] as const) {
    writeJson(path.join(units, directory, "unit.json"), {
      id: directory === "foo-v2" ? "foo-v2" : "campaign",
      revision,
      media: [carouselMedia[1]],
    });
  }
  writeJson(path.join(units, "campaign.v2", "captions.json"), {
    caption_versions: [
      { version: 1, state: "auto_draft_archived", text: "Draft caption" },
      { version: 2, state: "humanized", text: "Humanized caption" },
    ],
  });

  const publishRows = [
    { id: "accountless-failure", provider: "postiz", accountId: null, status: "failed" },
    { id: "slot-failed", provider: "postiz", slot: "instagram", status: "failed" },
    { id: "slot-success", provider: "postiz", slot: "instagram", status: "published" },
    {
      id: "partial-targets",
      provider: "postiz",
      status: "partial",
      targets: [
        { platform: "x", status: "published" },
        { platform: "telegram", status: "failed" },
      ],
    },
    { id: "ledger-only", provider: "postiz", status: "submitted" },
    { id: "github-pages", provider: "github-pages", status: "published" },
    { id: "devto", provider: "dev.to", status: "published" },
    { id: "hashnode", provider: "hashnode", status: "published" },
    { id: "medium", provider: "medium", status: "approval-exported" },
    { id: "manual", provider: "manual", status: "exported" },
    { id: "revision", provider: "postiz", status: "published", revisedFrom: "slot-success" },
  ];
  writeJsonl(path.join(project, "publish-ledger.jsonl"), publishRows);
  writeJsonl(path.join(project, "analytics.jsonl"), [
    { publicationId: "slot-success", source: "postiz", views: 101, likes: 7 },
    { publicationId: "github-pages", source: "manual", views: null, raw: { rank: 2 } },
  ]);
  writeJson(path.join(project, "evaluations.json"), {
    scenario: { score: 0.81, verdict: "pass" },
    render: { score: 0.74, verdict: "review" },
  });
  writeJson(path.join(project, "stage-state.json"), {
    scenario: "approved",
    assets: "approved",
    render: "approved",
    delivery: "partial",
  });
  writeJson(path.join(project, "migration-crash-points.json"), {
    points: [
      "before-object-clone",
      "after-object-clone",
      "before-ledger-transition",
      "after-ledger-transition",
      "before-freeze",
      "after-freeze",
      "before-source-rename",
      "after-source-rename",
      "before-install-rename",
      "after-install-rename",
    ],
  });
  write(path.join(project, "unknown", "mystery.bin"), Buffer.from([0, 255, 1]));
  write(path.join(project, ".DS_Store"), "fixture-system-file");
  fs.mkdirSync(path.join(project, "unknown-empty-directory"), { recursive: true });
  write(path.join(project, "unknown-empty-file"), "");
}

function buildConflictingProductionAndDelivery(project: string): void {
  for (const [relative, body] of [
    ["composition/production-source.html", "<html>production source</html>\n"],
    ["composition/production-source.v2.html", "<html>production source v2</html>\n"],
    ["render/production-master.mp4", "production-master"],
    ["render/production-master.v2.mp4", "production-master-v2"],
    ["composition/offer.v2.html", "<html>offer dot v2</html>\n"],
    ["composition/offer-v2.html", "<html>offer dash v2</html>\n"],
    ["composition/offer.r2.html", "<html>offer r2</html>\n"],
    ["composition/offer-final.html", "<html>offer final</html>\n"],
    ["composition/offer-final2.html", "<html>offer final2</html>\n"],
    ["composition/offer.v3.html", ""],
  ] as const) {
    write(path.join(project, relative), body);
  }
  writeJson(path.join(project, "production.json"), {
    productions: [{
      id: "production-conflict",
      compositionId: "offer",
      sourceRevision: "composition/production-source.html",
      output: "render/production-master.mp4",
      profile: "master",
      selected: true,
      completedAt: "2026-07-01T10:00:00.000Z",
    }],
  });
  writeJsonl(path.join(project, "production", "records.jsonl"), [{
    id: "production-conflict",
    compositionId: "offer",
    sourceRevision: "composition/production-source.v2.html",
    output: "render/production-master.v2.mp4",
    profile: "master",
    selected: false,
    completedAt: "2026-07-01T10:00:00.000Z",
  }]);
  writeJson(path.join(project, "delivery.json"), {
    attempts: [{
      id: "delivery-conflict",
      unitId: "campaign",
      presentation: "instagram",
      provider: "postiz",
      providerPublicationId: "postiz-flat-101",
      url: "https://social.example/flat-101",
      status: "published",
      publishedAt: "2026-07-02T09:00:00.000Z",
    }],
  });
  writeJsonl(path.join(project, "delivery", "records.jsonl"), [{
    id: "delivery-conflict",
    unitId: "campaign",
    presentation: "instagram",
    provider: "postiz",
    providerPublicationId: "postiz-tree-202",
    url: "https://social.example/tree-202",
    status: "published",
    publishedAt: "2026-07-02T09:00:00.000Z",
  }]);
}

function buildOperationalEvidence(currentRoot: string): void {
  writeJson(path.join(currentRoot, "cache", "assets", "cache.json"), { reproducible: true });
  write(path.join(currentRoot, "tmp", "partial-render.tmp"), "temporary bytes");
  write(path.join(currentRoot, "old-jobs", "queue.json"), '[{"status":"failed"}]\n');
  write(path.join(currentRoot, "old-logs", "worker.log"), "legacy worker log\n");
  writeJson(path.join(currentRoot, "daemon", "state.json"), { pid: 4242, state: "stopped" });
  write(path.join(currentRoot, "daemon", "events.jsonl"), '{"event":"stopped"}\n');
}

function buildUnusualRoots(currentRoot: string): void {
  const directories = [
    ".scratch",
    "scratch",
    "tmp-scripts",
    "farm",
    "web-videos",
    "media-library",
    "_research",
    "_fx-probe",
    "references",
    "research",
    "memory",
  ];
  for (const directory of directories) {
    write(path.join(currentRoot, directory, "evidence.txt"), `${directory} evidence\n`);
  }
  write(path.join(currentRoot, "PROFILE.md"), "# Legacy profile\n");
  write(path.join(currentRoot, "README.txt"), "Legacy root text.\n");
}

function buildFarmRawEvidence(currentRoot: string): void {
  const farm = path.join(currentRoot, "farm");
  const files: Record<string, unknown> = {
    "ingestion/cursor.json": { cursor: "topic-42", seen: ["a", "b"] },
    "ingestion/seen.json": { ids: ["a", "b", "c"] },
    "topics/index.json": { topics: [{ id: "topic-42", weight: 3 }] },
    "selection/weights.json": { history: [{ topic: "topic-42", weight: 3, at: 1 }] },
    "events/lifecycle.json": {
      events: [
        { kind: "upgrade", from: 1, to: 2 },
        { kind: "rollback", from: 2, to: 1 },
        { kind: "selection", project: "registered-project" },
      ],
    },
    "cadence.json": { timezone: "UTC", slots: ["09:00", "17:00"] },
    "notifications.json": { channels: ["email"], enabled: false },
    "workflows/daily.json": {
      nodes: [{ id: "draft", promptFile: "prompts/draft.md" }],
      subgraphs: ["delivery"],
    },
    "workflows/subgraphs/delivery.json": { nodes: ["review", "publish"] },
    "annotations/projects.json": { "registered-project": [{ body: "Project annotation" }] },
    "annotations/runs.json": { "run-1": [{ body: "Run annotation" }] },
    "studio/project-board.json": { choice: "kanban", layout: { columns: 3 } },
    "runs/run-1/canvas.json": { zoom: 1.25, nodes: [{ id: "draft", x: 10, y: 20 }] },
  };
  for (const [relative, value] of Object.entries(files)) {
    writeJson(path.join(farm, relative), value);
  }
  write(path.join(farm, "prompts", "draft.md"), "Draft a concise post.\n");
}

function buildDesktopEvidence(desktopRoot: string): void {
  writeJson(path.join(desktopRoot, "reviews", "registered-project.json"), {
    selectedComposition: "index.branch-a.v2.html",
    rounds: [{ id: "R2", state: "resolved" }, { id: "R3", state: "approved" }],
  });
  write(path.join(desktopRoot, "safeStorage", "credentials.bin"), Buffer.from([1, 2, 3, 4, 5]));
  writeJson(path.join(desktopRoot, "state.json"), {
    recentProjects: ["registered-project"],
    window: { width: 1440, height: 900 },
  });
  write(path.join(desktopRoot, "logs", "desktop.log"), "fixture desktop stopped\n");
  fs.mkdirSync(path.join(desktopRoot, "empty-review-directory"), { recursive: true });
}

function source(id: string, kind: SourceKind, sourcePath: string) {
  const stat = fs.lstatSync(sourcePath, { bigint: true });
  return { id, kind, path: sourcePath, device: stat.dev, inode: stat.ino };
}

function snapshot(root: string): { inventory: Inventory; sha256: Record<string, string> } {
  const inventory = { entries: 0, files: 0, bytes: 0 };
  const sha256: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const entry = path.join(directory, name);
      const stat = fs.lstatSync(entry);
      inventory.entries += 1;
      if (stat.isDirectory()) walk(entry);
      else if (stat.isFile()) {
        inventory.files += 1;
        inventory.bytes += stat.size;
        const relative = path.relative(root, entry).split(path.sep).join("/");
        sha256[relative] = createHash("sha256").update(fs.readFileSync(entry)).digest("hex");
      }
    }
  };
  walk(root);
  return { inventory, sha256 };
}

function writeJson(file: string, value: unknown): void {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(file: string, values: unknown[]): void {
  write(file, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function write(file: string, value: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
