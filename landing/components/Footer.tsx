import { site } from "@/lib/data";
import { LogoGlyph } from "./MascotSVG";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container row">
        <div className="flex items-center gap-3">
          <LogoGlyph size={22} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 14,
              color: "var(--ink)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Ralphy
          </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--mute)" }}>· 2026 · MIT</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
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
