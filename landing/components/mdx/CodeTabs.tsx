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
    <div className="mdx-codeblock mdx-codetabs">
      <div className="mdx-codeblock-bar mdx-codetabs-bar" role="tablist">
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
              className={`mdx-codeblock-tab mdx-codetabs-tab ${
                isActive ? "is-active" : ""
              }`}
            >
              <span className="ic" aria-hidden>
                ›
              </span>
              {labelText}
            </button>
          );
        })}
        {tabs[active]?.props.lang && (
          <span className="mdx-codeblock-meta">{tabs[active]!.props.lang}</span>
        )}
      </div>
      <div className="mdx-codetabs-panel">
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
