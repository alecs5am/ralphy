import { Block, Inline, Chip } from "./Block";
import { VideoCard } from "./VideoCard";
import { clips, site } from "@/lib/site";
import { SparkMark, BoltMark, CheckMark } from "./icons";

export function Gallery() {
  return (
    <section id="gallery" className="relative">
      <div className="mx-auto max-w-[1280px] px-7">
        <Block
          n="06"
          title={
            <>
              100% AI. Twelve renders.
              <br />
              <em>Auto-playing.</em>
            </>
          }
          lede={
            <>
              Vertical clips from the <Inline>ralphy-showcase</Inline> profile.
              Image keyframes from <Inline>gemini-3-pro</Inline>, motion from{" "}
              <Inline>kling-v3</Inline> · <Inline>veo-3.1</Inline> ·{" "}
              <Inline>seedance</Inline>, voice from{" "}
              <Inline>eleven-multilingual-v2</Inline>.{" "}
              <a
                href={`${site.repo}/tree/main/profiles/ralphy-showcase`}
                target="_blank"
                rel="noopener"
                className="text-[var(--color-cyan)] underline-offset-4 hover:underline"
              >
                See the profile →
              </a>
            </>
          }
        >
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Chip icon={<SparkMark />} label="all renders < 10 min each" />
            <Chip icon={<BoltMark />} label="< $1 / clip in API costs" />
            <Chip icon={<CheckMark />} label="zero post-production" />
            <Chip muted label="profile · ralphy-showcase" />
          </div>

          <div className="-mx-7 overflow-x-auto px-7 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:overflow-visible md:px-0">
            <div className="grid auto-cols-[78%] grid-flow-col gap-4 snap-x snap-mandatory pb-2 sm:auto-cols-[58%] md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:snap-none lg:grid-cols-4 lg:gap-5 xl:grid-cols-6">
              {clips.map((c, i) => (
                <div key={c.id} className="snap-start md:snap-none">
                  <VideoCard clip={c} eager={i < 3} />
                </div>
              ))}
            </div>
          </div>

          <p
            className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-mute)] md:hidden"
            style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.06em" }}
          >
            <span className="pulse-dot" />
            swipe for all 12 →
          </p>
        </Block>
      </div>
    </section>
  );
}
