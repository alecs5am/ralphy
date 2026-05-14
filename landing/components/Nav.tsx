import { site, navItems } from "@/lib/data";
import { I } from "./Icons";
import { LogoGlyph } from "./MascotSVG";

export function Nav({ stars }: { stars: string }) {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href="#top">
          <LogoGlyph />
          <span className="nav-name">Ralphy</span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {navItems.map((it) => (
            <a key={it.href} href={it.href}>
              {it.label}
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <a className="nav-ghost" href={site.docs} target="_blank" rel="noopener">
            Docs
          </a>
          <a className="nav-cta" href={site.repo} target="_blank" rel="noopener">
            <I.star /> Star <span className="star-count">{stars}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
