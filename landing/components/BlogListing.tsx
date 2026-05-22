"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDate, type PostSummary } from "@/lib/blog-shared";

type Props = {
  posts: PostSummary[];
  tags: { tag: string; count: number }[];
};

const LAYOUT_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.6,
};

export function BlogListing({ posts, tags }: Props) {
  const [active, setActive] = useState<string>("all");

  const list = useMemo(() => {
    if (active === "all") return posts;
    return posts.filter((p) =>
      (p.frontmatter.tags ?? []).some(
        (t) => String(t).toLowerCase() === active,
      ),
    );
  }, [active, posts]);

  return (
    <>
      <div className="blog-filter-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === "all"}
          onClick={() => setActive("all")}
          className={`blog-filter ${active === "all" ? "is-active" : ""}`}
        >
          <span className="blog-filter-label">All</span>
          <span className="blog-filter-count">{posts.length}</span>
        </button>
        {tags.map(({ tag, count }) => {
          const isActive = active === tag;
          return (
            <button
              key={tag}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tag)}
              className={`blog-filter ${isActive ? "is-active" : ""}`}
            >
              <span className="blog-filter-label">{tag}</span>
              <span className="blog-filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="blog-list">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((p, i) => (
            <PostCard key={p.slug} post={p} index={i} />
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <p className="blog-empty">No posts tagged <code>{active}</code> yet.</p>
        )}
      </div>
    </>
  );
}

function PostCard({ post, index }: { post: PostSummary; index: number }) {
  const enterDelay = Math.min(index, 6) * 0.05;
  const date = formatDate(post.frontmatter.date);
  const tags = post.frontmatter.tags ?? [];
  return (
    <motion.a
      layout
      href={`/blog/${post.slug}`}
      className="blog-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          opacity: { duration: 0.32, ease: "easeOut", delay: enterDelay },
          y: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: enterDelay },
        },
      }}
      exit={{
        opacity: 0,
        transition: { duration: 0.18, ease: "easeOut" },
      }}
      transition={{ layout: LAYOUT_TRANSITION }}
    >
      <div className="blog-card-head">
        {post.frontmatter.category && (
          <span className="blog-card-category">
            {post.frontmatter.category}
          </span>
        )}
        {date && <span className="blog-card-date">{date}</span>}
      </div>
      <h2 className="blog-card-title">{post.frontmatter.title ?? post.slug}</h2>
      {post.frontmatter.description && (
        <p className="blog-card-desc">{post.frontmatter.description}</p>
      )}
      <div className="blog-card-foot">
        <div className="blog-card-tags">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="blog-card-tag">
              {String(t).toLowerCase()}
            </span>
          ))}
        </div>
        <span className="blog-card-cta">
          Read
          <span aria-hidden>→</span>
        </span>
      </div>
    </motion.a>
  );
}
