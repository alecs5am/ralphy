// landing/app/blog/page.tsx
//
// Blog index. Reads every .mdx in content/blog, filters to
// frontmatter.visibility === "public", and renders a tag-filterable
// list. Tag chips are collected across all visible posts.

import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { collectTags, listPosts } from "@/lib/blog";
import { BlogListing } from "@/components/BlogListing";
import { siteUrl } from "@/lib/site";

const BLOG_DESCRIPTION =
  "Articles, comparisons, and design notes from the Ralphy team. Open-source UGC pipeline, AI agents, and the model picks behind the renders.";

export const metadata: Metadata = {
  title: "Blog",
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: {
      "application/rss+xml": [{ url: siteUrl("blog/feed.xml"), title: "Ralphy Blog" }],
    },
  },
  openGraph: {
    title: "Ralphy Blog · Field notes",
    description: BLOG_DESCRIPTION,
    url: siteUrl("blog"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ralphy Blog · Field notes",
    description: BLOG_DESCRIPTION,
  },
};

export default async function BlogIndexPage() {
  const stars = await getDisplayStars();
  const posts = await listPosts();
  const tags = collectTags(posts);

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="pt-[84px] pb-7">
          <div className="container">
            <p className="eyebrow">Blog · {posts.length}</p>
            <h1 className="font-display font-bold uppercase text-ink text-[clamp(40px,4.6vw,56px)] leading-[1.06] tracking-[-0.01em] max-w-[18ch] mt-2 mb-[18px]">
              Notes from the open-source UGC factory.
            </h1>
            <p className="text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-ink-3 m-0 max-w-[66ch]">
              Comparisons, design references, and field notes on what
              actually ships when an AI agent owns the pipeline. New posts
              land in <a href="https://github.com/alecs5am/ralphy" className="text-ink underline underline-offset-[3px]">the
              repo</a> before they show up here.
            </p>
          </div>
        </section>

        <section className="pt-6 pb-24">
          <div className="container">
            <BlogListing posts={posts} tags={tags} />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
