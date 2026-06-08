// Served at /llms.txt — the llmstxt.org convention: a concise, link-rich
// Markdown index that AI search engines and assistants (ChatGPT, Perplexity,
// Claude, Gemini) read to understand and cite the site. This is the core GEO
// (Generative Engine Optimization) surface: structured, factual, link-dense,
// and generated from the same live data the pages render from so it never
// drifts. Crawlers are already allowed in robots.ts; this gives them a map.

import { getFormats, getUnits } from "@/lib/library-v2/source";
import { listPosts } from "@/lib/blog";
import { SITE_DESCRIPTION, SITE_URL, siteUrl } from "@/lib/site";
import { site } from "@/lib/data";

export const dynamic = "force-static";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Ralphy?",
    a: "Ralphy is a free, open-source (MIT) command-line tool that turns your coding agent into a one-prompt content marketer. It generates UGC-style videos and images — TikToks, Reels, YouTube Shorts, carousels, posters, ad packs — from a brief, using an agent plus HyperFrames for composition, OpenRouter media models for image/video, and ElevenLabs for voice and music.",
  },
  {
    q: "Is Ralphy free?",
    a: "Yes. Ralphy is open-source under the MIT license. You bring your own OpenRouter and ElevenLabs API keys for the paid model calls; the CLI itself is free.",
  },
  {
    q: "How do I install Ralphy?",
    a: `Run: ${site.install}`,
  },
  {
    q: "What can I make with it?",
    a: "Short-form video (TikTok / Reels / Shorts), multi-slide carousels, still posters and key art, Facebook/Meta ad packs, sticker packs, and long-form faceless explainers from audio. Every finished piece is a reusable Unit you can remix.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. You operate Ralphy through a coding agent in plain language; the agent runs the CLI for you. Developers can also script it directly.",
  },
  {
    q: "What is the Library?",
    a: "A public feed of finished Units — every Unit shows the ingredients that built it (a template, a style, recipes, assets) so you can swap any single block to remix it.",
  },
];

export async function GET() {
  const [units, posts, formats] = await Promise.all([
    getUnits(),
    listPosts(),
    getFormats(),
  ]);

  const fmtLabel = (id: string) =>
    formats.find((f) => f.id === id)?.label ?? id;

  const lines: string[] = [];
  lines.push("# Ralphy");
  lines.push("");
  lines.push(`> ${SITE_DESCRIPTION}`);
  lines.push("");
  lines.push(
    "Ralphy is a free, open-source (MIT) content-factory CLI. It drives a coding agent to produce UGC-style short-form video and images (TikTok, Reels, YouTube Shorts, carousels, posters, ad packs) end to end: agent + HyperFrames composition + OpenRouter media models + ElevenLabs voice/music. Every finished piece is a reusable Unit = one Template (structure) + one Style (look) + N Recipes (effects) + M Assets (character/location/prop/music).",
  );
  lines.push("");

  lines.push("## Start here");
  lines.push(`- [Home](${siteUrl("ralphy")}): what Ralphy is and how it works.`);
  lines.push(
    `- [Library](${siteUrl("library")}): a feed of finished Units; open any to see — and swap — the blocks that built it.`,
  );
  lines.push(`- [Skills](${siteUrl("skills")}): craft and workflow skills, taggable from chat.`);
  lines.push(`- [Blog](${siteUrl("blog")}): articles, model picks, and design notes.`);
  lines.push(`- [Docs](${site.docs}): CLI reference, model registry, template authoring.`);
  lines.push(`- [GitHub](${site.repo}): source, issues, releases.`);
  lines.push("");

  lines.push("## Install");
  lines.push("```");
  lines.push(site.install);
  lines.push("```");
  lines.push("");

  lines.push("## FAQ");
  for (const { q, a } of FAQ) {
    lines.push(`### ${q}`);
    lines.push(a);
    lines.push("");
  }

  lines.push("## Library units");
  for (const u of units.slice(0, 80)) {
    const blurb = (u.blurb ?? "").replace(/\s+/g, " ").trim();
    lines.push(
      `- [${u.title}](${siteUrl(`library/u/${u.id}`)}) (${fmtLabel(u.format)}): ${blurb}`,
    );
  }
  lines.push("");

  if (posts.length) {
    lines.push("## Blog posts");
    for (const p of posts) {
      const t = p.frontmatter.title ?? p.slug;
      const d = (p.frontmatter.description ?? "").replace(/\s+/g, " ").trim();
      lines.push(`- [${t}](${siteUrl(`blog/${p.slug}`)}): ${d}`);
    }
    lines.push("");
  }

  lines.push("## More");
  lines.push(`- Canonical site: ${SITE_URL}`);
  lines.push(`- Sitemap: ${siteUrl("sitemap.xml")}`);
  lines.push(`- Blog RSS: ${siteUrl("blog/feed.xml")}`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
