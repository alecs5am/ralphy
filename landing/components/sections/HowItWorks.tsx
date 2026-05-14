import { SectionHead, TerminalBlock, Duo } from "../SectionPrimitives";

export function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <SectionHead
          eyebrow="how it works"
          title={
            <>
              A complete content studio
              <br />
              <span className="acc">inside your agent.</span>
            </>
          }
          sub="Trend research, style cloning, video generation, and self-critic — all wired into the same chat you already use for code."
        />

        <Duo
          kicker="01 · trend-watch"
          title={
            <>
              See what&apos;s <span className="acc">spiking</span> first.
            </>
          }
          copy={
            <>
              Drop a niche or an <span className="inl">@handle</span>. Ralphy crawls TikTok, Reels, and Shorts and
              reports what&apos;s gaining velocity — before it peaks. Hooks, formats, and reference URLs ready to
              fork.
            </>
          }
          terminal={
            <TerminalBlock
              title="ralphy trend"
              lines={
                <>
                  <span className="prm">$ </span>
                  {`ralphy trend "@nikitabier" --niche saas\n`}
                  <span className="dim">  ✓ scanning TikTok, Reels, Shorts ...</span>
                  {"\n"}
                  <span className="dim">  → </span>
                  <span className="acc">47 clips</span>
                  <span className="dim"> · last 14d</span>
                  {"\n"}
                  <span className="dim">  → top formats: </span>
                  <span className="acc">hyper-motion 38%</span>
                  <span className="dim"> · talking-head 24%</span>
                  {"\n"}
                  <span className="dim">  → spiking now: </span>
                  <span className="acc">&quot;rate my SaaS&quot; hook</span>
                  <span className="dim"> · +312% w/w</span>
                  {"\n"}
                  <span className="cmt">{`# 6 references attached → ./workspace/trends/saas-2026-05/\n`}</span>
                  <span className="prm">$ </span>
                  <span className="dim">ralphy clone </span>
                  <span className="acc">&lt;url&gt;</span>
                  {`\n`}
                </>
              }
            />
          }
        />

        <Duo
          reverse
          kicker="02 · style-clone"
          title={
            <>
              Clone <span className="acc">any look</span> from a URL.
            </>
          }
          copy={
            <>
              Paste a TikTok, Reel, or Short, or fork a template — <span className="inl">commercials</span>,{" "}
              <span className="inl">hyper-motion</span>, <span className="inl">horror</span>,{" "}
              <span className="inl">fruit drama</span>, <span className="inl">talking head</span>. Ralphy lifts the
              visual recipe; you keep the words.
            </>
          }
          terminal={
            <TerminalBlock
              title="ralphy clone"
              lines={
                <>
                  <span className="prm">$ </span>
                  {`ralphy clone https://tiktok.com/@x/video/72939...\n`}
                  <span className="dim">  ✓ analyzing visual style ...</span>
                  {"\n"}
                  <span className="dim">  → palette  </span>
                  <span className="acc">cold cinematic · low-key</span>
                  {`\n`}
                  <span className="dim">  → format   </span>
                  <span className="acc">hyper-motion · 6 cuts · 22s</span>
                  {`\n`}
                  <span className="dim">  → hook     </span>
                  <span className="acc">&quot;have you ever ...&quot;</span>
                  {`\n`}
                  <span className="dim">  → music    </span>
                  <span className="acc">drill · 138 bpm</span>
                  {`\n\n`}
                  <span className="ok">{`  ✓ template forked → ./styles/hyper-motion-x/\n`}</span>
                  <span className="cmt">{`# 11 prompts, 4 refs, 1 music slot · ready to render`}</span>
                </>
              }
            />
          }
        />

        <Duo
          kicker="03 · render"
          title={
            <>
              From idea to <span className="acc">finished mp4</span> in ~8 minutes.
            </>
          }
          copy={
            <>
              Image keyframes from <span className="inl">gemini-3-pro</span>, motion from{" "}
              <span className="inl">kling-v3</span> · <span className="inl">veo-3.1</span> ·{" "}
              <span className="inl">seedance-2.0</span>, voice from{" "}
              <span className="inl">eleven-multilingual-v2</span>, composed through{" "}
              <span className="inl">Remotion</span>. Every source file stays on disk.
            </>
          }
          terminal={
            <TerminalBlock
              title="ralphy render"
              lines={
                <>
                  <span className="prm">$ </span>
                  {`ralphy render --product "Linear" --style hyper-motion\n`}
                  <span className="dim">  → planner    </span>
                  <span className="acc">5 shots · 22s total</span>
                  {`\n`}
                  <span className="dim">  → researcher </span>
                  <span className="acc">4 references · 1 hook</span>
                  {`\n`}
                  <span className="dim">  → scenarist  </span>
                  <span className="acc">prompts locked</span>
                  {`\n`}
                  <span className="dim">  → renderer   </span>
                  <span className="acc">gemini-3-pro → kling-v3</span>
                  {`\n`}
                  <span className="dim">  ⠼ rendering shot </span>
                  <span className="acc">03/05</span>
                  <span className="dim"> · ETA 2m 14s</span>
                  {"\n"}
                  <span className="ok">{`  ✓ workspace/linear-001/v01.mp4  (22s · 1080×1920)`}</span>
                </>
              }
            />
          }
        />

        <Duo
          reverse
          kicker="04 · iterate"
          title={
            <>
              Learn from the numbers. <span className="acc">Compound.</span>
            </>
          }
          copy={
            <>
              Plug views, watch-time and conversions back into the project. Ralphy keeps the variants that work and
              quietly retires the ones that don&apos;t — automatically, on the next run. Same agent, smarter every
              cycle.
            </>
          }
          terminal={
            <TerminalBlock
              title="ralphy iterate"
              lines={
                <>
                  <span className="prm">$ </span>
                  {`ralphy iterate --campaign linear-001\n`}
                  <span className="dim">  → pulling 7 days of analytics ...</span>
                  {"\n"}
                  <span className="ok">  ✓ TikTok    </span>
                  <span className="acc">12.4k views</span>
                  <span className="dim"> · CTR </span>
                  <span className="acc">4.2%</span>
                  {`\n`}
                  <span className="ok">  ✓ Reels      </span>
                  <span className="acc">8.1k views</span>
                  <span className="dim"> · CTR </span>
                  <span className="acc">3.6%</span>
                  {`\n`}
                  <span className="ok">  ✓ Shorts     </span>
                  <span className="acc">2.0k views</span>
                  <span className="dim"> · CTR </span>
                  <span className="acc">1.1%</span>
                  {`\n\n`}
                  <span className="dim">  critic suggests:</span>
                  {"\n"}
                  <span className="dim">    • shorter hook (-1.2s)</span>
                  {"\n"}
                  <span className="dim">    • cooler grade (-15° saturation)</span>
                  {"\n"}
                  <span className="dim">    • drop Shorts variant</span>
                  {"\n"}
                  <span className="prm">$ </span>
                  {`ralphy render --remix`}
                </>
              }
            />
          }
        />
      </div>
    </section>
  );
}
