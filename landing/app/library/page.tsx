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
    "Prompt-library guidelines + remixable video templates. Tag-able from chat, copy-pasted by your coding agent. Search and filter by kind, model, and tag.",
};

export default async function LibraryPage() {
  const stars = await getDisplayStars();
  const entries = [...loadGuidelines(), ...loadShowcaseClips()];

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="skills-hero">
          <div className="container">
            <p className="eyebrow">Library · {entries.length}</p>
            <h1 className="skills-h1">
              Prompt guidelines and remixable videos, one tag away.
            </h1>
            <p className="skills-sub">
              Tag any of these in chat (<code>@guideline:&lt;slug&gt;</code> or{" "}
              <code>@template:&lt;slug&gt;</code>) and your coding agent
              pulls the recipe in before drafting prompts or scaffolding a
              project. Image-prompt guidelines codify the rules; video remixes
              are full vibe-references you brief end-to-end.
            </p>
          </div>
        </section>

        <section className="skills-body">
          <div className="container">
            <LibraryListing entries={entries} />

            <div className="skill-how">
              <h2 className="skill-how-title">How it works</h2>
              <ol className="skill-how-list">
                <li>
                  Open Claude Code / Cursor / Codex inside the ralphy repo.
                </li>
                <li>
                  Paste <code>@guideline:&lt;slug&gt;</code> (image rules) or{" "}
                  <code>@template:&lt;slug&gt;</code> (full video) into the
                  chat. The agent runs the matching{" "}
                  <code>ralphy guideline show</code> or{" "}
                  <code>ralphy template use</code> and loads the recipe.
                </li>
                <li>
                  For image guidelines the agent then writes a{" "}
                  <code>ralphy generate image</code> prompt using the rules.
                  For video templates it scaffolds a project and asks for
                  your brief — your subject, your story, the template&apos;s
                  vibe.
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
