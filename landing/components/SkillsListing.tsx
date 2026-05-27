"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { SkillRecord, SkillCategory } from "@/lib/skills-loader";

type Filter = "all" | SkillCategory;

const CATEGORY_ACCENT: Record<SkillCategory, string> = {
  "UGC niches": "var(--color-vio)",
  Workflow: "#3fa7ff",
  "Render engine": "#27c1a3",
  Maintainer: "#e0883a",
};

export function SkillsListing({ skills }: { skills: SkillRecord[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const seen = new Map<SkillCategory, number>();
    for (const s of skills) seen.set(s.category, (seen.get(s.category) ?? 0) + 1);
    return [...seen.entries()];
  }, [skills]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (filter !== "all" && s.category !== filter) return false;
      if (!q) return true;
      return (
        s.slug.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [skills, filter, query]);

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.85rem] cursor-pointer border-0 transition-colors ${
      active ? "bg-ink text-bg" : "bg-bg-1 text-ink-3 hover:bg-bg-2 hover:text-ink-2"
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          <button role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            <span>All</span>
            <span className="tabular-nums opacity-70 text-[0.78rem]">{skills.length}</span>
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              role="tab"
              aria-selected={filter === cat}
              onClick={() => setFilter(cat)}
              className={chip(filter === cat)}
            >
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: CATEGORY_ACCENT[cat] }} aria-hidden />
              <span>{cat}</span>
              <span className="tabular-nums opacity-70 text-[0.78rem]">{count}</span>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 bg-bg-2 rounded-full px-4 py-2 min-w-[18rem] shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="text-ink-3 text-[1.05rem]" aria-hidden>⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, tags, triggers…"
            aria-label="Search skills"
            className="bg-transparent border-0 outline-none text-ink text-[0.92rem] w-full placeholder:text-ink-3"
          />
        </label>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-3 py-8">No skills match — clear the search or pick another category.</p>
      ) : (
        <div className="grid gap-4 relative [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((s, i) => (
              <SkillCard key={s.slug} s={s} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

function SkillCard({ s, index }: { s: SkillRecord; index: number }) {
  const accent = CATEGORY_ACCENT[s.category];
  const enterDelay = Math.min(index, 8) * 0.04;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          opacity: { duration: 0.3, ease: "easeOut", delay: enterDelay },
          y: { duration: 0.42, ease: [0.22, 1, 0.36, 1], delay: enterDelay },
        },
      }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      transition={{ layout: { type: "spring", stiffness: 380, damping: 32, mass: 0.6 } }}
      className="flex"
    >
      <Link
        href={`/skills/${s.slug}`}
        className="group flex w-full flex-col gap-3 p-[1.15rem_1.2rem] rounded-[14px] bg-bg-1 no-underline text-inherit shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[background,transform,box-shadow] duration-150 hover:bg-bg-2 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(0_0_0/0.3)]"
        style={{ ["--accent" as string]: accent }}
      >
        <div className="flex items-center gap-2.5">
          {s.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.icon} alt="" className="shrink-0 w-[38px] h-[38px] rounded-[10px] object-cover [image-rendering:pixelated] block" aria-hidden />
          ) : (
            <span
              className="shrink-0 grid place-items-center w-[38px] h-[38px] rounded-[10px] text-[0.82rem] font-bold tracking-[0.02em] text-bg [background:linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_55%,#000))]"
              aria-hidden
            >
              {s.monogram}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[1rem] font-[650] m-0 leading-[1.2]">{s.name}</h3>
            <code className="text-[0.74rem] text-ink-3 block mt-px">/{s.slug}</code>
          </div>
        </div>
        <p className="text-[0.86rem] leading-[1.5] text-ink-3 m-0 flex-1">{s.blurb}</p>
        <div className="flex flex-wrap gap-1.5">
          {s.tags.map((t) => (
            <span key={t} className="text-[0.68rem] px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 group-hover:bg-bg-1">
              {t}
            </span>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}
