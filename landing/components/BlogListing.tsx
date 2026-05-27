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
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        <FilterButton
          isActive={active === "all"}
          onClick={() => setActive("all")}
          label="All"
          count={posts.length}
        />
        {tags.map(({ tag, count }) => (
          <FilterButton
            key={tag}
            isActive={active === tag}
            onClick={() => setActive(tag)}
            label={tag}
            count={count}
          />
        ))}
      </div>

      <div className="relative grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-[18px] [@media(min-width:1100px)]:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((p, i) => (
            <PostCard key={p.slug} post={p} index={i} />
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <p className="col-[1/-1] py-12 text-center text-ink-3 text-[15px]">
            No posts tagged{" "}
            <code className="font-mono text-[13px] px-[7px] py-0.5 bg-bg-2 text-ink rounded-md">
              {active}
            </code>{" "}
            yet.
          </p>
        )}
      </div>
    </>
  );
}

function FilterButton({
  isActive,
  onClick,
  label,
  count,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 px-[18px] py-2.5 rounded-full font-sans text-sm font-medium tracking-[-0.005em] lowercase border-0 cursor-pointer transition-colors duration-150 ${
        isActive
          ? "bg-ink text-bg"
          : "bg-bg-1 text-ink-3 hover:bg-bg-2 hover:text-ink"
      }`}
    >
      <span>{label}</span>
      <span
        className={`font-mono text-xs px-2 py-0.5 rounded-full leading-none ${
          isActive ? "bg-black/[0.18] text-bg" : "bg-bg-3 text-ink-3"
        }`}
      >
        {count}
      </span>
    </button>
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
      className="group flex flex-col gap-3.5 px-[26px] pt-[26px] pb-[22px] bg-bg-1 rounded-[20px] no-underline text-ink min-h-[240px] transition-[background,transform] duration-200 hover:bg-bg-2 hover:-translate-y-0.5"
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
      <div className="flex items-center justify-between gap-3 font-mono text-[11.5px] tracking-[0.04em] text-mute uppercase">
        {post.frontmatter.category && (
          <span className="px-2.5 py-1 bg-[rgb(255_166_48/0.16)] text-vio rounded-full font-semibold">
            {post.frontmatter.category}
          </span>
        )}
        {date && <span className="text-mute">{date}</span>}
      </div>
      <h2 className="font-display font-bold text-[22px] leading-[1.18] tracking-[-0.005em] uppercase m-0 text-ink">
        {post.frontmatter.title ?? post.slug}
      </h2>
      {post.frontmatter.description && (
        <p className="m-0 text-[14.5px] leading-[1.55] text-ink-3 flex-1">
          {post.frontmatter.description}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 mt-auto">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="font-mono text-[11px] tracking-[0.02em] px-2 py-[3px] bg-bg-3 text-ink-3 rounded-full lowercase"
            >
              {String(t).toLowerCase()}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.04em] text-vio uppercase shrink-0">
          Read
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-[3px]">
            →
          </span>
        </span>
      </div>
    </motion.a>
  );
}
