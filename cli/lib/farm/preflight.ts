// Farm deployment-liveness preflight (#530) — the `ralphy farm doctor` engine.
//
// DISTINCT from `workflow simulate` (#516): simulate answers COST + missing
// generation keys; THIS answers "is the deployment LIVE and AUTHORIZED to run
// unattended overnight?". It composes the existing seams rather than
// re-deriving anything: #516 simulate's environment.missingKeys + coverageGaps
// (bundle/coverage), #534 quotaHeatmapReport (quota), trust.ts (trust),
// calendar/store nextFreeSlot (calendar), notifications config (notifier),
// Postiz integrations (publish-targets), doctor's bin() (host).
//
// Auth pings are cheap + READ-ONLY: no paid generation, no test post, no test
// notification. A target that cannot be verified without a WRITE returns `warn`
// with the manual-verify step, NEVER a false `ok`.
//
// Exported cleanly so the #492/#506 app API can call farmDoctor() later — this
// issue does NOT build a dashboard route (the app API is not built yet).

import { spawn } from "node:child_process";
import { CAPABILITIES, hasCapability } from "../capabilities.js";
import { workspaceDir } from "../paths.js";
import { readTrustConfig } from "../trust.js";
import { readCalendar, nextFreeSlot } from "../calendar/store.js";
import { readNotificationsConfig } from "../notifications.js";
import { channelsForEvent, NOTIFY_EVENTS } from "../schemas/notifications.js";
import { quotaHeatmapReport } from "../publish/quota.js";
import { postizAvailable, postizIntegrations } from "../providers/postiz.js";
import { loadGraphWorkflows } from "./runner.js";
import { deriveBundleRequirements } from "../bundle.js";
import { coverageFor } from "../providers/coverage.js";
import type { WorkflowGraph, WorkflowNode } from "../schemas/workflow.js";

export type CheckStatus = "ok" | "warn" | "fail";
export type CheckGroup =
  | "providers"
  | "publish-targets"
  | "bundle/coverage"
  | "budget"
  | "calendar"
  | "trust"
  | "notifier"
  | "quota"
  | "host";

export interface Check {
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  detail: string;
  fix: string;
}

export type FarmVerdict = "green" | "amber" | "red";

export interface FarmDoctorReport {
  workspace: string;
  verdict: FarmVerdict;
  checks: Check[];
}

export interface FarmDoctorOptions {
  /** Clock seam for deterministic tests (quota staleness). */
  now?: Date;
  /** Injected Postiz fetch (tests run with zero network). */
  postizFetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

const check = (
  id: string,
  group: CheckGroup,
  status: CheckStatus,
  detail: string,
  fix: string,
): Check => ({ id, group, status, detail, fix });

/** any fail → red; else any warn → amber; else green. */
export function aggregateVerdict(checks: Check[]): FarmVerdict {
  if (checks.some((c) => c.status === "fail")) return "red";
  if (checks.some((c) => c.status === "warn")) return "amber";
  return "green";
}

/** Cheap binary presence probe (mirrors doctor.ts's bin()). */
async function bin(name: string, flag = "--version"): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(name, [flag], { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/** Publish target platforms a graph posts to (mirrors simulate's derivation). */
function graphPublishTargets(graph: WorkflowGraph): Set<string> {
  const out = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type === "x-post") out.add("x");
    else if (node.type === "youtube-upload") out.add("youtube");
    else if (node.type === "publish") {
      const raw = (node.params as { targets?: unknown }).targets;
      if (Array.isArray(raw)) raw.forEach((t) => out.add(String(t)));
      else if (typeof raw === "string") raw.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => out.add(t));
    }
  }
  return out;
}

/** Article platforms (#527 connectors not built yet). */
const ARTICLE_PLATFORMS = new Set(["devto", "hashnode"]);

/** A budget cap = a budget-guard node with a cap, or a node with budget.max_usd. */
function hasBudgetCap(graphs: WorkflowGraph[]): boolean {
  return graphs.some((g) =>
    g.nodes.some(
      (n: WorkflowNode) =>
        (n.type === "budget-guard" && typeof (n.params as { max_usd?: unknown }).max_usd === "number") ||
        typeof n.budget?.max_usd === "number",
    ),
  );
}

// ── Group builders ─────────────────────────────────────────────────────────

/** providers — required generation connector keys (read-only key-present). */
function providerChecks(): Check[] {
  return CAPABILITIES.map((cap) => {
    const present = hasCapability(cap.id);
    if (present) {
      // ponytail: key-present is the only read-only signal; validity ping is a
      // paid/rate-limited call we deliberately skip (issue: "not required").
      return check(
        `provider-${cap.envVar}`,
        "providers",
        "ok",
        `${cap.envVar} present (${cap.label}) — key present, not pinged`,
        "",
      );
    }
    return check(
      `provider-${cap.envVar}`,
      "providers",
      cap.required ? "fail" : "warn",
      `${cap.envVar} missing — ${cap.label} required for generation`,
      `export ${cap.envVar} (${cap.signupUrl}) or run \`ralphy setup\``,
    );
  });
}

/** publish-targets — Postiz connected accounts per target platform + #527 note. */
async function publishTargetChecks(
  targets: Set<string>,
  postizFetch?: FarmDoctorOptions["postizFetch"],
): Promise<Check[]> {
  const checks: Check[] = [];
  const socialTargets = [...targets].filter((t) => !ARTICLE_PLATFORMS.has(t));
  const articleTargets = [...targets].filter((t) => ARTICLE_PLATFORMS.has(t));

  if (socialTargets.length > 0) {
    if (!postizAvailable()) {
      checks.push(
        check(
          "publish-postiz-config",
          "publish-targets",
          "fail",
          `graph publishes to [${socialTargets.join(", ")}] but Postiz is not configured (POSTIZ_API_KEY / POSTIZ_BASE_URL unset)`,
          "export POSTIZ_API_KEY and POSTIZ_BASE_URL pointing at your self-hosted Postiz instance",
        ),
      );
    } else {
      // Read-only GET /integrations — the connected social accounts.
      let integrations: Array<{ identifier?: string; disabled?: boolean }> = [];
      let reachErr: string | null = null;
      try {
        integrations = await postizIntegrations(postizFetch ?? undefined);
      } catch (e) {
        reachErr = (e as Error).message;
      }
      if (reachErr) {
        checks.push(
          check(
            "publish-postiz-reach",
            "publish-targets",
            "warn",
            `Postiz configured but GET /integrations failed (${reachErr}) — cannot verify connected accounts without a live instance`,
            "verify POSTIZ_BASE_URL is reachable and the API key is valid",
          ),
        );
      } else {
        const connected = new Set(
          integrations.filter((i) => i.disabled !== true).map((i) => String(i.identifier ?? "").toLowerCase()),
        );
        for (const platform of socialTargets) {
          const ok = connected.has(platform.toLowerCase());
          checks.push(
            check(
              `publish-target-${platform}`,
              "publish-targets",
              ok ? "ok" : "fail",
              ok
                ? `Postiz has a connected ${platform} account`
                : `no connected Postiz account for "${platform}" — the overnight publish will fail`,
              ok ? "" : `connect a ${platform} account in your Postiz instance`,
            ),
          );
        }
      }
    }
  }

  // #527 dev.to / Hashnode article connectors are NOT built yet.
  if (articleTargets.length > 0) {
    checks.push(
      check(
        "publish-article-connectors",
        "publish-targets",
        "warn",
        `graph publishes to article platform(s) [${articleTargets.join(", ")}] — article publish connectors not yet available (#527) — skipped`,
        "track #527; verify article publishing manually until the connectors land",
      ),
    );
  }
  // NOTE: GitHub-Pages repo-writable check is skipped — no such config exists yet.
  return checks;
}

/** bundle/coverage — workflows present + parse; #497 coverage satisfied. */
function bundleChecks(graphs: WorkflowGraph[]): Check[] {
  const checks: Check[] = [];
  if (graphs.length === 0) {
    checks.push(
      check(
        "bundle-workflows",
        "bundle/coverage",
        "fail",
        "no lint-clean node-graph workflow in the workspace — the farm has nothing to run",
        "author a workflow under workflows/ and verify with `ralphy workflow lint <ws>`",
      ),
    );
    return checks;
  }
  // loadGraphWorkflows already dropped any workflow that failed to parse /
  // expand — a present graph is a parse-clean graph.
  checks.push(
    check(
      "bundle-workflows",
      "bundle/coverage",
      "ok",
      `${graphs.length} lint-clean graph workflow(s): ${graphs.map((g) => g.name).join(", ")}`,
      "",
    ),
  );

  const requirements = deriveBundleRequirements(graphs);
  const gaps = requirements.requiredCoverage.filter(
    (t) => coverageFor(t.model, t.capability, t.provider) === undefined,
  );
  if (gaps.length > 0) {
    for (const g of gaps) {
      checks.push(
        check(
          `coverage-${g.model}-${g.capability}`,
          "bundle/coverage",
          "fail",
          `coverage matrix has no entry for (${g.model}, ${g.capability}, ${g.provider}) — installed providers cannot serve this node`,
          `check \`ralphy provider matrix --model ${g.model}\` or update cli/lib/providers/coverage.ts`,
        ),
      );
    }
  } else {
    checks.push(
      check(
        "coverage-satisfied",
        "bundle/coverage",
        "ok",
        `#497 coverage satisfied — all ${requirements.requiredCoverage.length} required (model, capability) pair(s) are served`,
        "",
      ),
    );
  }
  return checks;
}

/** budget — at least one budget cap configured for the unattended run (#481). */
function budgetChecks(graphs: WorkflowGraph[]): Check[] {
  if (hasBudgetCap(graphs)) {
    return [check("budget-cap", "budget", "ok", "a budget cap is configured (budget-guard node or node budget.max_usd)", "")];
  }
  return [
    check(
      "budget-cap",
      "budget",
      "warn",
      "no budget cap configured — an unattended run has no spend ceiling",
      "add a budget-guard node (params.max_usd) or a per-node budget.max_usd to the workflow",
    ),
  ];
}

/** calendar — a nextFreeSlot probe resolves ≥1 slot. */
function calendarChecks(ws: string): Check[] {
  const dir = workspaceDir(ws);
  const slots = readCalendar(dir).slots.length;
  if (slots === 0) {
    return [
      check(
        "calendar-slots",
        "calendar",
        "warn",
        "no calendar slots configured — scheduled publishing has no slot to resolve",
        "add slots with `ralphy calendar add-slot` (#504)",
      ),
    ];
  }
  const resolution = nextFreeSlot(dir);
  const ok = resolution.free;
  return [
    check(
      "calendar-slots",
      "calendar",
      ok ? "ok" : "warn",
      ok
        ? `${slots} slot(s); next free slot resolves at ${resolution.at}`
        : `${slots} slot(s) but no free slot resolves within the horizon (${resolution.reason})`,
      ok ? "" : "free the filled slots, widen the horizon, or add more slots",
    ),
  ];
}

/** trust — level explicitly set (#505); default L0 is ok but parks everything. */
function trustChecks(ws: string): Check[] {
  const cfg = readTrustConfig(ws);
  // L0 is the floor + the default. It is a valid, safe setting — everything
  // parks for approval — so it is `ok`, just noted.
  const isFloor = cfg.level === "L0";
  return [
    check(
      "trust-level",
      "trust",
      "ok",
      isFloor
        ? "trust level L0 (the floor) — every publish parks for human approval; nothing auto-publishes unattended"
        : `trust level ${cfg.level} — gate-clearing units may auto-publish (see \`ralphy workspace trust ${ws}\`)`,
      "",
    ),
  ];
}

/** notifier — a #518 channel configured for at least one event. */
function notifierChecks(ws: string): Check[] {
  const cfg = readNotificationsConfig(ws);
  const anyChannel = cfg.enabled && NOTIFY_EVENTS.some((e) => channelsForEvent(cfg, e).length > 0);
  if (anyChannel) {
    return [check("notifier", "notifier", "ok", "a notifier channel is configured — overnight failures reach you", "")];
  }
  return [
    check(
      "notifier",
      "notifier",
      "warn",
      "no notifier configured — an overnight failure will be silent",
      "configure a webhook or telegram channel in workspace.json `notifications` (#518)",
    ),
  ];
}

/** quota — per-platform headroom / staleness from the #534 heatmap. */
function quotaChecks(ws: string, now: Date): Check[] {
  const rows = quotaHeatmapReport(ws, now);
  const exhausted = rows.filter((r) => r.remaining <= 0);
  const stale = rows.filter((r) => r.stale);
  const checks: Check[] = [];
  if (exhausted.length > 0) {
    checks.push(
      check(
        "quota-exhausted",
        "quota",
        "warn",
        `platform(s) already at their publish cap this window: ${exhausted.map((r) => r.platform).join(", ")}`,
        "wait for the window to reset or raise the cap via workspace.json `quotaOverrides`",
      ),
    );
  }
  if (stale.length > 0) {
    checks.push(
      check(
        "quota-stale",
        "quota",
        "warn",
        `stale quota entry (past its freshness horizon) for: ${stale.map((r) => r.platform).join(", ")} — caps may have drifted (#538)`,
        "re-confirm the platform caps and update cli/lib/publish/quota.ts `verifiedOn`",
      ),
    );
  }
  if (checks.length === 0) {
    checks.push(check("quota-headroom", "quota", "ok", "all declared platforms have publish headroom and fresh caps", ""));
  }
  return checks;
}

/** host — bun + ffmpeg present. */
async function hostChecks(): Promise<Check[]> {
  const [bun, ffmpeg] = await Promise.all([bin("bun"), bin("ffmpeg", "-version")]);
  return [
    check(
      "host-bun",
      "host",
      bun ? "ok" : "fail",
      bun ? "bun is installed" : "bun is not installed",
      bun ? "" : "`brew install bun`",
    ),
    check(
      "host-ffmpeg",
      "host",
      ffmpeg ? "ok" : "fail",
      ffmpeg ? "ffmpeg is installed" : "ffmpeg is not installed",
      ffmpeg ? "" : "`brew install ffmpeg`",
    ),
  ];
  // ponytail: disk-headroom check skipped — statfs is awkward cross-platform
  // and a full-disk farm host is a rare, loudly-failing condition. Add a
  // `df`/statvfs probe here if it becomes a real failure class.
}

/**
 * Run the full deployment-liveness preflight for a workspace. Pure-ish: the
 * only side effect is the read-only Postiz GET /integrations (skipped when
 * Postiz is unconfigured or no social target is published to). Exported for
 * the #492/#506 app API to reuse.
 */
export async function farmDoctor(ws: string, opts: FarmDoctorOptions = {}): Promise<FarmDoctorReport> {
  const now = opts.now ?? new Date();
  const graphs = loadGraphWorkflows(ws).map((g) => g.graph);
  const targets = new Set<string>();
  for (const g of graphs) for (const t of graphPublishTargets(g)) targets.add(t);

  const checks: Check[] = [
    ...providerChecks(),
    ...(await publishTargetChecks(targets, opts.postizFetch)),
    ...bundleChecks(graphs),
    ...budgetChecks(graphs),
    ...calendarChecks(ws),
    ...trustChecks(ws),
    ...notifierChecks(ws),
    ...quotaChecks(ws, now),
    ...(await hostChecks()),
  ];

  return { workspace: ws, verdict: aggregateVerdict(checks), checks };
}
