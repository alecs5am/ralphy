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
    <main className="container" style={{ padding: "4rem 1rem" }}>
      <header style={{ marginBottom: "3rem" }}>
        <p className="eyebrow" style={{ opacity: 0.6, fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Templates · {rows.length}
        </p>
        <h1 style={{ fontSize: "3rem", fontWeight: 700, margin: "0.5rem 0 1rem" }}>
          Every vibe template that ships in the binary.
        </h1>
        <p style={{ fontSize: "1.1rem", opacity: 0.75, maxWidth: "60ch", lineHeight: 1.6 }}>
          Two kinds: <strong>vibe-reference</strong> (full production templates with composition.md + reference mp4)
          and <strong>vibe-style</strong> (prompt cookbooks with hooks + camera vocab + worked examples). Workspace
          templates override repo on id collision.
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: "0.95rem", opacity: 0.7 }}>
          Try one:{" "}
          <code style={{ background: "var(--bg-2)", padding: "0.2rem 0.5rem", borderRadius: 4 }}>
            ralphy template suggest &quot;your brief here&quot;
          </code>
        </p>
      </header>

      {grouped.map((group) => (
        <section key={group.category} style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {group.label} <span style={{ opacity: 0.5, fontWeight: 400 }}>({group.rows.length})</span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
              marginTop: "1.5rem",
            }}
          >
            {group.rows.map((row) => (
              <Link
                key={row.slug}
                href={`${REPO_BASE}${row.sourcePath}`}
                target="_blank"
                rel="noopener"
                style={{
                  display: "block",
                  padding: "1.25rem",
                  background: "var(--bg-1)",
                  border: "1px solid var(--line-2, rgba(255,255,255,0.08))",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 180ms ease, border-color 180ms ease",
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    opacity: 0.5,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                  }}
                >
                  {row.kind}
                  {row.estimatedCostUsd !== undefined && <> · ~${row.estimatedCostUsd.toFixed(2)}</>}
                  {row.durationSec !== undefined && <> · {row.durationSec}s</>}
                </div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>{row.name}</h3>
                <code
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    opacity: 0.55,
                    margin: "0.25rem 0 0.75rem",
                  }}
                >
                  {row.slug}
                </code>
                <p
                  style={{
                    fontSize: "0.85rem",
                    opacity: 0.75,
                    lineHeight: 1.5,
                    margin: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {row.description.slice(0, 220) || "—"}
                </p>
                {row.tags.length > 0 && (
                  <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {row.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.15rem 0.45rem",
                          background: "var(--bg-2)",
                          opacity: 0.7,
                          borderRadius: 3,
                        }}
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

      <footer style={{ marginTop: "4rem", padding: "2rem 0", borderTop: "1px solid var(--line-2, rgba(255,255,255,0.08))" }}>
        <p style={{ opacity: 0.6 }}>
          Templates index is rebuilt at every landing deploy from{" "}
          <code>templates/&lt;category&gt;/&lt;slug&gt;/template.json</code>. Edit the JSON to update what shows here.
          See the{" "}
          <a href={`${REPO_BASE}templates/CATEGORIES.md`} target="_blank" rel="noopener" style={{ color: "var(--vio)" }}>
            full roster on GitHub
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
