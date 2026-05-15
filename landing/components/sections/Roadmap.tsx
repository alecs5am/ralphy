"use client";

import { useState } from "react";
import { roadmap } from "@/lib/data";
import { SectionHead } from "../SectionPrimitives";

function CheckIcon() {
  return (
    <svg
      className="roadmap-mini-check"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-label="done"
    >
      <path
        d="M3 8.5L6.5 12L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Roadmap() {
  const [openSlug, setOpenSlug] = useState<string | null>(roadmap[0]?.slug ?? null);

  return (
    <section id="roadmap">
      <div className="container">
        <SectionHead
          eyebrow="roadmap"
          title={
            <>
              Max quality. <span className="acc">Min attention.</span>
            </>
          }
          sub="Two axes drive every shipping decision: how good is the output, and how little of your time did it cost. Five categories, click to expand."
        />

        <div className="roadmap-list" role="list">
          {roadmap.map((cat) => {
            const isOpen = openSlug === cat.slug;
            return (
              <article
                key={cat.slug}
                id={`roadmap-${cat.slug}`}
                className={`roadmap-card ${isOpen ? "is-open" : ""}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="roadmap-card-head"
                  aria-expanded={isOpen}
                  aria-controls={`roadmap-body-${cat.slug}`}
                  onClick={() => setOpenSlug(isOpen ? null : cat.slug)}
                >
                  <div className="roadmap-card-head-text">
                    <h3 className="roadmap-card-title">{cat.title}</h3>
                    <p className="roadmap-card-why">{cat.why}</p>
                  </div>
                  <span className="roadmap-card-num" aria-hidden>
                    {cat.n}
                  </span>
                </button>

                <div
                  id={`roadmap-body-${cat.slug}`}
                  className="roadmap-card-body"
                  role="region"
                  aria-hidden={!isOpen}
                >
                  <div className="roadmap-card-body-inner">
                    <div className="roadmap-grid">
                      {cat.items.map((item) => (
                        <div key={item.title} className={`roadmap-mini is-${item.status}`}>
                          {item.status === "in-progress" && (
                            <span className="roadmap-mini-tag">in progress</span>
                          )}
                          <div className="roadmap-mini-title-row">
                            {item.status === "done" && <CheckIcon />}
                            <h4 className="roadmap-mini-title">{item.title}</h4>
                          </div>
                          <p className="roadmap-mini-copy">{item.copy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
