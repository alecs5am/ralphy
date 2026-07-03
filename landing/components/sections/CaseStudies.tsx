import { ArrowRight } from "lucide-react";
import { SectionHead } from "../SectionPrimitives";

export function CaseStudies() {
  return (
    <section id="cases" className="scroll-mt-28 pt-20 pb-10">
      <div className="container container-w-1480">
        <SectionHead
          eyebrow="case study"
          title={
            <>
              The first account test got <span className="acc">$0.27 CPM.</span>
            </>
          }
          sub="My first two weeks posting to Instagram with an old personal account: no paid distribution, no agency. The full story lives in the case study."
        />

        <div className="mx-auto max-w-[980px]">
          <a
            href="/blog/instagram-027-cpm-first-two-weeks"
            className="group relative block overflow-hidden rounded-[8px] border border-line bg-bg-1 no-underline"
          >
            <img
              src="/assets/cases/june-proof/grid.webp"
              alt="Anonymized grid of short-form posts from the case study"
              className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-30 blur-[1px] saturate-[0.68] transition-transform duration-500 group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_10_11/.97),rgb(10_10_11/.86)_58%,rgb(10_10_11/.66))]" />
            <div className="relative z-10 p-7 max-[640px]:p-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-[6px] border border-line-2 bg-bg/70 px-3 py-2 font-mono text-[11px] uppercase text-vio">
                June Instagram proof
              </div>
              <div className="mt-6 max-w-[720px]">
                <h3 className="m-0 font-display text-[clamp(28px,3.8vw,48px)] font-bold uppercase leading-[1.02] tracking-[-0.02em] text-ink">
                  How I got $0.27 CPM in my first two weeks posting to Instagram.
                </h3>
                <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-ink-3">
                  I took an old personal Instagram account where most followers were just friends, produced 8 videos with Ralphy, spent $131.77 on tokens, and got 484,784 views in the first half of June.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-vio px-5 py-3 font-sans text-[14px] font-semibold text-bg transition-transform duration-200 group-hover:translate-x-1">
                  Read the case study
                  <ArrowRight size={17} />
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
