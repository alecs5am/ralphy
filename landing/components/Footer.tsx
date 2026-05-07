import Image from "next/image";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="relative z-10 mt-12 border-t border-[var(--color-line)] py-12 text-[13px] text-[var(--color-mute)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-7">
        <div className="flex items-center gap-3">
          <span className="relative h-8 w-8 overflow-hidden rounded-[4px] border border-[var(--color-line-2)]">
            <Image
              src="/bg/hero.png"
              alt=""
              fill
              sizes="32px"
              className="scale-[2.2] object-cover"
              style={{ objectPosition: "50% 32%" }}
            />
          </span>
          <span style={{ fontFamily: "var(--font-pixel)", letterSpacing: "0.08em" }}>
            <b className="font-normal text-[var(--color-frost)]">RALPHY</b>{" "}
            <span className="text-[var(--color-mute)]">·</span>{" "}
            <span className="text-[var(--color-mute)]">2026 · MIT</span>
          </span>
        </div>
        <nav className="flex flex-wrap gap-6" aria-label="Footer">
          <a className="hover:text-[var(--color-frost)]" href={site.repo} target="_blank" rel="noopener">
            GitHub
          </a>
          <a className="hover:text-[var(--color-frost)]" href={site.docs} target="_blank" rel="noopener">
            Docs
          </a>
          <a className="hover:text-[var(--color-frost)]" href={site.discord} target="_blank" rel="noopener">
            Discord
          </a>
          <a className="hover:text-[var(--color-frost)]" href={site.x} target="_blank" rel="noopener">
            X
          </a>
        </nav>
      </div>
    </footer>
  );
}
