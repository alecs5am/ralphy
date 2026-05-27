// landing/app/library/page.tsx
//
// Prompt library — list view. Server Component; reads guidelines/<slug>/guideline.json
// at build time AND merges the landing's showcase clips as kind=recreate-video
// entries so the library is the single index of remixable Ralphy artefacts.

import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { loadGuidelines } from "@/lib/guidelines-loader";
import { loadShowcaseClips } from "@/lib/library-clips";
import { LibraryListing } from "./LibraryListing";

export const metadata: Metadata = {
  title: "Library · Ralphy",
  description:
    "The remix collection — reproduce a specific Ralphy video and swap any element (subject, brand, character). Plus image-prompt guidelines. Tag-able from chat, search and filter by kind, model, and tag.",
};

export default async function LibraryPage() {
  const stars = await getDisplayStars();
  const entries = [...loadGuidelines(), ...loadShowcaseClips()];

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="pt-24 pb-9">
          <div className="container">
            <p className="eyebrow font-mono text-[11.5px] tracking-[0.16em] uppercase text-vio mb-[18px]">Library · {entries.length}</p>
            <h1 className="font-display font-bold text-[clamp(36px,5.2vw,64px)] tracking-[-0.015em] leading-[1.02] uppercase m-0 mb-[22px] max-w-[22ch]">
              The remix collection.
            </h1>
            <p className="text-[16.5px] leading-[1.55] text-ink-3 m-0 mb-[26px] max-w-[66ch] [&_strong]:text-ink [&_strong]:font-semibold">
              Each video here is one concrete clip you can reproduce. Tag it in
              chat (<code>@template:&lt;slug&gt;</code>) and say what to swap —
              &ldquo;same video, but replace the narrator with my mascot&rdquo;
              — and your agent rebuilds it with your change. Want to make a{" "}
              <em>kind</em> of video instead of copying one? That&apos;s a{" "}
              <a href="/skills" className="text-vio no-underline hover:text-vio-2 hover:underline">skill</a>. This
              page also holds image-prompt{" "}
              <code>@guideline:&lt;slug&gt;</code> rules.
            </p>
          </div>
        </section>

        <section className="pt-9 pb-24">
          <div className="container">
            <LibraryListing entries={entries} />

            <div className="mt-12 px-8 py-7 bg-bg-1 rounded-[20px]">
              <h2 className="font-display font-bold text-[22px] tracking-[-0.005em] uppercase m-0 mb-3.5 text-ink">How remixing works</h2>
              <ol className="m-0 pl-[22px] flex flex-col gap-2.5 text-[14.5px] leading-[1.55] text-ink-2 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:px-1.5 [&_code]:py-px [&_code]:bg-bg-3 [&_code]:text-ink [&_code]:rounded-[5px]">
                <li>
                  Open Claude Code / Cursor / Codex inside a ralphy-installed
                  repo.
                </li>
                <li>
                  Paste the video&apos;s tag{" "}
                  <code>@template:&lt;slug&gt;</code> and state your swap in
                  plain language: &ldquo;make this exact video but replace the
                  product with mine&rdquo; / &ldquo;same clip, swap the actor
                  for a cartoon mascot.&rdquo;
                </li>
                <li>
                  The agent runs <code>ralphy template use &lt;slug&gt;</code>,
                  keeps everything else from the source, and re-runs only the
                  parts your swap touches — then renders your version.
                </li>
                <li>
                  Image-prompt entries work the same way with{" "}
                  <code>@guideline:&lt;slug&gt;</code> — the agent loads the
                  rules before writing your next{" "}
                  <code>ralphy generate image</code> prompt.
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
