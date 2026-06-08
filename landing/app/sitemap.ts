// Dynamic sitemap — Next App Router serves this at /sitemap.xml. Crawlers
// (Google, Bing) read it to discover every indexable URL, with priority +
// changeFrequency hints. We enumerate the static surfaces plus every
// data-driven detail page (library units, library blocks, blog posts, skill
// pages) from the same loaders the pages render from, so the map never drifts
// from what actually ships.
//
// All reads go through the open-source static catalog by default, so this
// resolves at build time with no Supabase / network dependency.

import type { MetadataRoute } from "next";
import { getBlocks, getUnits } from "@/lib/library-v2/source";
import { listPosts } from "@/lib/blog";
import { listSkillSlugs } from "@/lib/skills-loader";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [units, blocks, posts] = await Promise.all([
    getUnits(),
    getBlocks(),
    listPosts(),
  ]);
  const skillSlugs = listSkillSlugs();

  // Top-level surfaces. The home page is /ralphy (/ permanently redirects to
  // it), so /ralphy is the canonical entry and carries the highest priority.
  // /library is the flagship discovery surface — second-highest.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: siteUrl("ralphy"), changeFrequency: "weekly", priority: 1.0 },
    { url: siteUrl("library"), changeFrequency: "daily", priority: 0.9 },
    { url: siteUrl("skills"), changeFrequency: "weekly", priority: 0.7 },
    { url: siteUrl("blog"), changeFrequency: "weekly", priority: 0.6 },
  ];

  const unitEntries: MetadataRoute.Sitemap = units.map((u) => ({
    url: siteUrl(`library/u/${u.id}`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blockEntries: MetadataRoute.Sitemap = blocks.map((b) => ({
    url: siteUrl(`library/b/${b.kind}/${b.id}`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const postEntries: MetadataRoute.Sitemap = posts.map((p) => {
    const date = p.frontmatter.date;
    return {
      url: siteUrl(`blog/${p.slug}`),
      lastModified: date ? new Date(date) : undefined,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    };
  });

  const skillEntries: MetadataRoute.Sitemap = skillSlugs.map((slug) => ({
    url: siteUrl(`skills/${slug}`),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...unitEntries,
    ...blockEntries,
    ...postEntries,
    ...skillEntries,
  ];
}
