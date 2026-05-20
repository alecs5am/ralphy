// Static metadata for the 7 built-in Ralphy skills shipped under
// .agents/skills/ in the repo. Used by landing/app/skills/page.tsx.
//
// Adding a new skill is a two-file change:
//   1. The SKILL.md under .agents/skills/<slug>/
//   2. An entry below

export type Namespace = "ralphy" | "ralphy-dev";

export interface Skill {
  slug: string;
  title: string;
  namespace: Namespace;
  summary: string;
  trigger: string;
  input: string;
  output: string;
}

export const skills: Skill[] = [
  {
    slug: "ralphy-researcher",
    title: "Research a reference",
    namespace: "ralphy",
    summary:
      "Turn a TikTok/Reel/Shorts URL, an @handle, or a trend query into a cited research report your scenarist can act on.",
    trigger: 'URL drop · "research X" · "analyze @handle" · "what\'s trending in <niche>"',
    input: "URL / handle / topic",
    output: "report.md + sources.json",
  },
  {
    slug: "ralphy-evaluator",
    title: "Score a render",
    namespace: "ralphy",
    summary:
      "Quality gate for finished mp4s — scene segmentation, audio loudness, caption density, per-scene visual analysis. Catches issues before publish.",
    trigger: '"evaluate" · "score" · "QA" · "is this ready to ship" · drop an mp4',
    input: "rendered mp4",
    output: "eval.json + eval-report.md",
  },
  {
    slug: "ralphy-templater",
    title: "Save as template",
    namespace: "ralphy",
    summary:
      "Distil a finished project into a reusable vibe-reference or vibe-style template — composition skeleton, prompt cookbook with slots, model stack.",
    trigger: '"save as template" · "сохрани вайб как шаблон" · post-render rated 8+/10',
    input: "shipped project",
    output: "templates/<category>/<slug>/",
  },
  {
    slug: "ralphy-postmortem",
    title: "Distil a session",
    namespace: "ralphy",
    summary:
      "After a multi-iteration session: capture chat history, lessons learned, CLI gaps, model-and-cost rollup, and workflow fixes into a 6-file set.",
    trigger: '"postmortem" · "распиши уроки" · "разбор полётов" · end of any ≥2-iteration session',
    input: "the conversation we just had",
    output: "workspace/projects/<id>/postmortem/",
  },
  {
    slug: "ralphy-install",
    title: "Fresh-machine setup",
    namespace: "ralphy",
    summary:
      "Bootstrap the ralphy binary on a new machine — install from GitHub Releases, verify bun + ffmpeg, run the setup wizard, link the project.",
    trigger: '"install ralphy" · "fresh machine" · `which ralphy` returns nothing',
    input: "empty machine",
    output: "working `ralphy --version`",
  },
  {
    slug: "ralphy-remotion",
    title: "Remotion API reference",
    namespace: "ralphy",
    summary:
      "Domain knowledge for the editor agent — captions, transitions, audio, ffmpeg, springs, frame extraction, fonts, Zod-parameterizable videos, Lottie, transparent video.",
    trigger: '"how do I do X in Remotion" · TransitionSeries · interpolate · audio waveform',
    input: "Remotion API question",
    output: "topic-specific sub-doc",
  },
  {
    slug: "ralphy-dev-release",
    title: "Cut a release",
    namespace: "ralphy-dev",
    summary:
      "Ship a new ralphy version across all 3 channels in one shot — GitHub Release, Homebrew tap, npm. Drafts changelog, bumps versions in lockstep, refreshes docs.",
    trigger: '"cut a release" · "сделай релиз" · "publish a release" · ready-to-ship feature',
    input: "main HEAD",
    output: "v0.X.Y on brew + npm + gh release",
  },
];

export interface SkillGroup {
  namespace: Namespace;
  label: string;
  blurb: string;
  skills: Skill[];
}

export const skillGroups: SkillGroup[] = [
  {
    namespace: "ralphy",
    label: "Content skills",
    blurb:
      "End-user flows for creators. These are the workflows your agent will reach for when you ask for a video, a research report, a quality check, a template — the whole content factory.",
    skills: skills.filter((s) => s.namespace === "ralphy"),
  },
  {
    namespace: "ralphy-dev",
    label: "Maintainer skills",
    blurb:
      "Power-user flows for Ralphy contributors. Cut releases, ship CLI changes, run the dev loop. End users can ignore these.",
    skills: skills.filter((s) => s.namespace === "ralphy-dev"),
  },
];
