// `ralphy upload` — queue a video for an owned account and post it from that
// account's own browser profile (#600).
//
// `upload run` posts only uploads the owner approved (`--approve` on add, or
// `upload approve`). A step the recipe cannot finish leaves the upload in
// `needs_user` with a screenshot; finish it with `ralphy account open` and
// record the post with `upload done <id> --url`.

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { getArtifactRevision } from "../lib/store/artifacts.js";
import { ingestObject } from "../lib/store/objects.js";
import {
  approveUploads,
  cancelUpload,
  claimNextUpload,
  completeUploadManually,
  enqueueUpload,
  getUpload,
  listOwnedAccounts,
  listUploads,
  resolveOwnedAccount,
  retryUpload,
  type UploadDto,
  type UploadState,
} from "../lib/store/uploads.js";
import { runClaimedUpload, syncAccount } from "../lib/uploads/run.js";
import { accountOf, workspaceOf } from "./account.js";

const STATES: UploadState[] = ["queued", "uploading", "unknown", "needs_user", "published", "failed", "cancelled"];
const VIDEO_MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4" };

function uploadOf(command: Command, id: string, verb: string): UploadDto {
  const workspaceId = workspaceOf(command, verb);
  try {
    return getUpload(id, workspaceId);
  } catch {
    raiseError("E_NOT_FOUND", { kind: "Upload", id });
  }
}

function guard<T>(verb: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    raiseError("E_INPUT_INVALID", { field: verb, detail: String((error as Error).message), verb: `upload ${verb}` });
  }
}

function captionOf(opts: any): string {
  if (opts.caption !== undefined && opts.captionFile !== undefined) {
    raiseError("E_INPUT_INVALID", { field: "--caption", detail: "pass --caption or --caption-file, not both", verb: "upload add" });
  }
  if (opts.captionFile !== undefined) {
    const file = path.resolve(opts.captionFile);
    if (!fs.existsSync(file)) raiseError("E_NOT_FOUND", { kind: "File", id: opts.captionFile });
    return fs.readFileSync(file, "utf8").trim();
  }
  return String(opts.caption ?? "").trim();
}

function timeOf(value: unknown): number | null {
  if (value === undefined) return null;
  const at = Date.parse(String(value));
  if (!Number.isFinite(at)) raiseError("E_INPUT_INVALID", { field: "--at", detail: `not an ISO date-time: ${value}`, verb: "upload add" });
  return at;
}

export function uploadCmd() {
  const cmd = new Command("upload").description(
    "Queue videos for owned accounts and post them from each account's own browser profile",
  );

  cmd
    .command("add [file]")
    .description("Queue one video for one account (a file, or --artifact <revision>)")
    .requiredOption("--account <ref>", "acct_… id or @handle")
    .option("--platform <platform>", "Disambiguate a handle used on several platforms")
    .option("--artifact <revision>", "Use a stored Artifact Revision (arev_…) instead of a file")
    .option("--caption <text>", "Caption, hashtags included")
    .option("--caption-file <path>", "Read the caption from a file")
    .option("--approve", "Record the owner's go now, so upload run posts it")
    .option("--at <iso>", "Do not post before this time")
    .action(async function (this: Command, file: string | undefined, opts: any) {
      const workspaceId = workspaceOf(this, "upload add");
      const account = accountOf(this, opts.account, "upload add", opts.platform);
      const caption = captionOf(opts);
      if (caption.length > 5000) raiseError("E_INPUT_INVALID", { field: "--caption", detail: "longer than 5000 characters", verb: "upload add" });
      let mediaObjectId: string;
      let artifactRevisionId: string | null = null;
      if (opts.artifact) {
        if (file) raiseError("E_INPUT_INVALID", { field: "--artifact", detail: "pass a file or --artifact, not both", verb: "upload add" });
        const revision = guard("add", () => getArtifactRevision({ context: { workspaceId }, revisionId: opts.artifact }));
        mediaObjectId = revision.objectId;
        artifactRevisionId = revision.id;
      } else {
        if (!file) raiseError("E_FLAG_MISSING", { flag: "file or --artifact", verb: "upload add" });
        const source = path.resolve(file);
        if (!fs.existsSync(source)) raiseError("E_NOT_FOUND", { kind: "File", id: file });
        const mime = VIDEO_MIME[path.extname(source).toLowerCase()];
        if (!mime) raiseError("E_INPUT_INVALID", { field: "file", detail: `expected ${Object.keys(VIDEO_MIME).join(", ")}`, verb: "upload add" });
        const object = await ingestObject({
          scope: { workspaceId },
          sourcePath: source,
          originalName: path.basename(source),
          mime,
          storageClass: "durable",
          metadata: { upload: true },
          transfer: "copy",
        });
        mediaObjectId = object.id;
      }
      const upload = enqueueUpload({
        workspaceId,
        accountId: account.id,
        mediaObjectId,
        caption,
        artifactRevisionId,
        approve: opts.approve === true,
        notBefore: timeOf(opts.at),
      });
      out({
        kind: "upload",
        upload,
        next: upload.approvedAt ? "ralphy upload run" : `ralphy upload approve ${upload.id}`,
        ...(account.sessionState === "ok" ? {} : { warning: `@${account.handle} is ${account.sessionState}; run ralphy account login ${account.id} first` }),
      });
    });

  cmd
    .command("list")
    .description("List uploads, newest first, with the latest views")
    .option("--state <states>", `Comma-separated: ${STATES.join(", ")}`)
    .option("--account <ref>", "Only this account")
    .option("--niche <slug>", "Only accounts in this niche")
    .option("--limit <n>", "Maximum rows", "100")
    .action(function (this: Command, opts: any) {
      const workspaceId = workspaceOf(this, "upload list");
      const states = opts.state ? String(opts.state).split(",").map((s: string) => s.trim()) : undefined;
      for (const state of states ?? []) {
        if (!STATES.includes(state as UploadState)) raiseError("E_FLAG_UNKNOWN", { flag: "state", value: state, allowed: STATES.join(", "), verb: "upload list" });
      }
      const accountId = opts.account ? accountOf(this, opts.account, "upload list").id : undefined;
      const uploads = listUploads({
        workspaceId,
        ...(accountId ? { accountId } : {}),
        ...(states ? { states: states as UploadState[] } : {}),
        ...(opts.niche ? { niche: String(opts.niche) } : {}),
        limit: Number(opts.limit) || 100,
      });
      out({ kind: "upload-list", count: uploads.length, uploads });
    });

  cmd
    .command("show <id>")
    .description("Show one upload")
    .action(function (this: Command, id: string) {
      out({ kind: "upload", upload: uploadOf(this, id, "upload show") });
    });

  cmd
    .command("approve [ids...]")
    .description("Record the owner's go for queued uploads (or --all-queued)")
    .option("--all-queued", "Approve every queued, unapproved upload in the Workspace")
    .action(function (this: Command, ids: string[], opts: any) {
      const workspaceId = workspaceOf(this, "upload approve");
      const targets = opts.allQueued
        ? listUploads({ workspaceId, states: ["queued"], limit: 1000 }).filter((upload) => !upload.approvedAt).map((upload) => upload.id)
        : ids.map((id) => uploadOf(this, id, "upload approve").id);
      if (targets.length === 0 && !opts.allQueued) raiseError("E_FLAG_MISSING", { flag: "ids or --all-queued", verb: "upload approve" });
      const approved = guard("approve", () => approveUploads(targets));
      out({ kind: "upload-approve", count: approved.length, uploads: approved.map((upload) => upload.id) });
    });

  cmd
    .command("cancel <id>")
    .description("Cancel a queued, handed-off, failed or unknown upload")
    .action(function (this: Command, id: string) {
      const upload = uploadOf(this, id, "upload cancel");
      out({ kind: "upload", upload: guard("cancel", () => cancelUpload(upload.id)) });
    });

  cmd
    .command("retry <id>")
    .description("Put a handed-off or failed upload back in the queue (keeps its approval)")
    .option("--force", "Requeue an unknown or abandoned upload only after its worker stopped and the profile shows no such post")
    .action(function (this: Command, id: string, opts: any) {
      const upload = uploadOf(this, id, "upload retry");
      out({ kind: "upload", upload: guard("retry", () => retryUpload(upload.id, { force: opts.force === true })) });
    });

  cmd
    .command("done <id>")
    .description("Record an upload finished by hand in the account's browser")
    .requiredOption("--url <post-url>", "The published post's https URL")
    .action(function (this: Command, id: string, opts: any) {
      const upload = uploadOf(this, id, "upload done");
      out({ kind: "upload", upload: guard("done", () => completeUploadManually(upload.id, String(opts.url))) });
    });

  cmd
    .command("run [id]")
    .description("Post approved, due uploads one at a time, each from its account's own browser profile")
    .option("--limit <n>", "Stop after N uploads", "10")
    .action(async function (this: Command, id: string | undefined, opts: any) {
      const workspaceId = workspaceOf(this, "upload run");
      const limit = id ? 1 : Math.max(1, Number(opts.limit) || 10);
      const results: UploadDto[] = [];
      while (results.length < limit) {
        const claimed = claimNextUpload({ workspaceId, ...(id ? { id } : {}) });
        if (!claimed) break;
        const account = resolveOwnedAccount({ workspaceId, ref: claimed.accountId });
        results.push(await runClaimedUpload(claimed, account));
      }
      if (id && results.length === 0) {
        const upload = uploadOf(this, id, "upload run");
        raiseError("E_INPUT_INVALID", {
          field: "id",
          detail: `upload is ${upload.state}${upload.approvedAt ? "" : ", not approved"}; it runs when queued, approved, due and its account is signed in and not paused`,
          verb: "upload run",
        });
      }
      out({
        kind: "upload-run",
        count: results.length,
        published: results.filter((upload) => upload.state === "published").length,
        needsUser: results.filter((upload) => upload.state === "needs_user").length,
        unknown: results.filter((upload) => upload.state === "unknown").length,
        failed: results.filter((upload) => upload.state === "failed").length,
        uploads: results,
      });
    });

  cmd
    .command("sync")
    .description("Read views for published uploads and followers, per account (one account or --all)")
    .option("--account <ref>", "One account")
    .option("--all", "Every browser account with published uploads")
    .action(async function (this: Command, opts: any) {
      const workspaceId = workspaceOf(this, "upload sync");
      if (!opts.account && !opts.all) raiseError("E_FLAG_MISSING", { flag: "--account or --all", verb: "upload sync" });
      const accounts = opts.account
        ? [accountOf(this, opts.account, "upload sync")]
        : listOwnedAccounts({ workspaceId }).filter((account) => account.connection === "browser" && account.published > 0);
      const results = [];
      for (const account of accounts) {
        try {
          results.push({ account: account.id, handle: account.handle, platform: account.platform, ...(await syncAccount(account)) });
        } catch (error) {
          results.push({ account: account.id, handle: account.handle, platform: account.platform, error: String((error as Error).message) });
        }
      }
      out({ kind: "upload-sync", count: results.length, results });
    });

  return cmd;
}
