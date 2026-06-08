// Served at /blog/feed.xml — RSS 2.0 for the blog. Enables legitimate content
// syndication: Medium (and similar) can IMPORT a post from a feed URL, which
// republishes it with a rel=canonical back to the original — so the SEO credit
// stays on this site and there is no duplicate-content penalty. Also serves
// feed readers and any "follow" integration.

import { listPosts } from "@/lib/blog";
import { SITE_NAME, siteUrl } from "@/lib/site";

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await listPosts();

  const items = posts
    .map((p) => {
      const url = siteUrl(`blog/${p.slug}`);
      const title = p.frontmatter.title ?? p.slug;
      const desc = p.frontmatter.description ?? "";
      const date = p.frontmatter.date;
      const pubDate = date ? new Date(date).toUTCString() : undefined;
      const category = p.frontmatter.category;
      return [
        "    <item>",
        `      <title>${esc(title)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : "",
        category ? `      <category>${esc(category)}</category>` : "",
        `      <description>${esc(desc)}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)} · Blog</title>
    <link>${esc(siteUrl("blog"))}</link>
    <description>Articles, comparisons, and design notes from the Ralphy team.</description>
    <language>en-us</language>
    <atom:link href="${esc(siteUrl("blog/feed.xml"))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
