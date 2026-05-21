// landing/app/blog/[slug]/page.tsx
//
// Slug-addressable blog. MDX files live in landing/content/blog/<slug>.mdx
// — drop a file there and the article is reachable at /blog/<slug>. No
// index page; this is intentionally link-only for the first iteration.
// Missing slug → Next's notFound() (404 page).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { mdxComponents } from "@/components/mdx";
import { getDisplayStars } from "@/lib/data";

type PageProps = { params: Promise<{ slug: string }> };

type Frontmatter = {
  title?: string;
  description?: string;
  date?: string;
  author?: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

// Slugs are file basenames. Refuse anything that would let us escape
// the content dir or read non-MDX files.
function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

async function readPost(slug: string): Promise<{
  source: string;
  frontmatter: Frontmatter;
} | null> {
  if (!isSafeSlug(slug)) return null;
  const file = path.join(CONTENT_DIR, `${slug}.mdx`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  return parseFrontmatter(raw);
}

// Minimal YAML-frontmatter parser. We only support flat key: "value"
// pairs because that's all blog posts need; reaching for `gray-matter`
// would pull js-yaml and a transitive tree we don't need.
function parseFrontmatter(raw: string): {
  source: string;
  frontmatter: Frontmatter;
} {
  if (!raw.startsWith("---\n")) {
    return { source: raw, frontmatter: {} };
  }
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { source: raw, frontmatter: {} };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const fm: Frontmatter = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*"?([^"]*)"?\s*$/);
    if (!m) continue;
    (fm as Record<string, string>)[m[1]!] = m[2]!.trim();
  }
  return { source: body, frontmatter: fm };
}

export async function generateStaticParams() {
  let entries: string[];
  try {
    entries = await fs.readdir(CONTENT_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => ({ slug: f.replace(/\.mdx$/, "") }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) return { title: "Not found · Ralphy" };
  return {
    title: `${post.frontmatter.title ?? slug} · Ralphy`,
    description: post.frontmatter.description,
  };
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) notFound();

  const stars = await getDisplayStars();
  const date = formatDate(post.frontmatter.date);

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <article className="blog-article">
          <div className="container">
            <header className="blog-header">
              <p className="blog-eyebrow">Blog</p>
              {date && (
                <p className="blog-meta">
                  {date}
                  {post.frontmatter.author && ` · ${post.frontmatter.author}`}
                </p>
              )}
            </header>

            <div className="blog-body">
              <MDXRemote
                source={post.source}
                components={mdxComponents}
                options={{
                  // next-mdx-remote v6 defaults `blockJS: true` which strips
                  // every JSX attribute expression — e.g. items={[…]} becomes
                  // undefined. Our MDX is checked into the repo, not user
                  // input, so the JS-injection threat model doesn't apply.
                  // Keep dangerous-JS guard on (blocks eval / Function ctor /
                  // require, etc.) but allow normal expressions through.
                  blockJS: false,
                  blockDangerousJS: true,
                  mdxOptions: {
                    // GFM gives us markdown tables, strikethrough, autolinks,
                    // and task lists — all standard for technical writing.
                    remarkPlugins: [remarkGfm],
                    // Server-side syntax highlighting via highlight.js. We
                    // ship one tinted theme in globals.css under .hljs-*; no
                    // runtime cost, no client bundle.
                    rehypePlugins: [
                      [
                        rehypeHighlight,
                        { detect: true, ignoreMissing: true },
                      ],
                    ],
                  },
                }}
              />
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
