// landing/app/templates/page.tsx
//
// Templates gallery page (07.07.01). Server Component — reads
// templates/<category>/<slug>/template.json at build time and renders a
// category-grouped grid. Filter UI is client-side via URL search params.
//
// Each row links to the GitHub source so users can read the composition.md
// and `template use <slug>` patterns directly.

import type { Metadata } from "next";
import Link from "next/link";
import { loadTemplates, groupByCategory } from "@/lib/templates-loader";

export const metadata: Metadata = {
  title: "Templates · Ralphy",
  description:
    "55 built-in vibe templates organized by segment-persona category. Picks for B2B SaaS, DTC commerce, creator lifestyle, entertainment-viral, and cinematic-narrative.",
};

const REPO_BASE = "https://github.com/alecs5am/ralphy/blob/main/";

export default function TemplatesPage() {
  const rows = loadTemplates();
  const grouped = groupByCategory(rows);

  return (
    <main className="container !px-4 py-16">
      <header className="mb-12">
        <p className="eyebrow opacity-60 text-[0.8rem] tracking-[0.1em] uppercase">
          Templates · {rows.length}
        </p>
        <h1 className="text-[3rem] font-bold m-0 mt-2 mb-4">
          Every vibe template that ships in the binary.
        </h1>
        <p className="text-[1.1rem] opacity-75 max-w-[60ch] leading-[1.6]">
          Two kinds: <strong>vibe-reference</strong> (full production templates with composition.md + reference mp4)
          and <strong>vibe-style</strong> (prompt cookbooks with hooks + camera vocab + worked examples). Workspace
          templates override repo on id collision.
        </p>
        <p className="mt-6 text-[0.95rem] opacity-70">
          Try one:{" "}
          <code className="bg-bg-2 px-2 py-1 rounded">
            ralphy template suggest &quot;your brief here&quot;
          </code>
        </p>
      </header>

      {grouped.map((group) => (
        <section key={group.category} className="mb-16">
          <h2 className="text-[1.5rem] font-bold mb-2">
            {group.label} <span className="opacity-50 font-normal">({group.rows.length})</span>
          </h2>
          <div className="grid gap-4 mt-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {group.rows.map((row) => (
              <Link
                key={row.slug}
                href={`${REPO_BASE}${row.sourcePath}`}
                target="_blank"
                rel="noopener"
                className="block p-5 bg-bg-1 rounded-lg no-underline text-inherit transition-colors duration-[180ms] hover:bg-bg-2"
              >
                <div className="text-[0.7rem] opacity-50 tracking-[0.08em] uppercase mb-2">
                  {row.kind}
                  {row.estimatedCostUsd !== undefined && <> · ~${row.estimatedCostUsd.toFixed(2)}</>}
                  {row.durationSec !== undefined && <> · {row.durationSec}s</>}
                </div>
                <h3 className="text-[1.05rem] font-semibold m-0">{row.name}</h3>
                <code className="block text-[0.75rem] opacity-55 mt-1 mb-3">
                  {row.slug}
                </code>
                <p className="text-[0.85rem] opacity-75 leading-[1.5] m-0 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical]">
                  {row.description.slice(0, 220) || "—"}
                </p>
                {row.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {row.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-[0.65rem] px-[0.45rem] py-[0.15rem] bg-bg-2 opacity-70 rounded-[3px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-16 py-8 [box-shadow:inset_0_1px_0_var(--color-line)]">
        <p className="opacity-60">
          Templates index is rebuilt at every landing deploy from{" "}
          <code>templates/&lt;category&gt;/&lt;slug&gt;/template.json</code>. Edit the JSON to update what shows here.
          See the{" "}
          <a href={`${REPO_BASE}templates/CATEGORIES.md`} target="_blank" rel="noopener" className="text-vio">
            full roster on GitHub
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
