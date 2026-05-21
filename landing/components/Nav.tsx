import { site, navItems } from "@/lib/data";
import { I } from "./Icons";
import { LogoGlyph } from "./MascotSVG";

type NavVariant = "home" | "subpage";

export function Nav({
  stars,
  variant = "home",
}: {
  stars: string;
  variant?: NavVariant;
}) {
  const isSubpage = variant === "subpage";

  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href={isSubpage ? "/" : "#top"}>
          <LogoGlyph />
          <span className="nav-name">Ralphy</span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {isSubpage ? (
            <a className="nav-back" href="/">
              <span className="nav-back-arrow" aria-hidden="true">
                ←
              </span>
              Back to landing
            </a>
          ) : (
            <>
              {navItems.map((it) => (
                <a key={it.href} href={it.href}>
                  {it.label}
                </a>
              ))}
              <a className="nav-skills" href="/skills">
                <span className="nav-skills-dot" aria-hidden="true" />
                Skills
              </a>
            </>
          )}
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
