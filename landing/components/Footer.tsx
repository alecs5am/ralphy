import { site } from "@/lib/data";
import { LogoGlyph } from "./MascotSVG";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line py-10 text-mute text-[13px]">
      <div className="container flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <LogoGlyph size={22} />
          <span className="font-display font-extrabold text-[14px] text-ink uppercase tracking-[0.5px]">
            Ralphy
          </span>
          <span className="font-mono text-mute">· 2026 · MIT</span>
        </div>
        <nav className="flex flex-wrap gap-6 [&_a:hover]:text-ink" aria-label="Footer">
          <a href={site.repo} target="_blank" rel="noopener">
            GitHub
          </a>
          <a href={site.docs} target="_blank" rel="noopener">
            Docs
          </a>
          <a href={site.discord} target="_blank" rel="noopener">
            Discord
          </a>
          <a href={site.x} target="_blank" rel="noopener">
            X
          </a>
          <a href="#how">How it works</a>
        </nav>
      </div>
    </footer>
  );
}
