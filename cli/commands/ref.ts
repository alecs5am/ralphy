import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";
import { scoreTikTok } from "../lib/score.js";
import { root } from "../lib/paths.js";

export function refCmd() {
  const cmd = new Command("ref").description("Manage references (websites, social media)");

  cmd
    .command("add <url>")
    .description("Add a reference URL")
    .requiredOption("--type <type>", "Reference type: design | social | media")
    .option("--brand <id>", "Attach to brand")
    .option("--name <name>", "Custom name/ID")
    .action(async (url: string, opts: any) => {
      // Derive ID from URL or name
      let id = opts.name ? slugify(opts.name) : slugify(new URL(url).hostname.replace("www.", ""));
      // Avoid collision by appending random if exists
      const existing = await getEntity("refs", id);
      if (existing) id = `${id}-${generateId().slice(-4)}`;

      const data: Record<string, unknown> = {
        url,
        type: opts.type,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      if (opts.brand) data.brand = opts.brand;

      const ref = await addEntity("refs", id, data);
      ok(`Reference added: ${id}`);
      out(ref);
    });

  cmd
    .command("list")
    .description("List all references")
    .option("--type <type>", "Filter by type")
    .option("--brand <id>", "Filter by brand")
    .action(async (opts: any) => {
      let refs = await listEntities("refs");
      if (opts.type) refs = refs.filter((r: any) => r.type === opts.type);
      if (opts.brand) refs = refs.filter((r: any) => r.brand === opts.brand);
      out(
        refs.map((r: any) => ({
          id: r.id,
          url: r.url,
          type: r.type,
          status: r.status || "—",
          brand: r.brand || "—",
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show reference details")
    .action(async (id: string) => {
      const ref = await getEntity("refs", id);
      if (!ref) err(`Reference not found: ${id}`);
      out(ref);
    });

  cmd
    .command("attach <refId>")
    .description("Attach reference to a project")
    .requiredOption("--to <projectId>", "Target project ID")
    .action(async (refId: string, opts: any) => {
      const ref = await getEntity("refs", refId);
      if (!ref) err(`Reference not found: ${refId}`);
      const project = await getEntity("projects", opts.to);
      if (!project) err(`Project not found: ${opts.to}`);

      const refs = project.refs || [];
      if (!refs.includes(refId)) refs.push(refId);
      await updateEntity("projects", opts.to, { refs });
      ok(`Reference ${refId} attached to project ${opts.to}`);
      out({ refId, projectId: opts.to });
    });

  cmd
    .command("scrape-trends")
    .description("Scrape TikTok hashtag pages via Playwright (Apify-compatible JSON shape) and rank with scoreTikTok()")
    .requiredOption("--hashtags <list>", "Comma-separated hashtags (without #)")
    .option("--limit <n>", "Max videos per hashtag", (v) => parseInt(v, 10), 10)
    .option("--out <path>", "Output JSON path")
    .action(async (opts: any) => {
      const date = new Date().toISOString().slice(0, 10);
      const outPath = path.resolve(
        opts.out ??
          path.join(root(), "workspace", "references", `trends-${date}`, "results.json")
      );
      const scriptPath = path.resolve(
        root(),
        ".agents/skills/ralph-researcher/scripts/scrape-tiktok-trends.ts"
      );

      // Run the script as a child process so the CLI command stays thin.
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          "bunx",
          ["tsx", scriptPath, "--hashtags", opts.hashtags, "--limit", String(opts.limit), "--out", outPath],
          { stdio: "inherit" }
        );
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`scraper exit ${code}`))));
      });

      const raw = await fs.readFile(outPath, "utf-8");
      const videos = JSON.parse(raw) as Array<{
        playCount?: number; diggCount?: number; commentCount?: number; shareCount?: number;
        webVideoUrl?: string; text?: string;
      }>;
      const ranked = videos
        .map((v) => ({
          url: v.webVideoUrl,
          text: (v.text || "").slice(0, 80),
          score: scoreTikTok({
            playCount: v.playCount ?? 0,
            diggCount: v.diggCount ?? 0,
            commentCount: v.commentCount ?? 0,
            shareCount: v.shareCount ?? 0,
          }),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      ok(`Scraped ${videos.length} videos → ${outPath}`);
      out({
        out: outPath,
        count: videos.length,
        ranked: ranked.slice(0, 20),
      });
    });

  cmd
    .command("delete <id>")
    .description("Delete a reference")
    .action(async (id: string) => {
      const ok_ = await deleteEntity("refs", id);
      if (!ok_) err(`Reference not found: ${id}`);
      ok(`Reference deleted: ${id}`);
      out({ deleted: id });
    });

  return cmd;
}
