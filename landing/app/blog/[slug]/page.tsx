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
import {
  type Author,
  formatDate,
  readPost,
  resolveAuthors,
} from "@/lib/blog";
import { loadModelsDoc } from "@/lib/models-loader";
import { siteUrl, SITE_NAME } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";

/**
 * Some blog posts inject content from elsewhere in the repo (MODELS.md,
 * docs, etc.) so the MDX file stays tiny while the body comes from the
 * actual source-of-truth. Marker → loader.
 */
const INJECTIONS: Record<string, () => string> = {
  "{/* MODELS_REGISTRY_INJECT */}": () => loadModelsDoc().source,
};

function expandInjections(source: string): string {
  let out = source;
  for (const [marker, load] of Object.entries(INJECTIONS)) {
    if (out.includes(marker)) {
      out = out.replace(marker, load());
    }
  }
  return out;
}

/* Prose styling for the MDX article body. Reproduces the legacy
 * `.blog-body` look via the @tailwindcss/typography plugin plus tuning
 * modifiers, so headings stay display-font uppercase and inline links
 * keep the mono chip with the vio arrow. The arbitrary descendant
 * variants at the tail re-create the highlight.js token palette (the
 * old `.blog-body .hljs-*` rules) since prose modifiers can't reach
 * those classes. */
const proseClass = [
  "prose prose-invert max-w-none",
  // Base body type (was .blog-body)
  "text-ink-2 text-[clamp(18px,1.6vw,24px)] leading-[1.5]",
  // Headings — display font, uppercase
  "prose-headings:font-display prose-headings:font-bold prose-headings:text-ink prose-headings:uppercase",
  "prose-h1:text-[clamp(40px,4.6vw,56px)] prose-h1:tracking-[-0.018em] prose-h1:leading-[1.06] prose-h1:[text-wrap:balance] prose-h1:mt-3.5 prose-h1:mb-10",
  "prose-h2:text-[clamp(30px,3.4vw,42px)] prose-h2:tracking-[-0.012em] prose-h2:leading-[1.12] prose-h2:mt-[72px] prose-h2:mb-6 max-md:prose-h2:mt-12",
  "prose-h3:text-[clamp(24px,2.5vw,32px)] prose-h3:tracking-[-0.005em] prose-h3:leading-[1.18] prose-h3:mt-12 prose-h3:mb-[18px]",
  "prose-h4:text-[clamp(20px,1.9vw,26px)] prose-h4:tracking-[-0.005em] prose-h4:leading-[1.25] prose-h4:mt-9 prose-h4:mb-3.5",
  // Paragraphs
  "prose-p:text-ink-2 prose-p:my-0 prose-p:mb-7 max-md:prose-p:mb-5",
  // Emphasis / strong / del
  "prose-strong:text-ink prose-strong:font-semibold prose-em:text-ink prose-em:italic",
  // Lists
  "prose-ul:my-0 prose-ul:mb-8 prose-ul:pl-7 prose-ul:text-ink-2",
  "prose-ol:my-0 prose-ol:mb-8 prose-ol:pl-7 prose-ol:text-ink-2",
  "prose-li:my-0 prose-li:mb-3 prose-li:leading-[1.5] marker:text-mute",
  // Blockquote
  "prose-blockquote:my-8 prose-blockquote:py-[18px] prose-blockquote:px-6 prose-blockquote:bg-bg-1 prose-blockquote:rounded-xl prose-blockquote:text-ink-2 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-[0.95em] [&_blockquote_p:first-of-type::before]:content-none [&_blockquote_p:last-of-type::after]:content-none",
  // HR
  "prose-hr:my-12 prose-hr:h-px prose-hr:border-0 prose-hr:bg-line",
  // Native markdown tables (wrapped in .mdx-table-scroll by ScrollTable)
  "prose-table:w-full prose-table:my-0 prose-table:border-collapse prose-table:text-[15px] prose-table:bg-bg-1 prose-table:rounded-[14px] prose-table:overflow-hidden prose-table:min-w-max",
  "prose-thead:bg-bg-2 prose-thead:border-0",
  "prose-th:text-left prose-th:font-mono prose-th:text-xs prose-th:tracking-[0.14em] prose-th:uppercase prose-th:text-mute prose-th:font-medium prose-th:px-[18px] prose-th:py-3.5",
  "prose-td:px-[18px] prose-td:py-3.5 prose-td:text-ink-2 prose-td:shadow-[inset_0_1px_0_var(--color-line)] [&_tr:first-child_td]:shadow-none [&_td_code]:bg-bg-3 [&_th_code]:bg-bg-3",
  "[&_tr]:border-0",
  // Inline code — mono chip on bg-2 (variant 03-A). strip the typography
  // plugin's default backtick pseudo-elements.
  "prose-code:font-mono prose-code:text-[0.88em] prose-code:bg-bg-2 prose-code:text-ink prose-code:px-[7px] prose-code:py-0.5 prose-code:rounded [&_:not(pre)>code]:before:content-none [&_:not(pre)>code]:after:content-none",
  // Bare fenced code blocks — bg-2 plate, no tab (variant B)
  "prose-pre:my-8 prose-pre:bg-bg-2 prose-pre:text-ink prose-pre:rounded-[14px] prose-pre:px-[26px] prose-pre:py-[22px] prose-pre:font-mono prose-pre:text-sm prose-pre:leading-[1.7] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_pre_code]:text-[length:inherit]",
  // Inline links — mono chip with vio arrow (variant 02-D). Scope away
  // from the component-level anchors (mdx-cta, mdx-linklist-row).
  "[&_a:not(.mdx-cta):not(.mdx-linklist-row)]:text-ink [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:bg-bg-2 [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:font-mono [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:text-[0.92em] [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:leading-[1.4] [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:no-underline [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:font-normal [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:whitespace-nowrap [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:rounded [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:px-2 [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:py-px hover:[&_a:not(.mdx-cta):not(.mdx-linklist-row)]:bg-bg-3 [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:before:content-['→'] [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:before:text-vio [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:before:mr-1.5 [&_a:not(.mdx-cta):not(.mdx-linklist-row)]:after:content-none",
  // highlight.js token palette (was .blog-body .hljs-*)
  "[&_.hljs]:text-ink [&_.hljs]:bg-transparent",
  "[&_.hljs-comment]:text-mute [&_.hljs-comment]:italic [&_.hljs-quote]:text-mute [&_.hljs-quote]:italic",
  "[&_.hljs-keyword]:text-vio [&_.hljs-selector-tag]:text-vio [&_.hljs-literal]:text-vio [&_.hljs-section]:text-vio [&_.hljs-link]:text-vio",
  "[&_.hljs-built_in]:text-[#F2A0BD] [&_.hljs-type]:text-[#F2A0BD]",
  "[&_.hljs-string]:text-warn [&_.hljs-meta-string]:text-warn",
  "[&_.hljs-number]:text-[#C8A2FF] [&_.hljs-attr]:text-[#C8A2FF] [&_.hljs-symbol]:text-[#C8A2FF] [&_.hljs-bullet]:text-[#C8A2FF] [&_.hljs-template-tag]:text-[#C8A2FF] [&_.hljs-template-variable]:text-[#C8A2FF]",
].join(" ");

type PageProps = { params: Promise<{ slug: string }> };

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

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
  const title = post.frontmatter.title ?? slug;
  const description = post.frontmatter.description;
  const url = siteUrl(`blog/${slug}`);
  return {
    title: `${title} · Ralphy`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Ralphy",
      type: "article",
      publishedTime: post.frontmatter.date,
      authors: resolveAuthors(post.frontmatter).map((a) => a.name),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) notFound();

  const stars = await getDisplayStars();
  const date = formatDate(post.frontmatter.date);
  const expandedSource = expandInjections(post.source);

  const url = siteUrl(`blog/${slug}`);
  const authors = resolveAuthors(post.frontmatter);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.frontmatter.title ?? slug,
          description: post.frontmatter.description,
          url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          image: [siteUrl(`blog/${slug}/opengraph-image`)],
          datePublished: post.frontmatter.date,
          dateModified: post.frontmatter.date,
          articleSection: post.frontmatter.category,
          keywords: post.frontmatter.tags?.join(", "),
          author: authors.map((a) => ({
            "@type": "Person",
            name: a.name,
            ...(a.handle ? { url: `https://github.com/${a.handle}` } : {}),
          })),
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            logo: { "@type": "ImageObject", url: siteUrl("icon.svg") },
          },
        }}
      />
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <article className="py-[88px] pb-32 max-md:py-16 max-md:pb-24">
          <div className="container max-w-[1020px]">
            <header className="mb-10">
              {post.frontmatter.title && (
                <h1 className="font-display font-bold uppercase text-ink text-[clamp(40px,4.6vw,56px)] tracking-[-0.018em] leading-[1.06] [text-wrap:balance] m-0 mb-[22px]">
                  {post.frontmatter.title}
                </h1>
              )}
              <Byline
                authors={resolveAuthors(post.frontmatter)}
                date={date}
                category={post.frontmatter.category}
              />
            </header>

            <div className={proseClass}>
              <MDXRemote
                source={expandedSource}
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

/* Byline — one-line author row under the H1. Avatar(s) + display
 * name(s), then date, then an optional category chip. If an author has
 * a valid handle we render the avatar + a link to the GitHub profile;
 * otherwise we render initials in a coloured disc and skip the link. */
function Byline({
  authors,
  date,
  category,
}: {
  authors: Author[];
  date: string | null;
  category?: string;
}) {
  if (authors.length === 0 && !date && !category) return null;
  const authorCls =
    "inline-flex items-center gap-2 no-underline text-ink font-sans text-sm leading-[1.2] whitespace-nowrap transition-opacity duration-150 hover:opacity-[0.78]";
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 m-0">
      {authors.map((a, i) => {
        const initials = a.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("");
        const avatar = (
          <span className="relative w-6 h-6 rounded-full overflow-hidden bg-vio shrink-0">
            <span
              className="absolute inset-0 grid place-items-center text-bg font-display font-bold text-[10px]"
              aria-hidden
            >
              {initials}
            </span>
            {a.handle && (
              <img
                src={`https://github.com/${a.handle}.png?size=96`}
                alt=""
                className="w-full h-full object-cover block text-transparent"
              />
            )}
          </span>
        );
        const inner = (
          <>
            {avatar}
            <span className="font-semibold tracking-[-0.005em] text-ink">
              {a.name}
            </span>
          </>
        );
        return a.handle ? (
          <a
            key={i}
            className={authorCls}
            href={`https://github.com/${a.handle}`}
            target="_blank"
            rel="noopener"
          >
            {inner}
          </a>
        ) : (
          <span key={i} className={authorCls}>
            {inner}
          </span>
        );
      })}
      {date && (
        <span className="font-mono text-[12.5px] text-mute tracking-[0.02em]">
          {date}
        </span>
      )}
      {category && (
        <span className="inline-flex items-center px-[9px] py-[3px] rounded-full bg-bg-2 text-ink-2 font-mono text-[11.5px] tracking-[0.08em] uppercase">
          {category}
        </span>
      )}
    </div>
  );
}
