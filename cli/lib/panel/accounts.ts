import { ralphDir } from "../paths.js";
import { openDomainDb } from "../store/db.js";
import { getWorkspaceByReference } from "../store/scopes.js";
import {
  listOwnedAccounts,
  listUploads,
  type OwnedAccountSummaryDto,
  type UploadDto,
  type UploadState,
} from "../store/uploads.js";

/** One owned account as the panel shows it: the store summary plus a profile link and the Workspace slug. */
export type PanelAccount = OwnedAccountSummaryDto & {
  nextCommand: string;
  profileUrl: string | null;
  workspace: string | null;
};

/** One upload as the panel shows it. `multiplier` is views over the account's median views. */
export type PanelUpload = {
  nextCommand: string;
  workspaceId: string;
  id: string;
  accountId: string;
  handle: string;
  platform: string;
  niche: string | null;
  workspace: string | null;
  state: UploadState;
  approved: boolean;
  caption: string;
  failureStage: string | null;
  error: string | null;
  postUrl: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  notBefore: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  metricsAsOf: number | null;
  multiplier: number | null;
};

export type PanelUploadSections = {
  needsYou: PanelUpload[];
  queued: { approved: PanelUpload[]; waiting: PanelUpload[] };
  uploading: PanelUpload[];
  published: PanelUpload[];
  failed: PanelUpload[];
};

export type PanelAccounts = {
  setupCommands: { workspaces: string; add: string; import: string; upload: string };
  publishedTotal: number;
  serverTime: number;
  accounts: PanelAccount[];
  uploads: PanelUploadSections;
};

const UPLOAD_LIMIT = 200;

/** Where the profile lives on each platform; null for a platform the panel has no URL scheme for. */
export function profileUrl(platform: string, handle: string): string | null {
  const name = encodeURIComponent(handle.replace(/^@/, ""));
  if (!name) return null;
  if (platform === "instagram") return `https://www.instagram.com/${name}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${name}`;
  if (platform === "youtube") return `https://www.youtube.com/@${name}`;
  if (platform === "x") return `https://x.com/${name}`;
  return null;
}

/** Views as a multiple of the account's median; null until both exist and the median is above zero. */
export function viewsMultiplier(views: number | null | undefined, medianViews: number | null | undefined): number | null {
  if (views == null || medianViews == null || medianViews <= 0) return null;
  return Math.round((views / medianViews) * 100) / 100;
}

type CommandScope = { dataRoot: string; command?: string[] };
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
function scopedCommand(scope: CommandScope, workspaceId: string, args: string[]): string {
  return [...(scope.command ?? ["ralphy"]), "--root", scope.dataRoot, "--workspace", workspaceId, ...args].map(quote).join(" ");
}

function toPanelUpload(upload: UploadDto, medians: Map<string, number | null>, workspaces: Map<string, string>, scope: CommandScope, connection?: string): PanelUpload {
  const views = upload.metrics?.views ?? null;
  return {
    workspaceId: upload.workspaceId,
    nextCommand: scopedCommand(scope, upload.workspaceId, upload.state === "queued" && !upload.approvedAt
      ? ["upload", "approve", upload.id]
      : upload.state === "queued" ? ["upload", "run", upload.id]
      : upload.state === "failed" ? ["upload", "retry", upload.id] : ["upload", "show", upload.id])
      + (["unknown", "needs_user"].includes(upload.state)
        ? connection === "browser" ? "\n" + scopedCommand(scope, upload.workspaceId, ["account", "open", upload.accountId])
        : "\nCheck the post on the platform" + (connection === "device" ? " using the connected device" : "")
          + ", then replace POST_URL with its confirmed URL:\n" + scopedCommand(scope, upload.workspaceId, ["upload", "done", upload.id, "--url", "POST_URL"])
        : ""),
    id: upload.id,
    accountId: upload.accountId,
    handle: upload.handle,
    platform: upload.platform,
    niche: upload.niche,
    workspace: workspaces.get(upload.workspaceId) ?? null,
    state: upload.state,
    approved: upload.approvedAt != null,
    caption: upload.caption,
    failureStage: upload.failureStage,
    error: upload.error,
    postUrl: upload.postUrl,
    publishedAt: upload.publishedAt,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
    notBefore: upload.notBefore,
    views,
    likes: upload.metrics?.likes ?? null,
    comments: upload.metrics?.comments ?? null,
    metricsAsOf: upload.metrics?.asOf ?? null,
    multiplier: viewsMultiplier(views, medians.get(upload.accountId)),
  };
}

/**
 * Pure shaping of the store rows. `workspaces` maps a Workspace id to its slug.
 * Cancelled uploads are dropped: they are history nobody acts on.
 */
export function shapeAccounts(
  accounts: OwnedAccountSummaryDto[],
  uploads: UploadDto[],
  workspaces: Map<string, string>,
  now = Date.now(),
  scope: CommandScope = { dataRoot: ralphDir() },
): PanelAccounts {
  const medians = new Map(accounts.map((account) => [account.id, account.medianViews]));
  const connections = new Map(accounts.map((account) => [account.id, account.connection]));
  const sections: PanelUploadSections = { needsYou: [], queued: { approved: [], waiting: [] }, uploading: [], published: [], failed: [] };
  for (const upload of uploads) {
    const row = toPanelUpload(upload, medians, workspaces, scope, connections.get(upload.accountId));
    if (row.state === "needs_user" || row.state === "unknown") sections.needsYou.push(row);
    else if (row.state === "queued") (row.approved ? sections.queued.approved : sections.queued.waiting).push(row);
    else if (row.state === "uploading") sections.uploading.push(row);
    else if (row.state === "published") sections.published.push(row);
    else if (row.state === "failed") sections.failed.push(row);
  }
  const newest = (a: PanelUpload, b: PanelUpload) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt);
  sections.published.sort(newest);
  sections.needsYou.sort(newest);
  sections.failed.sort(newest);
  // The next upload to go out first.
  sections.queued.approved.sort((a, b) => a.createdAt - b.createdAt);
  sections.queued.waiting.sort((a, b) => a.createdAt - b.createdAt);
  return {
    setupCommands: {
      workspaces: [...(scope.command ?? ["ralphy"]), "--root", scope.dataRoot, "workspace", "list"].map(quote).join(" "),
      add: scopedCommand(scope, "WORKSPACE_ID", ["account", "add", "instagram", "YOUR_HANDLE", "--niche", "psychology"]),
      import: scopedCommand(scope, "WORKSPACE_ID", ["account", "import", "accounts.csv"]),
      upload: scopedCommand(scope, "WORKSPACE_ID", ["upload", "add", "VIDEO_FILE", "--account", "ACCOUNT_ID"]),
    },
    publishedTotal: sections.published.length,
    serverTime: now,
    accounts: accounts.map((account) => ({
      ...account,
      nextCommand: scopedCommand(scope, account.workspaceId, account.paused ? ["account", "resume", account.id]
        : account.connection !== "browser" ? ["account", "show", account.id]
        : account.sessionState !== "ok" ? ["account", "login", account.id]
        : ["account", "check", account.id]),
      profileUrl: profileUrl(account.platform, account.handle),
      workspace: workspaces.get(account.workspaceId) ?? null,
    })),
    uploads: sections,
  };
}

/** Every owned account and the newest uploads across the whole library. */
export function accountsSnapshot(now = Date.now(), scope: CommandScope = { dataRoot: ralphDir() }): PanelAccounts {
  const accounts = listOwnedAccounts();
  const uploads = [
    ...listUploads({ states: ["queued", "uploading", "needs_user", "unknown", "failed"], limit: null }),
    ...listUploads({ states: ["published"], limit: UPLOAD_LIMIT }),
  ];
  const workspaces = new Map<string, string>();
  for (const id of new Set([...accounts.map((a) => a.workspaceId), ...uploads.map((u) => u.workspaceId)])) {
    const workspace = getWorkspaceByReference(id);
    if (workspace) workspaces.set(id, workspace.slug);
  }
  const snapshot = shapeAccounts(accounts, uploads, workspaces, now, scope);
  snapshot.publishedTotal = openDomainDb().query<{ n: number }, []>("SELECT count(*) AS n FROM uploads WHERE state = 'published'").get()!.n;
  return snapshot;
}
