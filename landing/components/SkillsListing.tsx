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

      <motion.div className="skill-list" layout>
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((s, i) => (
            <SkillWideCard key={s.slug} s={s} index={i} />
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

function SkillWideCard({ s, index }: { s: Skill; index: number }) {
  return (
    <motion.a
      layout
      href={`${REPO_BASE}.agents/skills/${s.slug}/SKILL.md`}
      target="_blank"
      rel="noopener"
      className="skill-wide"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
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
