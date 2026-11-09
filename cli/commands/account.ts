// `ralphy account` — owned social accounts (#600).
//
// Accounts are `social_accounts` rows in a Workspace that the owner signs into
// in a dedicated browser profile. One account = one profile, so accounts never
// share a session. The owner signs in by hand (`account login`); Ralphy never
// handles a password. Spec: docs/superpowers/specs/2026-11-04-account-uploads-design.md.

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import {
  addOwnedAccount,
  isOwnedPlatform,
  listOwnedAccounts,
  OWNED_PLATFORMS,
  resolveOwnedAccount,
  setAccountPaused,
  type AccountPurpose,
  type OwnedAccountDto,
  type SessionState,
} from "../lib/store/uploads.js";
import { checkAccount, loginAccount, openAccount } from "../lib/uploads/run.js";

const SESSION_STATES: SessionState[] = ["unknown", "ok", "needs_login", "checkpoint", "restricted"];

export function workspaceOf(command: Command, verb: string): string {
  const opts = command.optsWithGlobals();
  if (typeof opts.workspace !== "string" || opts.workspace.trim() === "") raiseError("E_FLAG_MISSING", { flag: "workspace", verb });
  return resolveCommandContext({ dataRoot: ralphDir(), workspaceId: opts.workspace, cwd: process.cwd() }).workspaceId;
}

export function accountOf(command: Command, ref: string, verb: string, platform?: string): OwnedAccountDto {
  const workspaceId = workspaceOf(command, verb);
  try {
    return resolveOwnedAccount({ workspaceId, ref, ...(platform ? { platform } : {}) });
  } catch (error) {
    const message = String((error as Error).message);
    if (message.includes("pass --platform")) raiseError("E_INPUT_INVALID", { field: "--platform", detail: message, verb });
    raiseError("E_NOT_FOUND", { kind: "Account", id: ref });
  }
}

function platformOf(value: unknown, verb: string): (typeof OWNED_PLATFORMS)[number] {
  const platform = String(value ?? "").toLowerCase();
  if (!isOwnedPlatform(platform)) raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: platform, allowed: OWNED_PLATFORMS.join(", "), verb });
  return platform;
}

function purposeOf(value: unknown, verb: string): AccountPurpose | undefined {
  if (value === undefined) return undefined;
  if (value !== "main" && value !== "test") raiseError("E_FLAG_UNKNOWN", { flag: "purpose", value: String(value), allowed: "main, test", verb });
  return value;
}

function nicheOf(value: unknown, verb: string): string | undefined {
  if (value === undefined) return undefined;
  const niche = String(value).trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(niche)) raiseError("E_INPUT_INVALID", { field: "--niche", detail: "use a slug: lowercase letters, digits, dashes", verb });
  return niche;
}

/** `platform,handle,niche,purpose,name` with an optional header row. */
export function parseAccountCsv(text: string): Array<{ platform: string; handle: string; niche?: string; purpose?: string; name?: string }> {
  const rows: Array<{ platform: string; handle: string; niche?: string; purpose?: string; name?: string }> = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [platform = "", handle = "", niche = "", purpose = "", ...name] = trimmed.split(",").map((cell) => cell.trim());
    if (index === 0 && platform.toLowerCase() === "platform") continue;
    rows.push({
      platform: platform.toLowerCase(),
      handle,
      ...(niche ? { niche } : {}),
      ...(purpose ? { purpose } : {}),
      ...(name.length ? { name: name.join(",") } : {}),
    });
  }
  return rows;
}

export function accountCmd() {
  const cmd = new Command("account").description(
    "Owned social accounts: add, sign in once per isolated browser profile, check sessions and audience",
  );

  cmd
    .command("add <platform> <handle>")
    .description(`Add (or update) an owned account. Platforms: ${OWNED_PLATFORMS.join(", ")}`)
    .option("--niche <slug>", "Niche this account tests, e.g. psychology (same slugs as trends niches)")
    .option("--purpose <purpose>", "main | test", undefined)
    .option("--name <display>", "Display name")
    .option("--connection <how>", "browser (default) | device (a phone; uploads finish by hand)", "browser")
    .action(function (this: Command, platformArg: string, handle: string, opts: any) {
      const workspaceId = workspaceOf(this, "account add");
      const connection = opts.connection === "device" ? "device" : "browser";
      const { account, created } = addOwnedAccount({
        workspaceId,
        platform: platformOf(platformArg, "account add"),
        handle,
        displayName: opts.name ?? null,
        niche: nicheOf(opts.niche, "account add") ?? null,
        ...(purposeOf(opts.purpose, "account add") ? { purpose: opts.purpose } : {}),
        connection,
      });
      out({ kind: "account", created, account, next: account.sessionState === "ok" ? null : `ralphy account login ${account.id}` });
    });

  cmd
    .command("import <csv>")
    .description("Add many accounts from a CSV: platform,handle,niche,purpose,name (header optional, idempotent)")
    .action(function (this: Command, file: string) {
      const workspaceId = workspaceOf(this, "account import");
      const source = path.resolve(file);
      if (!fs.existsSync(source)) raiseError("E_NOT_FOUND", { kind: "File", id: file });
      const rows = parseAccountCsv(fs.readFileSync(source, "utf8"));
      let created = 0;
      let updated = 0;
      const errors: Array<{ line: number; handle: string; error: string }> = [];
      for (const [index, row] of rows.entries()) {
        try {
          if (!isOwnedPlatform(row.platform)) throw new Error(`platform must be one of ${OWNED_PLATFORMS.join(", ")}`);
          if (row.purpose && row.purpose !== "main" && row.purpose !== "test") throw new Error("purpose must be main or test");
          const result = addOwnedAccount({
            workspaceId,
            platform: row.platform,
            handle: row.handle,
            displayName: row.name ?? null,
            niche: row.niche ? row.niche.toLowerCase() : null,
            ...(row.purpose ? { purpose: row.purpose as AccountPurpose } : {}),
            connection: "browser",
          });
          if (result.created) created += 1;
          else updated += 1;
        } catch (error) {
          errors.push({ line: index + 1, handle: row.handle, error: String((error as Error).message) });
        }
      }
      out({ kind: "account-import", rows: rows.length, created, updated, errors });
    });

  cmd
    .command("list")
    .description("List owned accounts with upload counts, best and median views, and followers")
    .option("--platform <platform>", "Filter by platform")
    .option("--niche <slug>", "Filter by niche")
    .option("--state <state>", `Filter by session state: ${SESSION_STATES.join(" | ")}`)
    .option("--purpose <purpose>", "main | test")
    .action(function (this: Command, opts: any) {
      const workspaceId = workspaceOf(this, "account list");
      if (opts.state && !SESSION_STATES.includes(opts.state)) raiseError("E_FLAG_UNKNOWN", { flag: "state", value: opts.state, allowed: SESSION_STATES.join(", "), verb: "account list" });
      const accounts = listOwnedAccounts({
        workspaceId,
        ...(opts.platform ? { platform: platformOf(opts.platform, "account list") } : {}),
        ...(opts.niche ? { niche: nicheOf(opts.niche, "account list") } : {}),
        ...(opts.state ? { sessionState: opts.state } : {}),
        ...(opts.purpose ? { purpose: purposeOf(opts.purpose, "account list") } : {}),
      });
      out({ kind: "account-list", count: accounts.length, accounts });
    });

  cmd
    .command("show <ref>")
    .description("Show one account (acct_… id or @handle)")
    .option("--platform <platform>", "Disambiguate a handle used on several platforms")
    .action(function (this: Command, ref: string, opts: any) {
      const account = accountOf(this, ref, "account show", opts.platform);
      const [summary] = listOwnedAccounts({ workspaceId: account.workspaceId, platform: account.platform, includePostiz: true })
        .filter((entry) => entry.id === account.id);
      out({ kind: "account", account: summary ?? account });
    });

  cmd
    .command("login <ref>")
    .description("Open the account's own browser profile so the owner signs in by hand; records the session")
    .option("--platform <platform>", "Disambiguate a handle used on several platforms")
    .option("--timeout <minutes>", "Give up waiting after N minutes", "15")
    .action(async function (this: Command, ref: string, opts: any) {
      const account = accountOf(this, ref, "account login", opts.platform);
      const minutes = Number(opts.timeout);
      const result = await loginAccount(account, { timeoutMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000 });
      out({ kind: "account-login", account: account.id, handle: account.handle, platform: account.platform, ...result });
    });

  cmd
    .command("check [ref]")
    .description("Check sign-in state and read followers for one account or --all")
    .option("--all", "Check every browser account in the Workspace (one at a time)")
    .option("--platform <platform>", "With --all: only this platform; with a handle: disambiguate")
    .option("--headed", "Show the browser window")
    .action(async function (this: Command, ref: string | undefined, opts: any) {
      const workspaceId = workspaceOf(this, "account check");
      if (!ref && !opts.all) raiseError("E_FLAG_MISSING", { flag: "ref or --all", verb: "account check" });
      const accounts = ref
        ? [accountOf(this, ref, "account check", opts.platform)]
        : listOwnedAccounts({ workspaceId, ...(opts.platform ? { platform: platformOf(opts.platform, "account check") } : {}) })
            .filter((account) => account.connection === "browser");
      const results = [];
      for (const account of accounts) {
        try {
          results.push({ account: account.id, handle: account.handle, platform: account.platform, ...(await checkAccount(account, { headless: !opts.headed })) });
        } catch (error) {
          results.push({ account: account.id, handle: account.handle, platform: account.platform, state: "unknown", error: String((error as Error).message) });
        }
      }
      out({ kind: "account-check", count: results.length, results });
    });

  cmd
    .command("open <ref>")
    .description("Open the account's browser profile for the owner or an agent; returns when the window closes")
    .option("--platform <platform>", "Disambiguate a handle used on several platforms")
    .option("--url <url>", "Page to open (default: the account's profile)")
    .action(async function (this: Command, ref: string, opts: any) {
      const account = accountOf(this, ref, "account open", opts.platform);
      await openAccount(account, opts.url);
      out({ kind: "account-open", account: account.id, closed: true });
    });

  for (const [verb, paused] of [["pause", true], ["resume", false]] as const) {
    cmd
      .command(`${verb} <ref>`)
      .description(paused ? "Exclude an account from upload run" : "Include a paused account in upload run again")
      .option("--platform <platform>", "Disambiguate a handle used on several platforms")
      .action(function (this: Command, ref: string, opts: any) {
        const account = accountOf(this, ref, `account ${verb}`, opts.platform);
        out({ kind: "account", account: setAccountPaused(account.id, paused) });
      });
  }

  return cmd;
}
