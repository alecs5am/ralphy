// landing/app/skills/page.tsx
//
// Skills gallery — full-width wide cards with a filter bar on top.
// The interactive listing lives in <SkillsListing /> (client); this
// server component owns metadata, header, and the explainer block.

import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { loadSkills } from "@/lib/skills-loader";
import { SkillsListing } from "@/components/SkillsListing";

export const metadata: Metadata = {
  title: "Skills · Ralphy",
  description:
    "The Ralphy skill marketplace — generalized niche know-how (unboxing, UGC ads, GTA-style) plus workflow and render-engine skills. Tag-able from chat, all open source.",
};

export default async function SkillsPage() {
  const stars = await getDisplayStars();
  const skills = loadSkills();

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="pt-24 pb-9">
          <div className="container">
            <p className="font-mono text-[11.5px] tracking-[0.16em] uppercase text-vio mb-[18px]">Skills · {skills.length}</p>
            <h1 className="font-display font-bold text-[clamp(36px,5.2vw,64px)] tracking-[-0.015em] leading-[1.02] uppercase m-0 mb-[22px] max-w-[22ch] text-ink">
              The Ralphy skill marketplace.
            </h1>
            <p className="text-[16.5px] leading-[1.55] text-ink-3 m-0 mb-[26px] max-w-[66ch] [&_strong]:text-ink [&_strong]:font-semibold">
              A <strong>skill</strong> is generalized know-how — how to make a{" "}
              <em>kind</em> of video (an unboxing, a UGC ad, a GTA-style short),
              not one specific clip. Your coding agent matches a skill to your
              brief and runs the pipeline. Want to reproduce one exact video
              instead? That&apos;s a remix — browse the{" "}
              <a href="/library" className="text-vio no-underline transition-colors hover:text-vio-2 hover:underline">library</a>.
            </p>
            <p className="text-[14px] text-ink-3 m-0">
              New to Ralphy?{" "}
              <code className="font-mono text-[12.5px] py-1.5 px-2.5 bg-bg-2 text-ink-2 rounded-lg inline-block ml-1">
                git clone https://github.com/alecs5am/ralphy && cd ralphy && claude
              </code>
            </p>
          </div>
        </section>

        <section className="pt-9 pb-24">
          <div className="container">
            <SkillsListing skills={skills} />

            <div className="mt-12 py-7 px-8 bg-bg-1 rounded-[20px]">
              <h2 className="font-display font-bold text-[22px] tracking-[-0.005em] uppercase m-0 mb-[14px] text-ink">How skills work</h2>
              <ol className="m-0 pl-[22px] flex flex-col gap-2.5 text-[14.5px] leading-[1.55] text-ink-2 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:py-px [&_code]:px-1.5 [&_code]:bg-bg-3 [&_code]:text-ink [&_code]:rounded-[5px]">
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
