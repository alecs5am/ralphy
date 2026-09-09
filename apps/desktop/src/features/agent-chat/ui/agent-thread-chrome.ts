/**
 * The transcript's three class strings, shared by the thread and by the tool rows it folds.
 *
 * `META` is the one that carries a decision: the design's muted grey is #9A9A96, which measures
 * 2.6:1 on the card -- fine for a dot, not for a 9px run of text that says how many calls failed.
 * Informational meta takes the secondary step instead, the same place in the hierarchy, and it
 * passes at 5:1 in both themes.
 */

/* Air between blocks, and the two indents the transcript uses. */
export const BLOCK = "flex min-w-0 flex-col gap-3.25";
/* A mono meta run: a counter, a scope, an account line. */
export const META = "flex-none font-code type-mono-xs tracking-mono text-secondary";
/* A quiet control on a transcript line: copy, retry, open. */
export const LINE_ACTION = "grid size-5.5 flex-none place-items-center rounded-sm bg-transparent text-muted-decorative hover:bg-chat-field hover:text-ink";
