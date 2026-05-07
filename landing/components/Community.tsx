import type { ReactNode } from "react";
import { Block, Inline } from "./Block";
import {
  BookIcon,
  DiscordIcon,
  GitHubIcon,
  XIcon,
  SparkMark,
  HeartMark,
  CheckMark,
  BoltMark,
} from "./icons";
import { site } from "@/lib/site";

const ways: { icon: ReactNode; head: string; copy: string }[] = [
  {
    icon: <SparkMark />,
    head: "Ship a profile",
    copy: "Bundle your style, refs, prompts — name it, push it. Anyone running ralphy can install your aesthetic in one command.",
  },
  {
    icon: <BoltMark />,
    head: "Write a skill",
    copy: "A skill is a markdown file. Add a new model, a new transition, a new caption style. We hot-reload on save.",
  },
  {
    icon: <HeartMark />,
    head: "Bring an idea",
    copy: "Drop it in #ideas. The team and the community pick up what feels obvious in hindsight, and ship it next week.",
  },
  {
    icon: <CheckMark />,
    head: "Just use it",
    copy: "Star the repo, post your render, tell us what broke. That's how we know which corner to polish first.",
  },
];

const channels: {
  href: string;
  glyph: ReactNode;
  title: string;
  desc: string;
  arr: string;
}[] = [
  {
    href: site.discord,
    glyph: <DiscordIcon />,
    title: "Discord",
    desc: "Where creators trade prompts, profiles, and that one weird ffmpeg flag. The dev team hangs in #beta.",
    arr: "join the slime →",
  },
  {
    href: site.repo,
    glyph: <GitHubIcon />,
    title: "GitHub",
    desc: "Source, issues, releases — and the profile gallery. Open a PR, get your style into the next install.",
    arr: "fork & ship →",
  },
  {
    href: site.x,
    glyph: <XIcon />,
    title: "X / Twitter",
    desc: "Daily render drops, model news, what just landed in main. Tag @ralphy_studio to get reposted.",
    arr: "follow →",
  },
  {
    href: site.docs,
    glyph: <BookIcon />,
    title: "Docs · Mintlify",
    desc: "CLI reference, skill authoring, model registry, profile sharing — searchable, with examples.",
    arr: "read the docs →",
  },
];

export function Community() {
  return (
    <section id="community" className="relative">
      <div className="mx-auto max-w-[1180px] px-7">
        <Block
          n="08"
          title={<>Built with creators. Not at them.</>}
          lede={
            <>
              Ralphy is open source on purpose. The best{" "}
              <Inline>skills</Inline>, the best <Inline>profiles</Inline>, the
              best <Inline>prompts</Inline> come from the people running it
              every day. Drop in, ship a profile, and the next person installing
              Ralphy gets your aesthetic for free.
            </>
          }
        >
          <div className="flex flex-col gap-7">
            {/* Four ways to participate — same shape as MiniTile */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ways.map((w) => (
                <div
                  key={w.head}
                  className="flex h-full flex-col gap-2.5 rounded-xl border border-[var(--color-line)] bg-[rgb(10_18_32/0.4)] p-5"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-line)] text-[var(--color-cyan)]">
                    {w.icon}
                  </span>
                  <h3
                    className="text-[18px] italic text-[var(--color-frost)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {w.head}
                  </h3>
                  <p className="text-[13px] leading-[1.55] text-[var(--color-mute)]">{w.copy}</p>
                </div>
              ))}
            </div>

            {/* Four channels */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {channels.map((c) => (
                <a
                  key={c.title}
                  href={c.href}
                  target="_blank"
                  rel="noopener"
                  className="group flex h-full min-h-[180px] flex-col gap-3.5 rounded-xl border border-[var(--color-line)] bg-[rgb(10_18_32/0.55)] p-6 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[var(--color-cyan)] hover:bg-[rgb(10_22_36/0.7)]"
                >
                  <div className="grid h-8 w-8 place-items-center text-[var(--color-cyan)]">
                    {c.glyph}
                  </div>
                  <h3
                    className="text-[22px] italic text-[var(--color-frost)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {c.title}
                  </h3>
                  <p className="flex-1 text-[13.5px] leading-[1.55] text-[var(--color-mute)]">{c.desc}</p>
                  <span
                    className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-cyan)] transition group-hover:text-[var(--color-cyan-2)]"
                    style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.04em" }}
                  >
                    {c.arr}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </Block>
      </div>
    </section>
  );
}
