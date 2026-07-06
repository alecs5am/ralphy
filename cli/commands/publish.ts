// `ralphy publish` (#501) — push a formed unit's distribution pack to Postiz
// (self-hosted social scheduler) across youtube/tiktok/instagram/x. The
// standalone agent-facing door; the farm door is the `publish` node executor
// (cli/lib/workflow/executors/publish.ts) — both run through
// cli/lib/publish/publish.ts.
//
// Gated (the trust-ladder floor, #505): refuses unless the project's #427
// readiness scorecard says `ship`, or the user passes an explicit
// `--force "<reason>"` — the bypass is logged to user-prompts.jsonl
// (stage "publish-force"), mirroring --no-ref-consent. The ladder's L1/L2
// auto-pass only matters for UNATTENDED (farm) publishes — a human typing
// this verb IS the approval, so no trust park applies here.

import { Command } from "commander";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { logUserPrompt } from "../lib/gen-log.js";
import { postizAvailable } from "../lib/providers/postiz.js";
import { parseTargets, type PublishTarget } from "../lib/publish/mapping.js";
import {
  checkPublishReadiness,
  publishUnit,
  unitDirFor,
  readUnitManifest,
} from "../lib/publish/publish.js";

/** Parse `--account "youtube=abc,tiktok=def"` into a target → id map. */
function parseAccounts(raw: string | undefined): Partial<Record<PublishTarget, string>> {
  if (!raw) return {};
  const map: Partial<Record<PublishTarget, string>> = {};
  for (const pair of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq <= 0 || eq === pair.length - 1) {
      raiseError("E_VALIDATION_FAILED", {
        target: "account",
        detail: `'${pair}' is not <target>=<integration-id>`,
      });
    }
    map[pair.slice(0, eq).trim() as PublishTarget] = pair.slice(eq + 1).trim();
  }
  return map;
}

export function publishCmd() {
  const cmd = new Command("publish")
    .description(
      "Publish a formed unit to social platforms via Postiz (#501): binds accounts, uploads the unit's media, creates one post per target, and appends the results to the unit's publish provenance. Gated on the readiness scorecard (`ship` verdict) unless --force. Example: ralphy publish spring-2026-001 hero-cut --targets tiktok,youtube --at 2026-07-13T09:00:00Z",
    )
    .argument("<project>", "Project id")
    .argument("<unit-slug>", "Unit slug under <project>/units/")
    .requiredOption("--targets <list>", "Comma-separated targets (youtube | tiktok | instagram | x)")
    .option("--at <iso>", "Schedule datetime (ISO). Omit to post immediately")
    .option("--account <map>", 'Explicit account bindings, e.g. "youtube=<integration-id>,x=<id>"')
    .option(
      "--force <reason>",
      "Bypass the readiness gate with an explicit reason (logged to user-prompts.jsonl)",
    )
    .action(async (project: string, slug: string, opts) => {
      const targets = (() => {
        try {
          return parseTargets(String(opts.targets));
        } catch (e) {
          return raiseError("E_VALIDATION_FAILED", { target: "targets", detail: (e as Error).message });
        }
      })();
      const accounts = parseAccounts(opts.account);

      const unitDir = unitDirFor(project, slug);
      if (!(await readUnitManifest(unitDir))) {
        raiseError("E_NOT_FOUND", { kind: "Unit", id: `${project}/${slug}` });
      }

      // ── readiness gate (L0 trust floor, #505) ──
      const readiness = checkPublishReadiness(project);
      if (!readiness.pass) {
        const reason = typeof opts.force === "string" ? opts.force.trim() : "";
        if (!reason) {
          raiseError("E_PUBLISH_NOT_READY", {
            project,
            slug,
            verdict: readiness.verdict,
            reason: readiness.reason,
          });
        }
        await logUserPrompt(project, {
          stage: "publish-force",
          text: reason,
          note: `unit=${slug} verdict=${readiness.verdict}`,
        });
      }

      if (!postizAvailable()) {
        raiseError("E_ENV_KEY_MISSING", { key: "POSTIZ_API_KEY + POSTIZ_BASE_URL" });
      }

      try {
        const result = await publishUnit({
          projectId: project,
          slug,
          targets,
          accounts,
          scheduleAt: opts.at ? new Date(opts.at).toISOString() : null,
        });
        if (result.allFailed) {
          raiseError("E_PROVIDER_HTTP", {
            provider: "Postiz",
            status: "n/a",
            detail: result.results.map((r) => `${r.target}: ${r.error}`).join("; "),
          });
        }
        const done = result.results.filter((r) => r.status !== "failed").length;
        ok(
          `Published ${done}/${result.results.length} target(s)${result.scheduleAt ? ` for ${result.scheduleAt}` : ""}`,
        );
        out({
          project,
          slug,
          type: result.type,
          scheduleAt: result.scheduleAt,
          results: result.results,
          unitDir: result.unitDir,
          readiness: { verdict: readiness.verdict, bypassed: !readiness.pass },
        });
      } catch (e) {
        raiseError("E_PROVIDER_HTTP", { provider: "Postiz", status: "n/a", detail: (e as Error).message });
      }
    });

  return cmd;
}
