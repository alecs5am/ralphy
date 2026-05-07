import Image from "next/image";
import Link from "next/link";
import { nav, site } from "@/lib/site";
import { StarIcon } from "./icons";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-[rgb(6_9_15/0.6)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-7 py-3.5">
        <Link href="#top" className="flex items-center gap-3">
          <span className="relative h-8 w-8 overflow-hidden rounded-[4px] border border-[var(--color-line-2)]">
            <Image
              src="/bg/hero.png"
              alt=""
              fill
              sizes="32px"
              className="scale-[2.2] object-cover"
              style={{ objectPosition: "50% 32%" }}
              priority
            />
          </span>
          <span className="font-pixel text-[18px] tracking-[0.08em]" style={{ fontFamily: "var(--font-pixel)" }}>
            <b className="font-normal text-[var(--color-frost)]">RALPHY</b>
            <span className="text-[var(--color-cyan)]"> · </span>
            <span className="text-[var(--color-cyan)]">v2</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-[var(--color-mute)] lg:flex" aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3.5 py-2 transition hover:bg-[rgb(61_216_255/0.08)] hover:text-[var(--color-frost)]"
            >
              {item.label}
            </a>
          ))}
          <a
            href={site.docs}
            target="_blank"
            rel="noopener"
            className="rounded-md px-3.5 py-2 transition hover:bg-[rgb(61_216_255/0.08)] hover:text-[var(--color-frost)]"
          >
            Docs
          </a>
        </nav>

        <a
          className="btn btn-primary"
          href={site.repo}
          target="_blank"
          rel="noopener"
          aria-label="Star Ralphy on GitHub"
        >
          <StarIcon />
          Star
          <span className="star-count">{site.stars}</span>
        </a>
      </div>
    </header>
  );
}
