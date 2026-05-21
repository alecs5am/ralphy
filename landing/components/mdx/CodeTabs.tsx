"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* CodeTabs — tabbed code-block group with framer-motion crossfade
   between panels. Client component (state + framer-motion runtime),
   but the inner <CodeBlock> children stay server-rendered (the
   highlighted markup arrives in the HTML).

   Usage:
     <CodeTabs>
       <CodeTab label="bash"> ```bash …``` </CodeTab>
       <CodeTab label="ts">   ```ts   …``` </CodeTab>
     </CodeTabs>
*/

type TabProps = { label: string; children: ReactNode };

export function CodeTab(_: TabProps): null {
  // Marker component — real rendering happens inside CodeTabs based on
  // sibling label/children pairs.
  return null;
}

export function CodeTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children)
    .filter(isValidElement)
    .map((c) => c as React.ReactElement<TabProps>)
    .filter((c) => (c.props as TabProps)?.label !== undefined);

  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;

  return (
    <div className="mdx-codetabs">
      <div className="mdx-codetabs-bar" role="tablist">
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <button
              key={t.props.label + i}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(i)}
              className={`mdx-codetabs-tab ${isActive ? "is-active" : ""}`}
            >
              <span className="dot" aria-hidden />
              {t.props.label}
            </button>
          );
        })}
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
