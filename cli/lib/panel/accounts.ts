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
  profileUrl: string | null;
  workspace: string | null;
};

/** One upload as the panel shows it. `multiplier` is views over the account's median views. */
export type PanelUpload = {
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

function toPanelUpload(upload: UploadDto, medians: Map<string, number | null>, workspaces: Map<string, string>): PanelUpload {
  const views = upload.metrics?.views ?? null;
  return {
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
): PanelAccounts {
  const medians = new Map(accounts.map((account) => [account.id, account.medianViews]));
  const sections: PanelUploadSections = { needsYou: [], queued: { approved: [], waiting: [] }, uploading: [], published: [], failed: [] };
  for (const upload of uploads) {
    const row = toPanelUpload(upload, medians, workspaces);
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
    serverTime: now,
    accounts: accounts.map((account) => ({
      ...account,
      profileUrl: profileUrl(account.platform, account.handle),
      workspace: workspaces.get(account.workspaceId) ?? null,
    })),
    uploads: sections,
  };
}

/** Every owned account and the newest uploads across the whole library. */
export function accountsSnapshot(now = Date.now()): PanelAccounts {
  const accounts = listOwnedAccounts();
  const uploads = listUploads({ limit: UPLOAD_LIMIT });
  const workspaces = new Map<string, string>();
  for (const id of new Set([...accounts.map((a) => a.workspaceId), ...uploads.map((u) => u.workspaceId)])) {
    const workspace = getWorkspaceByReference(id);
    if (workspace) workspaces.set(id, workspace.slug);
  }
  return shapeAccounts(accounts, uploads, workspaces, now);
}
