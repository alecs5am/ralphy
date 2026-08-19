// Multi-model creative fan-out for evilcorp-pilot-001 (HUMANLY).
// Goes through callLLM() per MODELS.md line 422; projectId set so spend lands in
// the project gen-log. Interim stand-in for notes/issues/557.
import { mkdirSync, writeFileSync } from "node:fs";
import { callLLM } from "./cli/lib/providers/llm.js";

const MODELS = [
  "google/gemini-3.1-pro-preview",
  "x-ai/grok-4.3",
  "deepseek/deepseek-v3.2-exp",
  "openai/gpt-5.4",
  "moonshotai/kimi-k2-thinking",
  "anthropic/claude-opus-4.6",
];

const BRIEF = `You are a top-tier comedy writer for short-form social video. Deliver ideas, not commentary.

## The project

A fake corporate video for HUMANLY — a fictional AI company. Satire/parody of real
corporate launch and recruiting films. There is no real product; this is a comedy
meme for TikTok. The name is the first joke: a company called Humanly that replaced
every human.

**Format:** 9:16 vertical, 60-90 seconds, English, mute-first (every joke must also
land as on-screen text, because TikTok autoplays muted).

**Register:** Black Mirror crossed with Idiocracy. CRITICAL RULE: nobody in the
video is menacing or winking. The presenter is warm, beautifully lit, sincere — the
voice of a meditation app. Music is pleasant. Typography is expensive. Every line is
delivered as GOOD NEWS. The comedy and the dread both come from the gap between how
the film sounds and what it describes. One smirk and it becomes a bad villain sketch.

**Posture toward the viewer:** the company is openly contemptuous of the audience and
assumes they will swallow everything. The viewer should feel addressed and insulted.
The target reaction is "holy shit, these corporate people have completely lost it."
The customer/worker is expected to be GRATEFUL for the privilege of being useful to
the company and its founder.

**Satire target:** executives, shareholders, HR euphemism, AI-driven layoffs, the
data economy, AI slop, founder wealth. Punch UP at power. NEVER punch down at
workers, the poor, homeless people, addicts, or any vulnerable group — the laid-off
worker is the VICTIM of what we are satirizing, so a joke landing on them makes the
audience side against us. Do not reference real named people, real wars, or real
criminal cases; keep escalation procedural and invented, which is also funnier.

## What has been tried and REJECTED

1. **A tour of job openings / vacancy listings as the structure — REJECTED as boring.
   Do not propose any version of a careers-page or job-listing engine.**
2. A culture-deck opening (unlimited PTO nobody takes, "we're a family") — REJECTED:
   24 seconds of setup with nothing to hook the viewer, and the jokes are stale.
3. Building everything on ONE premise (humans as literal energy/water for the AI) —
   REJECTED as too narrow. That idea may survive as ONE escalation among several, but
   it cannot be the whole engine.

## Hard requirements

- **A punch inside the first 1.5 seconds.** No welcome, no premise, no logo first.
  The gag comes before the context.
- **At least 3 INDEPENDENT joke axes** — separate attacks, not variations on one idea.
- **Escalating pressure:** opens looking like an ordinary (if bleak) real corporate
  video, ends somewhere obviously insane. The delivery never changes across the ramp.
- **Continuous speech.** No silent gaps; narration runs over every cutaway. Roughly
  2.8 words/second.
- Every punchline needs a TAIL REVERSAL: the last clause must break the expectation
  the first clause set. A line that merely describes something wry is not a joke.
- A powerful ending. Bonus if the film does something structural to the viewer.

## Deliver exactly this, no preamble

**A. THREE DISTINCT STRUCTURAL ENGINES.** For each: a name, the mechanism in 2
sentences, why it generates jokes indefinitely, and its single biggest weakness. These
must be genuinely different machines, not three flavours of one idea.

**B. YOUR BEST ENGINE, OPENED.** For your strongest engine, write the first 4 beats
verbatim with timecodes — exact spoken lines and exact on-screen text. Prove the punch
lands inside 1.5s.

**C. TEN HARD LINES.** Your ten best individual punchlines for this film, each with a
tail reversal. Rank them. Be mean and be specific; avoid anything that sounds like it
came from a LinkedIn parody account.

**D. THE ENDING.** One ending, with the exact final on-screen text, and one sentence
on why it lands.

Be surprising. Avoid the obvious satirical beats any competent writer would reach for
first.`;

const OUT = ".ralphy/workspaces/content-lab/projects/evilcorp-pilot-001/ideation";
mkdirSync(OUT, { recursive: true });

const started = Date.now();
const results = await Promise.all(
  MODELS.map(async (model) => {
    try {
      const r = await callLLM({
        model,
        messages: [{ role: "user", content: BRIEF }],
        temperature: 1,
        maxTokens: 4000,
        projectId: "evilcorp-pilot-001",
        endpoint: "ideate/engine-fanout",
        slot: model.replace(/[/.]/g, "-"),
      });
      const slug = model.replace(/[/.]/g, "-");
      writeFileSync(`${OUT}/${slug}.md`, `# ${model}\n\n${r.text}\n`);
      return { model, ok: true, chars: r.text.length, ms: r.latencyMs };
    } catch (e) {
      return { model, ok: false, err: String((e as Error).message).slice(0, 160) };
    }
  }),
);

for (const r of results) {
  console.log(r.ok ? `OK    ${r.model}  ${r.chars} chars  ${r.ms}ms` : `FAIL  ${r.model}  ${r.err}`);
}
console.log(`\nwrote ${results.filter((r) => r.ok).length} files to ${OUT}`);
console.log(`wall: ${((Date.now() - started) / 1000).toFixed(1)}s`);
