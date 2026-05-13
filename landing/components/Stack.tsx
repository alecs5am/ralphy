import { Block, Inline, ChipRow, Chip } from "./Block";
import { AgentDropdown } from "./AgentDropdown";
import {
  ClaudeMark,
  CursorMark,
  CodexMark,
  TerminalMark,
  OpenRouterMark,
  VercelMark,
  ElevenMark,
  RemotionMark,
  SparkMark,
  TikTokMark,
  ReelsMark,
  YouTubeMark,
  VideoMark,
} from "./icons";

/* ──────────────────────────────────────────────
   /07 — Not a SaaS. A toolkit operators can rip
   apart. Three ChipRows answer "lives inside ↳",
   "powered by ↳", "ship as ↳" — same parts the
   audience already trusts.
   ────────────────────────────────────────────── */

export function Stack() {
  return (
    <section id="stack" className="relative">
      <div className="mx-auto max-w-[1180px] px-7">
        <Block
          n="07"
          title={<>Not a SaaS. A toolkit you can rip apart.</>}
          lede={
            <>
              Ralphy is the glue between your <AgentDropdown defaultAgent="claude" />,
              the <Inline>best models on the market</Inline>, and a{" "}
              <Inline>composition layer</Inline> you can fork. Skills live as
              markdown. The model registry is one file. The template library
              is open. Everything is MIT — your keys, your repo, your files.
            </>
          }
        >
          <div className="flex flex-col gap-7">
            <ChipRow label="lives inside ↳">
              <Chip icon={<ClaudeMark />} label="Claude Code" />
              <Chip icon={<CursorMark />} label="Cursor" />
              <Chip icon={<CodexMark />} label="Codex" />
              <Chip icon={<TerminalMark />} label="any agent CLI" muted />
              <Chip icon={<TerminalMark />} label="bare $ ralphy" muted />
            </ChipRow>

            <ChipRow label="powered by ↳">
              <Chip icon={<OpenRouterMark />} label="OpenRouter" />
              <Chip icon={<VercelMark />} label="Vercel AI Gateway" />
              <Chip icon={<ElevenMark />} label="ElevenLabs" />
              <Chip icon={<RemotionMark />} label="Remotion" />
              <Chip icon={<SparkMark />} label="gemini-3-pro" muted />
              <Chip icon={<SparkMark />} label="kling-v3" muted />
              <Chip icon={<SparkMark />} label="veo-3.1" muted />
              <Chip icon={<SparkMark />} label="seedance-2.0" muted />
            </ChipRow>

            <ChipRow label="ship as ↳">
              <Chip icon={<VideoMark />} label="commercials" />
              <Chip icon={<VideoMark />} label="hyper-motion spots" />
              <Chip icon={<VideoMark />} label="horror shorts" />
              <Chip icon={<VideoMark />} label="fruit dramas" />
              <Chip icon={<VideoMark />} label="talking head" />
              <Chip icon={<TikTokMark />} label="TikToks" />
              <Chip icon={<ReelsMark />} label="Reels" />
              <Chip icon={<YouTubeMark />} label="Shorts" />
              <Chip label="…or your own format" muted />
            </ChipRow>
          </div>
        </Block>
      </div>
    </section>
  );
}
