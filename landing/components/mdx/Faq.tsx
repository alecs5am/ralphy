"use client";

import {
  Children,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

/* FAQ — single-open accordion with framer-motion height/opacity
   crossfade. Replaces the native <details name="faq"> implementation
   (which had no transition).

   FaqItem children pass through unchanged. Item state lives in the
   parent FAQ; the group prop is kept for back-compat but unused. */

type ItemProps = { q: ReactNode; open?: boolean; children: ReactNode };

export function FaqItem(_: ItemProps): null {
  // Marker — actual rendering happens inside FAQ.
  return null;
}

export function FAQ({
  children,
  group,
}: {
  children: ReactNode;
  /** Back-compat alias from the native-details API; ignored here. */
  group?: string;
}) {
  void group;
  const items = Children.toArray(children)
    .filter(isValidElement)
    .map((c) => c as React.ReactElement<ItemProps>)
    .filter((c) => (c.props as ItemProps)?.q !== undefined);

  const initial = items.findIndex((i) => i.props.open === true);
  const [openIdx, setOpenIdx] = useState<number | null>(
    initial === -1 ? null : initial,
  );

  // Prefers-reduced-motion respects the OS pref and disables height anim.
  const reduce = useReducedMotion();

  if (items.length === 0) return null;

  return (
    <div className="mdx-faq" role="list">
      {items.map((it, i) => {
        const isOpen = openIdx === i;
        return (
          <AccordionRow
            key={i}
            index={i}
            q={it.props.q}
            isOpen={isOpen}
            reduce={reduce ?? false}
            onToggle={() => setOpenIdx(isOpen ? null : i)}
          >
            {it.props.children}
          </AccordionRow>
        );
      })}
    </div>
  );
}

function AccordionRow({
  q,
  isOpen,
  reduce,
  onToggle,
  children,
}: {
  index: number;
  q: ReactNode;
  isOpen: boolean;
  reduce: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const buttonId = useId();
  return (
    <div className="mdx-faq-item" data-open={isOpen ? "true" : "false"}>
      <button
        id={buttonId}
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={onToggle}
        className="mdx-faq-q"
      >
        <motion.span
          className="mdx-faq-chev"
          aria-hidden
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          ›
        </motion.span>
        <span>{q}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            key="panel"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.2, ease: "easeOut" },
            }}
            style={{ overflow: "hidden" }}
          >
            <div className="mdx-faq-a">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

