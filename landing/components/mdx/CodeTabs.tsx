"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* CodeTabs — multiple filename-tabs sharing one code panel.
 *
 * Visually extends <CodeBlock filename …>: every tab uses the same tab
 * chrome as a single CodeBlock filename. The active tab connects with
 * the panel below; inactive tabs sit one bg-step darker.
 *
 * Inner <CodeBlock> children stay server-rendered — the highlighted
 * markup is in the HTML, this component only swaps which panel is
 * visible.
 *
 * Usage:
 *   <CodeTabs>
 *     <CodeTab filename="install.sh" lang="bash">
 *       ```bash
 *       brew install …
 *       ```
 *     </CodeTab>
 *     <CodeTab filename="package.json" lang="json">
 *       …
 *     </CodeTab>
 *   </CodeTabs>
 *
 * `filename` is the canonical prop; `label` is accepted as an alias for
 * command-style snippets ("bash" / "npm" / "docker") that aren't real
 * file names.
 */

type TabProps = {
  filename?: ReactNode;
  /** Alias for `filename` — useful for non-file tab labels. */
  label?: ReactNode;
  lang?: ReactNode;
  children: ReactNode;
};

export function CodeTab(_: TabProps): null {
  // Marker — real rendering happens inside CodeTabs.
  return null;
}

export function CodeTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children)
    .filter(isValidElement)
    .map((c) => c as React.ReactElement<TabProps>)
    .filter((c) => {
      const p = c.props as TabProps;
      return (p?.filename ?? p?.label) !== undefined;
    });

  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;

  return (
    <div className="my-8">
      <div
        className="flex items-stretch flex-wrap gap-0.5 pr-3 font-mono text-[12.5px]"
        role="tablist"
      >
        {tabs.map((t, i) => {
          const isActive = i === active;
          const props = t.props;
          const labelText = props.filename ?? props.label;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(i)}
              className={`group pl-4 pr-3.5 py-[9px] rounded-t-[10px] inline-flex items-center gap-2 border-0 cursor-pointer font-[inherit] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-vio focus-visible:[outline-offset:-2px] ${
                isActive
                  ? "bg-bg-2 text-ink"
                  : "bg-bg-1 text-mute hover:bg-bg-3 hover:text-ink-3"
              }`}
            >
              <span
                className={isActive ? "text-vio" : "text-mute-2"}
                aria-hidden
              >
                ›
              </span>
              {labelText}
            </button>
          );
        })}
        {tabs[active]?.props.lang && (
          <span className="ml-auto text-mute px-3.5 py-[9px] self-center">
            {tabs[active]!.props.lang}
          </span>
        )}
      </div>
      <div className="bg-bg-2 text-ink px-[26px] py-[22px] font-mono text-sm leading-[1.7] overflow-x-auto rounded-tr-[14px] rounded-b-[14px] [&_pre]:bg-transparent [&_pre]:m-0 [&_pre]:p-0 [&_pre]:rounded-none">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {tabs[active]!.props.children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
