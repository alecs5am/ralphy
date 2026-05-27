"use client";

import { useState } from "react";
import { roadmap } from "@/lib/data";
import { SectionHead } from "../SectionPrimitives";

function CheckIcon() {
  return (
    <svg
      className="shrink-0 text-vio mt-px"
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

        <div className="grid grid-cols-1 gap-3" role="list">
          {roadmap.map((cat) => {
            const isOpen = openSlug === cat.slug;
            return (
              <article
                key={cat.slug}
                id={`roadmap-${cat.slug}`}
                className="bg-bg-1 rounded-[20px] overflow-hidden transition-colors"
                role="listitem"
              >
                <button
                  type="button"
                  className={`appearance-none bg-transparent text-inherit font-[inherit] text-left w-full cursor-pointer grid grid-cols-[1fr_auto] items-start gap-6 py-7 px-[30px] max-[720px]:p-[22px] transition-colors focus-visible:outline-2 focus-visible:outline-vio focus-visible:[outline-offset:-2px] ${
                    isOpen ? "" : "hover:bg-bg-2"
                  }`}
                  aria-expanded={isOpen}
                  aria-controls={`roadmap-body-${cat.slug}`}
                  onClick={() => setOpenSlug(isOpen ? null : cat.slug)}
                >
                  <div className="flex flex-col gap-[10px] min-w-0">
                    <h3 className="font-display font-bold text-[28px] max-[720px]:text-[22px] tracking-[-0.01em] text-ink uppercase m-0 leading-[1.05]">{cat.title}</h3>
                    <p className="text-[14.5px] max-[720px]:text-[13.5px] text-ink-3 leading-[1.55] m-0 max-w-[80ch]">{cat.why}</p>
                  </div>
                  <span
                    className={`grid place-items-center w-[38px] h-[38px] rounded-[10px] font-mono text-[14px] font-bold shrink-0 transition-colors ${
                      isOpen ? "bg-vio text-bg" : "bg-bg-3 text-ink"
                    }`}
                    aria-hidden
                  >
                    {cat.n}
                  </span>
                </button>

                <div
                  id={`roadmap-body-${cat.slug}`}
                  className={`grid transition-[grid-template-rows] duration-[280ms] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  role="region"
                  aria-hidden={!isOpen}
                >
                  <div className="overflow-hidden min-h-0">
                    <div className="grid grid-cols-3 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1 gap-2 pt-2 px-6 pb-7 max-[720px]:pt-1 max-[720px]:px-[18px] max-[720px]:pb-[22px]">
                      {cat.items.map((item) => {
                        const planned = item.status === "planned";
                        return (
                          <div
                            key={item.title}
                            className="bg-bg-2 rounded-[14px] p-[22px_24px] max-[720px]:p-[18px_20px] flex flex-col gap-[10px] min-h-[155px] max-[720px]:min-h-0"
                          >
                            {item.status === "in-progress" && (
                              <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-vio-2 px-[9px] py-[3px] rounded-full self-start bg-[rgba(232,123,161,0.12)]">
                                in progress
                              </span>
                            )}
                            <div className="flex items-start gap-2">
                              {item.status === "done" && <CheckIcon />}
                              <h4 className={`font-display font-bold text-[14.5px] tracking-[0.005em] text-ink uppercase m-0 leading-[1.3] ${planned ? "opacity-70" : ""}`}>{item.title}</h4>
                            </div>
                            <p className={`text-[14px] text-ink-3 leading-[1.55] m-0 ${planned ? "opacity-70" : ""}`}>{item.copy}</p>
                          </div>
                        );
                      })}
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
