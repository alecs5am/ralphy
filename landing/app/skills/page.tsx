// landing/app/skills/page.tsx
//
// Skills gallery page — Higgsfield-style grid of all built-in Claude Code
// skills that ship with the ralphy repo. Each card links back to the
// SKILL.md on GitHub so a curious user can read exactly what the skill
// does before invoking it in chat.
//
// Server component: skill metadata is loaded statically from
// landing/lib/skills-data.ts. Adding a new skill is a two-file change
// (the SKILL.md in .agents/skills/ + the entry in skills-data.ts).

import type { Metadata } from "next";
import { skills, skillGroups, type Skill } from "@/lib/skills-data";

export const metadata: Metadata = {
  title: "Skills · Ralphy",
  description:
    "Every Claude Code skill that ships with the ralphy repo — research, evaluate, postmortem, install, and more. Tag-able from chat, all open source.",
};

const REPO_BASE = "https://github.com/alecs5am/ralphy/blob/main/";

function SkillCard({ s }: { s: Skill }) {
  return (
    <a
      href={`${REPO_BASE}.agents/skills/${s.slug}/SKILL.md`}
      target="_blank"
      rel="noopener"
      className="skill-card"
    >
      <div className="skill-card-head">
        <code className="skill-slash">/{s.slug}</code>
        <span className={`skill-ns skill-ns-${s.namespace}`}>{s.namespace}</span>
      </div>
      <h3 className="skill-title">{s.title}</h3>
      <p className="skill-summary">{s.summary}</p>
      <div className="skill-meta">
        <span className="skill-trigger-label">Fires on:</span>
        <span className="skill-trigger-text">{s.trigger}</span>
      </div>
      <div className="skill-io">
        <span className="skill-io-in">{s.input}</span>
        <span className="skill-io-arrow">→</span>
        <span className="skill-io-out">{s.output}</span>
      </div>
    </a>
  );
}

export default function SkillsPage() {
  return (
    <main className="container skills-page" style={{ padding: "4rem 1rem" }}>
      <header style={{ marginBottom: "3rem" }}>
        <p className="eyebrow" style={{ opacity: 0.6, fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Skills · {skills.length}
        </p>
        <h1 style={{ fontSize: "3rem", fontWeight: 700, margin: "0.5rem 0 1rem" }}>
          Every Ralphy skill that ships in the repo.
        </h1>
        <p style={{ fontSize: "1.1rem", opacity: 0.75, maxWidth: "60ch", lineHeight: 1.6 }}>
          Skills are tag-able Claude Code workflows that turn your coding agent into a
          UGC studio. Two namespaces: <strong>ralphy-*</strong> for content creators,
          <strong> ralphy-dev-*</strong> for maintainers. Clone the repo, open Claude
          Code, type a slash command — that&apos;s it.
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: "0.95rem", opacity: 0.7 }}>
          New to Ralphy?{" "}
          <code style={{ background: "var(--bg-2)", padding: "0.2rem 0.5rem", borderRadius: 4 }}>
            git clone https://github.com/alecs5am/ralphy && cd ralphy && claude
          </code>
        </p>
      </header>

      {skillGroups.map((group) => (
        <section key={group.namespace} style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            {group.label}{" "}
            <span style={{ opacity: 0.5, fontWeight: 400 }}>({group.skills.length})</span>
          </h2>
          <p style={{ opacity: 0.65, fontSize: "0.95rem", marginBottom: "1.5rem", maxWidth: "60ch" }}>
            {group.blurb}
          </p>
          <div className="skills-grid">
            {group.skills.map((s) => (
              <SkillCard key={s.slug} s={s} />
            ))}
          </div>
        </section>
      ))}

      <section style={{ marginTop: "5rem", padding: "2rem", background: "var(--bg-2)", borderRadius: "12px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          How skills work
        </h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8, opacity: 0.85 }}>
          <li>You clone <code>ralphy</code> and open Claude Code inside the repo.</li>
          <li>Claude Code auto-discovers every <code>SKILL.md</code> under <code>.claude/skills/</code> (symlinked from <code>.agents/skills/</code>).</li>
          <li><code>AGENTS.md</code> auto-loads as the base context — describes Ralphy hard invariants + which skill solves what.</li>
          <li>You type a brief or a slash command (<code>/ralphy-researcher</code>, etc.) and the right skill fires.</li>
          <li>The skill body instructs your agent how to execute that specific flow — what CLI verb to call, what outputs to produce, what to check before paying for a render.</li>
        </ol>
      </section>
    </main>
  );
}
