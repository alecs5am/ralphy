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
    <header className="sticky top-[14px] z-50 flex justify-center px-4 pointer-events-none max-[720px]:top-[10px] max-[720px]:px-[10px]">
      <div className="pointer-events-auto flex items-center justify-between gap-[18px] w-full max-w-[1240px] py-[10px] pr-[10px] pl-[22px] bg-bg-1 rounded-full max-[720px]:py-2 max-[720px]:pr-2 max-[720px]:pl-4 max-[720px]:gap-[10px]">
        <a className="inline-flex items-center gap-[10px] shrink-0 leading-none" href={isSubpage ? "/" : "#top"}>
          <LogoGlyph />
          <span className="font-display font-bold text-[18px] tracking-[0.04em] text-ink uppercase leading-none inline-flex items-center">Ralphy</span>
        </a>
        <nav
          className="hidden min-[1200px]:flex items-center gap-0.5"
          aria-label="Primary"
        >
          {navItems.map((it) => (
            <a
              key={`${it.href}-${it.label}`}
              href={it.href}
              className="inline-flex items-center gap-[7px] px-[14px] py-2 rounded-full text-[14px] font-medium tracking-[-0.005em] text-ink-2 bg-transparent no-underline transition-colors hover:text-ink"
            >
              {it.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <a
            className="inline-flex items-center gap-[7px] px-4 py-[10px] text-ink-2 rounded-full font-medium text-[14px] bg-transparent transition-colors max-[720px]:hidden hover:bg-bg-2 hover:text-ink"
            href={site.docs}
            target="_blank"
            rel="noopener"
          >
            Docs
          </a>
          <a
            className="group relative isolate inline-flex items-center gap-[9px] py-2.5 px-[18px] rounded-full font-semibold text-[14px] tracking-[0.01em] overflow-hidden bg-ink text-bg no-underline transition-colors duration-[1100ms] hover:text-bg max-[720px]:hidden before:content-[''] before:absolute before:left-1/2 before:bottom-0 before:w-[220%] before:aspect-square before:bg-vio before:rounded-full before:-z-10 before:origin-center before:[transform:translate(-50%,60%)_scale(0)] before:[transition:transform_1120ms_cubic-bezier(0.34,1.56,0.64,1)] hover:before:[transform:translate(-50%,60%)_scale(1)]"
            href={site.repo}
            target="_blank"
            rel="noopener"
          >
            <I.star /> Star{" "}
            <span className="font-mono py-0.5 px-[7px] rounded-full text-[12px] tracking-normal bg-[rgb(0_0_0/0.18)] transition-[background] duration-[1100ms] group-hover:bg-[rgb(0_0_0/0.22)]">
              {stars}
            </span>
          </a>
          <button
            type="button"
            className={`inline-flex items-center justify-center w-10 h-10 rounded-full cursor-pointer shrink-0 transition-colors min-[1200px]:hidden ${
              open ? "bg-ink text-bg" : "bg-bg-2 text-ink hover:bg-bg-3"
            }`}
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
              className="fixed inset-0 z-40 bg-[rgb(0_0_0/0.6)] backdrop-blur-[2px] cursor-pointer p-0 pointer-events-auto min-[1200px]:hidden"
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
              className="fixed top-[76px] left-4 right-4 z-[60] max-w-[520px] mx-auto p-3 bg-bg-1 rounded-[22px] max-h-[calc(100dvh-100px)] overflow-y-auto pointer-events-auto min-[1200px]:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              initial={{ opacity: 0, y: -16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.985 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between pt-1.5 px-2.5 pb-3">
                <span className="font-mono text-[11px] tracking-[0.16em] text-mute uppercase">Menu</span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full cursor-pointer bg-bg-2 text-ink-2 transition-[background,color,transform] duration-[160ms] hover:bg-bg-3 hover:text-ink hover:rotate-90"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>
              <motion.ul
                className="list-none m-0 p-0 flex flex-col gap-1"
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
                      className="group flex items-center justify-between gap-3 py-4 px-[18px] rounded-[14px] font-display font-semibold text-[17px] tracking-[0.005em] uppercase no-underline bg-bg-2 text-ink transition-[background,transform] duration-[160ms] hover:bg-bg-3 hover:translate-x-0.5"
                    >
                      <span className="inline-flex items-center gap-2.5">{it.label}</span>
                      <span
                        className="font-mono text-mute transition-[transform,color] duration-200 group-hover:text-vio group-hover:translate-x-[3px]"
                        aria-hidden
                      >
                        →
                      </span>
                    </a>
                  </motion.li>
                ))}
                <motion.li
                  className="mt-2.5"
                  variants={{
                    open: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
                    closed: { opacity: 0, y: -8, transition: { duration: 0.18 } },
                  }}
                >
                  <a
                    className="flex items-center justify-center gap-2.5 py-4 px-[18px] bg-ink text-bg rounded-[14px] font-bold text-[15px] tracking-[0.01em] no-underline"
                    href={site.repo}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setOpen(false)}
                  >
                    <I.star /> Star on GitHub
                    <span className="font-mono text-[12px] py-[3px] px-[9px] bg-bg text-ink rounded-full font-medium tracking-normal">
                      {stars}
                    </span>
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
