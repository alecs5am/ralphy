// Article publish orchestrator (#527) — the article rails, shared by the
// `ralphy article-publish` verb and the `article-publish` node executor.
// Mirrors publishUnit (cli/lib/publish/publish.ts) but for article targets:
// commits to a git-backed static site (github-pages), pushes to the dev-blog
// APIs (devto/hashnode), and parks a ready-to-paste export pack for medium.
//
// Per-target semantics (same contract as publishUnit): a failed target is a
// `status: "failed"` row in `results` (and in the unit's `publish` provenance)
// — it never aborts the remaining targets. `allFailed` is the callers' escalate
// signal. The exactly-once ledger (#531) dedups a resumed publish so a re-run
// does not double-commit / double-post.
//
// GEO hygiene (#527 acceptance): when the workspace declares a `canonicalSite`,
// the API targets (devto/hashnode) MUST carry a canonical_url — one canonical
// home, syndicated copies point at it. A configured site with an empty unit
// canonicalUrl and no derivable slug is a per-target failure, not a silent
// no-canonical push.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectDir, projectWorkspace, workspaceManifestPath } from "../paths.js";
import { TerminalProviderError } from "../providers/shared.js";
import { devtoPublish, type FetchLike as DevtoFetch } from "../providers/devto.js";
import { hashnodePublish, type FetchLike as HashnodeFetch } from "../providers/hashnode.js";
import {
  unitDirFor,
  readUnitManifest,
  appendPublishRecords,
} from "./publish.js";
import { publishIdempotencyKey, findLedgerEntry, appendPublishLedger } from "./ledger.js";
import type { UnitArticleMeta } from "../schemas/unit.js";

export const ARTICLE_TARGETS = ["github-pages", "devto", "hashnode", "medium"] as const;
export type ArticleTarget = (typeof ARTICLE_TARGETS)[number];

export function isArticleTarget(t: string): t is ArticleTarget {
  return (ARTICLE_TARGETS as readonly string[]).includes(t);
}

/** Parse a comma-separated targets list; throws on an unknown target. */
export function parseArticleTargets(raw: string): ArticleTarget[] {
  const list = raw.split(",").map((t) => t.trim()).filter(Boolean);
  for (const t of list) {
    if (!isArticleTarget(t)) {
      throw new Error(`'${t}' is not an article target (${ARTICLE_TARGETS.join(" | ")})`);
    }
  }
  return [...new Set(list)] as ArticleTarget[];
}

// ─── workspace canonical-site config (GEO) ────────────────────────────────────

/**
 * The workspace's canonical site base URL (`canonicalSite` key on
 * workspace.json), or null. When set, API targets MUST carry a canonical_url.
 * Tolerant read — a missing/malformed manifest is "no canonical site".
 */
export function workspaceCanonicalSite(ws: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8")) as { canonicalSite?: unknown };
    return typeof raw.canonicalSite === "string" && raw.canonicalSite.trim() ? raw.canonicalSite.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

/**
 * The canonical URL for this article: an explicit `article.canonicalUrl` wins;
 * else derived from the workspace canonical site + the article slug when a site
 * is configured; else "" (no canonical). `<site>/<slug>` is the derivation.
 */
export function resolveCanonicalUrl(article: UnitArticleMeta, canonicalSite: string | null): string {
  if (article.canonicalUrl.trim()) return article.canonicalUrl.trim();
  if (canonicalSite) return `${canonicalSite}/${article.slug}`;
  return "";
}

// ─── github-pages (git-backed static site) ────────────────────────────────────

export interface GithubPagesConfig {
  /** Absolute path to a local clone of the site repo (the git credential chain owns auth). */
  repoDir: string;
  /** Branch to commit to (default the repo's current branch). */
  branch?: string;
  /** Content dir under the repo (Jekyll `_posts`, Hugo `content/posts`, Astro `src/content/blog`). */
  contentDir: string;
  /** Filename for the body under contentDir (default `<slug>.md`). */
  filename?: string;
}

/** The frontmatter block written atop the body for a static-site generator. */
export function renderFrontmatter(article: UnitArticleMeta, canonicalUrl: string): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(article.title)}`,
    `description: ${JSON.stringify(article.description)}`,
    `slug: ${JSON.stringify(article.slug)}`,
    `tags: [${article.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
  ];
  if (canonicalUrl) lines.push(`canonical_url: ${JSON.stringify(canonicalUrl)}`);
  lines.push("---", "");
  return lines.join("\n");
}

/**
 * Child env with the ambient git repo-location vars stripped. Git exports
 * GIT_DIR / GIT_INDEX_FILE (etc.) to every hook, and those OVERRIDE `cwd` for
 * repo discovery — so a `ralphy article-publish` invoked from inside a git hook
 * or a CI wrapper would commit into the WRONG repository. Passing an explicit
 * `cwd` is not enough; the vars have to go.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG",
  ]) {
    delete env[k];
  }
  return env;
}

/** Run git in `repoDir`, throwing a TerminalProviderError on non-zero exit. */
function git(repoDir: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd: repoDir, encoding: "utf8", env: gitEnv() });
  if (r.status !== 0) {
    throw new TerminalProviderError(`git ${args[0]} failed: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  }
  return (r.stdout ?? "").trim();
}

export interface GithubPagesCommit {
  files: string[];
  commit: string | null;
  branch: string;
}

/**
 * Commit the article (body + frontmatter + hero) into the site repo.
 * COMMIT-ONLY: `git add` + `git commit`, NEVER force-push, NEVER delete — the
 * push is left to the operator's standard `git push` (or CI). `dryRun` returns
 * the file paths it WOULD write without touching the repo.
 */
export async function commitToGithubPages(
  cfg: GithubPagesConfig,
  unitDir: string,
  article: UnitArticleMeta,
  canonicalUrl: string,
  opts: { dryRun?: boolean } = {},
): Promise<GithubPagesCommit> {
  if (!fs.existsSync(path.join(cfg.repoDir, ".git"))) {
    throw new TerminalProviderError(`github-pages: ${cfg.repoDir} is not a git repo (expected .git/)`);
  }
  const branch = cfg.branch ?? git(cfg.repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const contentAbs = path.join(cfg.repoDir, cfg.contentDir);
  const bodyName = cfg.filename ?? `${article.slug}.md`;
  const bodyRel = path.join(cfg.contentDir, bodyName);

  // Assemble the on-disk write list: the body (frontmatter + markdown) and the
  // hero image when present. COPY-not-move — the unit's artifacts stay put.
  const body = renderFrontmatter(article, canonicalUrl) + (await fsp.readFile(path.join(unitDir, article.body), "utf8"));
  const writes: Array<{ rel: string; from?: string; content?: string }> = [{ rel: bodyRel, content: body }];
  if (article.hero) writes.push({ rel: path.join(cfg.contentDir, article.hero), from: path.join(unitDir, article.hero) });

  const files = writes.map((w) => w.rel);
  if (opts.dryRun) return { files, commit: null, branch };

  await fsp.mkdir(contentAbs, { recursive: true });
  for (const w of writes) {
    const dest = path.join(cfg.repoDir, w.rel);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    if (w.content !== undefined) await fsp.writeFile(dest, w.content, "utf8");
    else await fsp.copyFile(w.from!, dest);
  }
  git(cfg.repoDir, ["add", "--", ...files]);
  // Commit only the added files; --no-verify is deliberately NOT set (hooks run).
  git(cfg.repoDir, ["commit", "-m", `Add article: ${article.title}`, "--", ...files]);
  const commit = git(cfg.repoDir, ["rev-parse", "HEAD"]);
  return { files, commit, branch };
}

// ─── medium export pack (no API — park for human) ─────────────────────────────

/**
 * Medium status (VERIFIED 2026-07-09): Medium issues NO new integration tokens
 * and allows no new integrations — the write API is CLOSED to new users. There
 * is NO sanctioned API path, so `medium` is a `park-for-human` EXPORT PACK: the
 * formatted body + assets + ready-to-paste steps land in the approval inbox for
 * a human to import by hand. It doubles as the generic "publish anywhere by
 * hand" path.
 */
export interface MediumExportPack {
  dir: string;
  files: string[];
}

/**
 * Write the medium export pack under `inboxDir/<slug>/`: the body markdown
 * (canonical URL noted so the human sets it in Medium's import), the hero
 * image, and a STEPS.md with the paste-in instructions. A NEW dir — append-only.
 */
export async function writeMediumExportPack(
  inboxDir: string,
  unitDir: string,
  article: UnitArticleMeta,
  canonicalUrl: string,
): Promise<MediumExportPack> {
  const dir = path.join(inboxDir, article.slug);
  await fsp.mkdir(dir, { recursive: true });
  const files: string[] = [];

  const bodyName = `${article.slug}.md`;
  await fsp.copyFile(path.join(unitDir, article.body), path.join(dir, bodyName));
  files.push(bodyName);
  if (article.hero) {
    await fsp.copyFile(path.join(unitDir, article.hero), path.join(dir, article.hero));
    files.push(article.hero);
  }

  const steps = [
    `# Medium import: ${article.title}`,
    "",
    "Medium's write API is closed to new integrations (verified 2026-07-09), so this is a manual import.",
    "",
    "1. Go to medium.com → your profile → Stories → Import a story, or New story → paste the body below.",
    `2. Body markdown: \`${bodyName}\` (in this folder).`,
    article.hero ? `3. Hero image: \`${article.hero}\` — add it as the story's feature image.` : "3. No hero image.",
    canonicalUrl
      ? `4. Set the canonical link to ${canonicalUrl} (Story settings → Advanced settings → "Set a canonical link"). This keeps SEO credit on your canonical site.`
      : "4. No canonical site configured — set a canonical link only if this content lives elsewhere first.",
    `5. Tags: ${article.tags.join(", ") || "(none)"}.`,
    `6. Description / subtitle: ${article.description}`,
    "",
  ].join("\n");
  await fsp.writeFile(path.join(dir, "STEPS.md"), steps, "utf8");
  files.push("STEPS.md");

  return { dir, files };
}

// ─── the article-publish run ──────────────────────────────────────────────────

export interface ArticleTargetResult {
  target: ArticleTarget;
  status: "published" | "failed" | "idempotent-skip";
  /** Published URL (github-pages: null until the site builds; medium: the export dir). */
  url: string | null;
  /** Provider/commit id (devto/hashnode post id, github-pages commit sha, or null). */
  id: string | null;
  error?: string;
}

export interface ArticlePublishOptions {
  projectId: string;
  slug: string;
  targets: ArticleTarget[];
  /** github-pages target config (required only when github-pages is a target). */
  githubPages?: GithubPagesConfig;
  /** Hashnode publicationId (required only when hashnode is a target). */
  hashnodePublicationId?: string;
  /** dir the medium export pack lands in (default: the project's approval inbox). */
  inboxDir?: string;
  /** L0 trust default: draft ON for API targets. */
  draft?: boolean;
  /** dry-run github-pages (print the files, do not commit). */
  dryRun?: boolean;
  /** Idempotency slot discriminator (#531): calendar entryId or "default". */
  slot?: string | null;
  workspace?: string;
  fetchImpl?: DevtoFetch & HashnodeFetch;
}

export interface ArticlePublishResult {
  project: string;
  slug: string;
  unitDir: string;
  canonicalUrl: string;
  results: ArticleTargetResult[];
  allFailed: boolean;
}

/** Default approval-inbox dir for a project's medium export packs. */
export function articleInboxDir(projectId: string): string {
  return path.join(projectDir(projectId), "publish-inbox");
}

/**
 * Publish one article unit across the given targets. Per-target isolation:
 * a thrown target becomes a `failed` row and the loop continues. Pre-flight
 * failures (missing unit, wrong format, missing target config) throw before any
 * target fires. API targets enforce the workspace canonical when configured.
 */
export async function publishArticle(opts: ArticlePublishOptions): Promise<ArticlePublishResult> {
  const unitDir = unitDirFor(opts.projectId, opts.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) throw new Error(`unit '${opts.slug}' not found in project '${opts.projectId}'`);
  if (manifest.format !== "article" || !manifest.article) {
    throw new Error(`unit '${opts.slug}' is not an article unit (format=${manifest.format})`);
  }
  if (opts.targets.length === 0) throw new Error("no article targets given");

  const article = manifest.article;
  const workspace = opts.workspace ?? projectWorkspace(opts.projectId);
  const canonicalSite = workspaceCanonicalSite(workspace);
  const canonicalUrl = resolveCanonicalUrl(article, canonicalSite);
  const draft = opts.draft ?? true;
  const slot = opts.slot ?? undefined;
  const fetchImpl = opts.fetchImpl ?? (fetch as DevtoFetch & HashnodeFetch);
  const inboxDir = opts.inboxDir ?? articleInboxDir(opts.projectId);

  const results: ArticleTargetResult[] = [];
  for (const target of opts.targets) {
    // Exactly-once guard (#531): a prior published/scheduled ledger row skips
    // the re-fire. dry-run never consults/writes the ledger (nothing committed).
    const key = publishIdempotencyKey({ workspace, projectId: opts.projectId, slug: opts.slug, target, slot });
    if (!opts.dryRun) {
      const prior = findLedgerEntry(workspace, key, target);
      if (prior) {
        results.push({ target, status: "idempotent-skip", url: null, id: prior.postId });
        continue;
      }
    }

    try {
      // GEO gate: API targets need a canonical when the workspace has a site.
      if ((target === "devto" || target === "hashnode") && canonicalSite && !canonicalUrl) {
        throw new TerminalProviderError(
          `${target}: workspace "${workspace}" declares a canonical site but no canonical_url could be resolved — set article.canonicalUrl or give the article a slug`,
        );
      }

      let res: ArticleTargetResult;
      if (target === "github-pages") {
        if (!opts.githubPages) throw new TerminalProviderError("github-pages: repo/branch/contentDir config required");
        const c = await commitToGithubPages(opts.githubPages, unitDir, article, canonicalUrl, { dryRun: opts.dryRun });
        res = { target, status: "published", url: null, id: c.commit };
      } else if (target === "medium") {
        const pack = await writeMediumExportPack(inboxDir, unitDir, article, canonicalUrl);
        res = { target, status: "published", url: pack.dir, id: null };
      } else if (target === "devto") {
        const body = await fsp.readFile(path.join(unitDir, article.body), "utf8");
        const r = await devtoPublish(
          {
            title: article.title,
            body_markdown: body,
            published: !draft,
            ...(canonicalUrl && { canonical_url: canonicalUrl }),
            tags: article.tags,
            description: article.description,
            ...(article.hero && { main_image: article.hero }),
          },
          fetchImpl,
        );
        res = { target, status: "published", url: r.url ?? null, id: r.id != null ? String(r.id) : null };
      } else {
        // hashnode
        if (!opts.hashnodePublicationId) throw new TerminalProviderError("hashnode: publicationId required (the blog to post to)");
        const body = await fsp.readFile(path.join(unitDir, article.body), "utf8");
        const r = await hashnodePublish(
          {
            title: article.title,
            contentMarkdown: body,
            publicationId: opts.hashnodePublicationId,
            tags: article.tags,
            ...(canonicalUrl && { canonicalUrl }),
          },
          draft,
          fetchImpl,
        );
        res = { target, status: "published", url: r.url ?? null, id: r.id ?? null };
      }

      // Ledger belt (#531) — right after success, before the manifest append.
      // dry-run never records (nothing was committed/posted).
      if (!opts.dryRun) {
        appendPublishLedger(workspace, {
          key,
          project: opts.projectId,
          slug: opts.slug,
          target,
          postId: res.id,
          scheduleAt: null,
          status: "published",
        });
      }
      results.push(res);
    } catch (e) {
      results.push({ target, status: "failed", url: null, id: null, error: (e as Error).message });
    }
  }

  // Append every attempt to the unit's publish provenance (APPEND-only, #14).
  // dry-run writes nothing — it is a preview.
  if (!opts.dryRun) {
    const at = new Date().toISOString();
    await appendPublishRecords(
      unitDir,
      results.map((r) => ({
        target: r.target,
        integrationId: null,
        postId: r.id,
        url: r.url,
        status: r.status,
        scheduleAt: null,
        ...(r.error && { error: r.error }),
        at,
        backend: r.target,
      })),
    );
  }

  return {
    project: opts.projectId,
    slug: opts.slug,
    unitDir,
    canonicalUrl,
    results,
    allFailed: results.every((r) => r.status === "failed"),
  };
}
