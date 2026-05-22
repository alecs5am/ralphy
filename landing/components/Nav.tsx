"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { site, navItems, type NavItem } from "@/lib/data";
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
  const [open, setOpen] = useState(false);

  /* Body-scroll lock while the mobile sheet is open. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* Escape closes the sheet (keyboard parity with click-outside). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* Same items render in the desktop row and the mobile sheet on every
   * page. Returning home is the logo's job. Docs gets its own row at
   * the bottom of the sheet (it's external, so it doesn't fit the
   * inline pill on mobile). */
  const sheetItems: { href: string; label: string; external?: boolean }[] = [
    ...navItems,
    { href: site.docs, label: "Docs", external: true },
  ];

  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href={isSubpage ? "/" : "#top"}>
          <LogoGlyph />
          <span className="nav-name">Ralphy</span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {navItems.map((it) => (
            <a key={`${it.href}-${it.label}`} href={it.href} className="nav-link">
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
          <button
            type="button"
            className={`nav-burger ${open ? "is-open" : ""}`}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => setOpen((v) => !v)}
          >
            <Burger open={open} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              key="scrim"
              type="button"
              className="nav-scrim"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            <motion.div
              key="sheet"
              id="nav-sheet"
              className="nav-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              initial={{ opacity: 0, y: -16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.985 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="nav-sheet-header">
                <span className="nav-sheet-title">Menu</span>
                <button
                  type="button"
                  className="nav-sheet-close"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>
              <motion.ul
                className="nav-sheet-list"
                initial="closed"
                animate="open"
                exit="closed"
                variants={{
                  open: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
                  closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
                }}
              >
                {sheetItems.map((it) => (
                  <motion.li
                    key={`${it.href}-${it.label}`}
                    variants={{
                      open: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
                      closed: { opacity: 0, y: -8, transition: { duration: 0.18 } },
                    }}
                  >
                    <a
                      href={it.href}
                      target={it.external ? "_blank" : undefined}
                      rel={it.external ? "noopener" : undefined}
                      onClick={() => setOpen(false)}
                      className="nav-sheet-item"
                    >
                      <span className="nav-sheet-item-label">{it.label}</span>
                      <span className="nav-sheet-arrow" aria-hidden>
                        →
                      </span>
                    </a>
                  </motion.li>
                ))}
                <motion.li
                  className="nav-sheet-cta-row"
                  variants={{
                    open: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
                    closed: { opacity: 0, y: -8, transition: { duration: 0.18 } },
                  }}
                >
                  <a
                    className="nav-sheet-cta"
                    href={site.repo}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                  >
                    <I.star /> Star on GitHub
                    <span className="nav-sheet-cta-count">{stars}</span>
                  </a>
                </motion.li>
              </motion.ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

/* Two-bar burger that morphs into an X. Stroke linecap rounded so the
 * X reads as binary-geometry per BRAND_DESIGN §3. */
function Burger({ open }: { open: boolean }) {
  const TOP = open ? { y: 9, rotate: 45 } : { y: 4, rotate: 0 };
  const BOT = open ? { y: 9, rotate: -45 } : { y: 14, rotate: 0 };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      <motion.line
        x1="3"
        x2="19"
        y1="0"
        y2="0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        initial={false}
        animate={TOP}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={{ originX: "50%", originY: "50%" }}
      />
      <motion.line
        x1="3"
        x2="19"
        y1="0"
        y2="0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        initial={false}
        animate={BOT}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={{ originX: "50%", originY: "50%" }}
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <line x1="3" y1="3" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="15" y1="3" x2="3" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
