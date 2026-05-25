// Creator style-sheet synthesizer. Given a corpus of per-video breakdowns
// from a single creator (analyzed by gemini-3.1-pro-preview), distill the
// AUTHOR-SPECIFIC formula — what makes this creator's videos look and feel
// like theirs, and how a follower could reproduce that formula on their
// own content.
//
// Output structure is different from the niche-research report: it's a
// reproducibility playbook focused on ONE creator, not a competitive scan.

import { callLLM } from "../providers/llm.js";
import type { VideoSummary } from "./video-summarizer.js";

export type StyleSheetInput = {
  creatorHandle: string;
  profileUrl: string;
  niche?: string; // optional context ("horror short-form" etc)
  videoSummaries: VideoSummary[];
  model?: string;
  projectId?: string;
};

const SYSTEM = `You are the senior analyst writing a single-creator STYLE SHEET. The user wants to reproduce this creator's formula on their own channel. You will be given:

- The creator's profile URL.
- The creator's handle.
- A corpus of beat-by-beat video breakdowns analyzed by a vision model directly on the actual videos (or thumbnail+transcript fallback). Each entry has hook, body structure, closer, visual style, audio use, editing pace, replicable template, virality score, and view count.

Your job: distill THE FORMULA. What does this creator do every time? What makes their content recognizable from any of their videos? What are the rules a follower must follow to make a video that would convincingly slot into this creator's feed?

Write a style sheet in this STRICT structure:

# {Creator handle} — Style Sheet

## Executive distillation
4-6 bullets. The ABSOLUTE essentials of this creator's formula. Each bullet must be specific enough that a violation would be immediately recognizable as "off-brand". Cite video URLs inline.

## The formula
A single paragraph (4-7 sentences) that reads like a recipe: "Every {creator handle} video opens with X, then Y for Z seconds, then W. Visual register is always A. Audio is always B. Closer is always C." Cite 3-5 video URLs that exemplify each piece.

## Visual register
Specific, copyable rules:
- **Aspect & framing:** vertical 9:16 / pillarbox / fullscreen. Letterboxing rules if any.
- **Color palette:** exact named colors (e.g. "sickly fluorescent green #b8c47a, faded mustard yellow #c9a04a"). Reference videos.
- **Lighting:** practical / unlit / overhead fluorescent / single light source — be specific.
- **Camera:** locked-off / handheld / drifting / first-person POV / static.
- **Lens & distortion:** wide-angle distortion / fisheye / clean / vintage anamorphic.
- **VHS / analog treatment:** chromatic aberration intensity, scan lines, signal noise, tracking distortion, color bleed — be specific about which layers are always on.
- **Subject placement:** symmetric center / off-center / negative-space-heavy.

## Audio register
- **Music or no music:** state the rule. If music, what genre / texture / source.
- **Sound design layers:** drone tones (frequency band), foley, static, breathing — be specific.
- **VO presence:** none / processed / robotic / diegetic. Quote example treatments.
- **Audio dynamics:** flat-loud-throughout / slow-build / sudden-stinger.
- **Audio's relationship to visuals:** sync / counter-rhythm / unrelated dread.

## Editing register
- **Pace:** average shot length in seconds. Range.
- **Transitions:** hard cuts / dissolve / glitch cuts / loops.
- **Sequence shape:** beat-by-beat 1...N. Map the canonical 0-Xs arc.
- **Title cards / on-screen text:** typography, color, animation, frequency, content rules (e.g. "always 2-word fragments in white Helvetica with red glitch shadow").

## Hook playbook
2-5 named hook patterns this creator uses. For each: name, mechanism, 2-3 reference video URLs from the corpus, the structural reason it works in THIS creator's style.

## Body / closer patterns
The 2-4 distinct middle-section structures and how each one is closed out.

## Hashtag / caption discipline
The hashtag clusters this creator consistently uses, the caption length, the caption tone (cryptic / descriptive / silent).

## Replicate it: 8-step production playbook
Numbered. Each step is one concrete action. The reader should be able to execute step-by-step to produce a video that would look at home on this creator's feed. Include model picks (image gen / video gen / audio gen) where relevant. Cite videos that exemplify each step.

## What this creator NEVER does
4-7 anti-patterns. The model-card rules that would immediately mark a video as "not them". Specific enough to act on.

## Sources
Numbered list of every video URL cited.

CITATION RULES (hard):
- EVERY non-obvious claim must cite a video URL from the corpus.
- The URLs must match the corpus VERBATIM. No invention, no rephrasing.
- Aim for at least 1 citation per bullet in body sections.

LENGTH: 2500-4500 words. Be specific and dense. No filler. No emojis. English only.
`;

export async function distillCreatorStyleSheet(
  input: StyleSheetInput,
): Promise<string> {
  const model = input.model ?? "anthropic/claude-sonnet-4.6";

  const corpus = input.videoSummaries
    .slice()
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .map((v, i) => {
      return [
        `### Video ${i + 1} (virality ${v.viralityScore.toFixed(2)})`,
        `URL: ${v.url}`,
        `Platform: ${v.platform} | Uploader: ${v.uploader}`,
        `Title: ${v.title}`,
        `Aspect: ${v.aspect_ratio} | Runtime: ${v.durationSec}s | Views: ${v.views} | Age: ${v.ageDays}d | Lang: ${v.language}`,
        `Analyzed via: ${v.analysis_mode}`,
        `Hook (0-3s): ${v.hook_first_3s}`,
        `Hook pattern: ${v.hook_pattern}`,
        `Body: ${v.body_structure}`,
        `Closer: ${v.closer}`,
        `On-screen text: ${v.on_screen_text_style}`,
        `Visual style: ${v.visual_style}`,
        `Audio: ${v.audio_use}`,
        `Editing pace: ${v.editing_pace}`,
        `Why works: ${v.why_works}`,
        `Replicable template: ${v.replicable_template}`,
        v.hashtags.length ? `Hashtags: ${v.hashtags.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const user = [
    `Creator: ${input.creatorHandle}`,
    `Profile: ${input.profileUrl}`,
    input.niche ? `Niche context: ${input.niche}` : "",
    ``,
    `## Video corpus (${input.videoSummaries.length} videos analyzed)`,
    ``,
    corpus,
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    model,
    temperature: 0.3,
    maxTokens: 12000,
    projectId: input.projectId,
    endpoint: "research/creator-stylesheet",
  });

  return text.trim();
}
