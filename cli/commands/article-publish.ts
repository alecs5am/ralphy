// `ralphy article-publish` (#527) — push an article unit (#526) to the article
// rails: github-pages (git-backed static site, COMMIT-ONLY), devto/hashnode
// (dev-blog APIs), medium (park-for-human export pack — Medium's write API is
// closed to new integrations). The standalone agent-facing door; the farm door
// is the `article-publish` node executor. Both run through
// cli/lib/publish/article.ts.
//
// Gated (the trust-ladder floor, #505): refuses unless the project's #427
// readiness scorecard says `ship`, or the user passes an explicit
// `--force "<reason>"` (logged to user-prompts.jsonl, mirrors --no-ref-consent).

import { Command } from "commander";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { logUserPrompt } from "../lib/gen-log.js";
import { devtoAvailable } from "../lib/providers/devto.js";
import { hashnodeAvailable } from "../lib/providers/hashnode.js";
import {
  publishArticle,
  parseArticleTargets,
  type GithubPagesConfig,
} from "../lib/publish/article.js";
import {
  checkPublishReadiness,
  unitDirFor,
  readUnitManifest,
} from "../lib/publish/publish.js";

export function articlePublishCmd() {
  const cmd = new Command("article-publish")
    .description(
      "Publish an article unit (#526) to article rails (#527): github-pages (git-backed static site, commit-only), devto/hashnode (dev-blog APIs, draft by default), medium (park-for-human export pack). Per-target failure isolates. Canonical URL is enforced when the workspace declares a canonical site. Example: ralphy article-publish ralphy-seo-001 agent-video-earns --targets github-pages,devto --gh-repo ../ralphy-site --gh-content-dir _posts",
    )
    .argument("<project>", "Project id")
    .argument("<unit-slug>", "Article unit slug under <project>/units/")
    .requiredOption("--targets <list>", "Comma-separated targets (github-pages | devto | hashnode | medium)")
    .option("--publish", "Publish live instead of the default draft (devto/hashnode)")
    .option("--gh-repo <dir>", "github-pages: local clone of the site repo")
    .option("--gh-branch <branch>", "github-pages: branch to commit to (default the repo's current branch)")
    .option("--gh-content-dir <dir>", "github-pages: content dir under the repo (e.g. _posts, content/posts)")
    .option("--hashnode-publication <id>", "hashnode: the publication (blog) id to post to")
    .option("--dry-run", "github-pages: print the file(s) it would commit without committing")
    .option(
      "--force <reason>",
      "Bypass the readiness gate with an explicit reason (logged to user-prompts.jsonl)",
    )
    .action(async (project: string, slug: string, opts) => {
      const targets = (() => {
        try {
          return parseArticleTargets(String(opts.targets));
        } catch (e) {
          return raiseError("E_VALIDATION_FAILED", { target: "targets", detail: (e as Error).message });
        }
      })();

      const unitDir = unitDirFor(project, slug);
      const manifest = await readUnitManifest(unitDir);
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "Unit", id: `${project}/${slug}` });
      if (manifest!.format !== "article") {
        raiseError("E_VALIDATION_FAILED", { target: "unit", detail: `unit '${slug}' is not an article unit (format=${manifest!.format})` });
      }

      // github-pages config from flags.
      let githubPages: GithubPagesConfig | undefined;
      if (targets.includes("github-pages")) {
        if (!opts.ghRepo || !opts.ghContentDir) {
          raiseError("E_VALIDATION_FAILED", {
            target: "github-pages",
            detail: "--gh-repo and --gh-content-dir are required for the github-pages target",
          });
        }
        githubPages = { repoDir: opts.ghRepo, branch: opts.ghBranch, contentDir: opts.ghContentDir };
      }
      if (targets.includes("hashnode") && !opts.hashnodePublication) {
        raiseError("E_VALIDATION_FAILED", { target: "hashnode", detail: "--hashnode-publication <id> is required for the hashnode target" });
      }

      // Env-key preflight for the API targets (skipped on dry-run).
      if (!opts.dryRun) {
        if (targets.includes("devto") && !devtoAvailable()) raiseError("E_ENV_KEY_MISSING", { key: "DEVTO_API_KEY" });
        if (targets.includes("hashnode") && !hashnodeAvailable()) raiseError("E_ENV_KEY_MISSING", { key: "HASHNODE_TOKEN" });
      }

      // ── readiness gate (L0 trust floor, #505) — skipped on dry-run ──
      const readiness = checkPublishReadiness(project);
      if (!opts.dryRun && !readiness.pass) {
        const reason = typeof opts.force === "string" ? opts.force.trim() : "";
        if (!reason) {
          raiseError("E_PUBLISH_NOT_READY", { project, slug, verdict: readiness.verdict, reason: readiness.reason });
        }
        await logUserPrompt(project, {
          stage: "publish-force",
          text: reason,
          note: `article-unit=${slug} verdict=${readiness.verdict}`,
        });
      }

      try {
        const result = await publishArticle({
          projectId: project,
          slug,
          targets,
          githubPages,
          hashnodePublicationId: opts.hashnodePublication,
          draft: !opts.publish,
          dryRun: Boolean(opts.dryRun),
        });
        if (result.allFailed) {
          raiseError("E_PROVIDER_HTTP", {
            provider: "article-publish",
            status: "n/a",
            detail: result.results.map((r) => `${r.target}: ${r.error}`).join("; "),
          });
        }
        const done = result.results.filter((r) => r.status !== "failed").length;
        ok(`${opts.dryRun ? "Dry-run: " : ""}Published ${done}/${result.results.length} target(s)`);
        out({
          project,
          slug,
          canonicalUrl: result.canonicalUrl,
          results: result.results,
          unitDir: result.unitDir,
          dryRun: Boolean(opts.dryRun),
          readiness: { verdict: readiness.verdict, bypassed: !opts.dryRun && !readiness.pass },
        });
      } catch (e) {
        raiseError("E_PROVIDER_HTTP", { provider: "article-publish", status: "n/a", detail: (e as Error).message });
      }
    });

  return cmd;
}
