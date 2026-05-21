"use client";

import { useState } from "react";
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
          {list.map((s) => (
            <SkillWideCard key={s.slug} s={s} />
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
 *   • layout prop on each card — drives the reflow with a snappy
 *     spring (no stagger; cascading delays were what caused the
 *     "choppy" feel when many rows shifted at once).
 *   • Separate transitions per property — exit is opacity-only and
 *     fast (160ms tween, GPU); enter is opacity + small y on a
 *     short ease-out; layout uses a tight spring.
 *   • No willChange on the card itself — the layout animation
 *     handles its own transform optimisation. */
const LAYOUT_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.6,
};

function SkillWideCard({ s }: { s: Skill }) {
  return (
    <motion.a
      layout
      href={`${REPO_BASE}.agents/skills/${s.slug}/SKILL.md`}
      target="_blank"
      rel="noopener"
      className="skill-wide"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        layout: LAYOUT_TRANSITION,
        opacity: { duration: 0.18, ease: "easeOut" },
        y: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      }}
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
