// landing/app/skills/page.tsx
//
// Skills gallery — full-width wide cards with a filter bar on top.
// The interactive listing lives in <SkillsListing /> (client); this
// server component owns metadata, header, and the explainer block.

import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { skills } from "@/lib/skills-data";
import { SkillsListing } from "@/components/SkillsListing";

export const metadata: Metadata = {
  title: "Skills · Ralphy",
  description:
    "Every Claude Code skill that ships with the ralphy repo — research, evaluate, postmortem, install, and more. Tag-able from chat, all open source.",
};

export default async function SkillsPage() {
  const stars = await getDisplayStars();

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="skills-hero">
          <div className="container">
            <p className="eyebrow">Skills · {skills.length}</p>
            <h1 className="skills-h1">
              Every Ralphy skill that ships in the repo.
            </h1>
            <p className="skills-sub">
              Skills are tag-able Claude Code workflows that turn your coding
              agent into a UGC studio. Two namespaces:{" "}
              <strong>ralphy-*</strong> for content creators,{" "}
              <strong>ralphy-dev-*</strong> for maintainers. Clone the repo,
              open Claude Code, type a slash command — that&apos;s it.
            </p>
            <p className="skills-clone">
              New to Ralphy?{" "}
              <code className="skills-clone-cmd">
                git clone https://github.com/alecs5am/ralphy && cd ralphy && claude
              </code>
            </p>
          </div>
        </section>

        <section className="skills-body">
          <div className="container">
            <SkillsListing />

            <div className="skill-how">
              <h2 className="skill-how-title">How skills work</h2>
              <ol className="skill-how-list">
                <li>
                  You clone <code>ralphy</code> and open Claude Code inside the
                  repo.
                </li>
                <li>
                  Claude Code auto-discovers every <code>SKILL.md</code> under{" "}
                  <code>.claude/skills/</code> (symlinked from{" "}
                  <code>.agents/skills/</code>).
                </li>
                <li>
                  <code>AGENTS.md</code> auto-loads as the base context —
                  describes Ralphy hard invariants + which skill solves what.
                </li>
                <li>
                  You type a brief or a slash command (
                  <code>/ralphy-researcher</code>, etc.) and the right skill
                  fires.
                </li>
                <li>
                  The skill body instructs your agent how to execute that
                  specific flow — what CLI verb to call, what outputs to
                  produce, what to check before paying for a render.
                </li>
              </ol>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
