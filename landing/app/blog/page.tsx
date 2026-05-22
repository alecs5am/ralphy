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

export const metadata: Metadata = {
  title: "Blog · Ralphy",
  description:
    "Articles, comparisons, and design notes from the Ralphy team. Open-source UGC pipeline, AI agents, and the model picks behind the renders.",
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
        <section className="blog-hero">
          <div className="container">
            <p className="eyebrow">Blog · {posts.length}</p>
            <h1 className="blog-h1">
              Notes from the open-source UGC factory.
            </h1>
            <p className="blog-sub">
              Comparisons, design references, and field notes on what
              actually ships when an AI agent owns the pipeline. New posts
              land in <a href="https://github.com/alecs5am/ralphy">the
              repo</a> before they show up here.
            </p>
          </div>
        </section>

        <section className="blog-index">
          <div className="container">
            <BlogListing posts={posts} tags={tags} />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
