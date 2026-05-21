"use client";

import { forwardRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { skills, type Namespace, type Skill } from "@/lib/skills-data";

const REPO_BASE = "https://github.com/alecs5am/ralphy/blob/main/";

type Filter = "all" | Namespace;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ralphy", label: "Content" },
  { id: "ralphy-dev", label: "Maintainer" },
];

const NAMESPACE_LABEL: Record<Namespace, string> = {
  ralphy: "content",
  "ralphy-dev": "maintainer",
};

export function SkillsListing() {
  const [filter, setFilter] = useState<Filter>("all");
  const list =
    filter === "all" ? skills : skills.filter((s) => s.namespace === filter);

  return (
    <>
      <div className="skill-filter-row" role="tablist">
        {FILTERS.map((f) => {
          const count =
            f.id === "all"
              ? skills.length
              : skills.filter((s) => s.namespace === f.id).length;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`skill-filter ${active ? "is-active" : ""}`}
            >
              <span className="skill-filter-label">{f.label}</span>
              <span className="skill-filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="skill-list">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((s, i) => (
            <SkillWideCard key={s.slug} s={s} index={i} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/* Animation strategy for the filtered list:
 *   • popLayout — exiting cards are immediately removed from the
 *     flow (positioned absolutely by framer-motion) so remaining
 *     cards can reflow without waiting for the exit to finish.
 *     CRITICAL: this requires the AnimatePresence parent to have
 *     `position: relative` (set on .skill-list in globals.css)
 *     so the popped-out exiting elements stay positioned within
 *     the list bounds. Without that, exiting cards fly relative
 *     to <body>, which makes the surviving card appear to jump
 *     down then up as the layout snaps around the rogue absolute.
 *   • SkillWideCard must use forwardRef so framer-motion can
 *     attach its ref to the underlying DOM node — without it,
 *     the layout measurement is racy and the surviving card's
 *     spring overshoots / undershoots its target.
 *   • No stagger. Cascading delays multiplied the visual choppy-
 *     ness when many rows shifted simultaneously.
 *   • Transitions per property — opacity is a quick GPU fade,
 *     layout uses a tight spring, no y on the card itself (the
 *     spring handles vertical movement on its own). */
const LAYOUT_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.6,
};

const SkillWideCard = forwardRef<HTMLAnchorElement, { s: Skill; index: number }>(
  function SkillWideCard({ s, index }, ref) {
    /* Per-state transition keeps the three motions distinct:
     *   • enter — opacity + y, staggered by index so new cards
     *     cascade in (visible motion even when no layout shift
     *     fires for them)
     *   • exit  — opacity-only and fast, no stagger so the list
     *     reflow can start immediately
     *   • layout — independent spring, fires only on the survivors
     *     whose grid index changed (no stagger or it'd defeat the
     *     purpose of the spring) */
    const enterDelay = Math.min(index, 6) * 0.05;
    return (
    <motion.a
      ref={ref}
      layout
      href={`${REPO_BASE}.agents/skills/${s.slug}/SKILL.md`}
      target="_blank"
      rel="noopener"
      className="skill-wide"
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
      <div className="skill-wide-head">
        <code className="skill-wide-slash">/{s.slug}</code>
        <span className={`skill-wide-ns skill-wide-ns-${s.namespace}`}>
          {NAMESPACE_LABEL[s.namespace]}
        </span>
      </div>

      <div className="skill-wide-body">
        <div className="skill-wide-info">
          <h3 className="skill-wide-title">{s.title}</h3>
          <p className="skill-wide-summary">{s.summary}</p>
          <div className="skill-wide-trigger">
            <span className="skill-wide-trigger-label">Fires on</span>
            <p className="skill-wide-trigger-text">{s.trigger}</p>
          </div>
        </div>

        <aside className="skill-wide-aside">
          <dl className="skill-wide-io">
            <div className="skill-wide-io-row">
              <dt>in</dt>
              <dd>{s.input}</dd>
            </div>
            <div className="skill-wide-io-row">
              <dt>out</dt>
              <dd>{s.output}</dd>
            </div>
          </dl>
          <span className="skill-wide-cta">
            Open SKILL.md
            <span aria-hidden>→</span>
          </span>
        </aside>
      </div>
    </motion.a>
    );
  }
);
