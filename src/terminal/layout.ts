export type TerminalSplitAxis = "row" | "column";
export type TerminalDropPlacement = "top" | "right" | "bottom" | "left";

export interface TerminalLeaf {
  kind: "leaf";
  id: string;
  tabs: string[];
  activeId: string | null;
}

export interface TerminalSplit {
  kind: "split";
  id: string;
  axis: TerminalSplitAxis;
  ratio: number;
  first: TerminalLayoutNode;
  second: TerminalLayoutNode;
}

export type TerminalLayoutNode = TerminalLeaf | TerminalSplit;

export function createTerminalLayout(): TerminalLeaf {
  return {
    kind: "leaf",
    id: "terminal-root",
    tabs: [],
    activeId: null,
  };
}

function findLeaf(
  node: TerminalLayoutNode,
  predicate: (leaf: TerminalLeaf) => boolean,
): TerminalLeaf | null {
  if (node.kind === "leaf") return predicate(node) ? node : null;
  return findLeaf(node.first, predicate) ?? findLeaf(node.second, predicate);
}

function replaceLeaf(
  node: TerminalLayoutNode,
  leafId: string,
  replace: (leaf: TerminalLeaf) => TerminalLayoutNode,
): TerminalLayoutNode {
  if (node.kind === "leaf") return node.id === leafId ? replace(node) : node;
  const first = replaceLeaf(node.first, leafId, replace);
  const second = replaceLeaf(node.second, leafId, replace);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function firstLeaf(node: TerminalLayoutNode): TerminalLeaf {
  return node.kind === "leaf" ? node : firstLeaf(node.first);
}

function sessionLeaf(node: TerminalLayoutNode, sessionId: string): TerminalLeaf | null {
  return findLeaf(node, (leaf) => leaf.tabs.includes(sessionId));
}

function targetLeaf(node: TerminalLayoutNode, leafId?: string): TerminalLeaf | null {
  if (!leafId) return firstLeaf(node);
  return findLeaf(node, (leaf) => leaf.id === leafId);
}

function nextId(node: TerminalLayoutNode, prefix: string): string {
  const ids: string[] = [];
  const visit = (candidate: TerminalLayoutNode): void => {
    ids.push(candidate.id);
    if (candidate.kind === "split") {
      visit(candidate.first);
      visit(candidate.second);
    }
  };
  visit(node);
  let index = 1;
  while (ids.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function withoutTab(leaf: TerminalLeaf, sessionId: string): TerminalLeaf {
  const index = leaf.tabs.indexOf(sessionId);
  if (index < 0) return leaf;
  const tabs = leaf.tabs.filter((id) => id !== sessionId);
  const activeId = leaf.activeId === sessionId
    ? tabs[Math.min(index, tabs.length - 1)] ?? null
    : leaf.activeId;
  return { ...leaf, tabs, activeId };
}

function normalize(node: TerminalLayoutNode): TerminalLayoutNode | null {
  if (node.kind === "leaf") return node.tabs.length === 0 ? null : node;
  const first = normalize(node.first);
  const second = normalize(node.second);
  if (!first) return second;
  if (!second) return first;
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function removeTerminal(
  node: TerminalLayoutNode,
  sessionId: string,
): TerminalLayoutNode {
  const source = sessionLeaf(node, sessionId);
  if (!source) return node;
  const changed = replaceLeaf(node, source.id, (leaf) => withoutTab(leaf, sessionId));
  return normalize(changed) ?? createTerminalLayout();
}

function insertAt(values: string[], value: string, requestedIndex?: number): string[] {
  const withoutValue = values.filter((candidate) => candidate !== value);
  const index = requestedIndex === undefined
    ? withoutValue.length
    : Math.max(0, Math.min(withoutValue.length, Math.round(requestedIndex)));
  return [
    ...withoutValue.slice(0, index),
    value,
    ...withoutValue.slice(index),
  ];
}

export function addTerminalTab(
  node: TerminalLayoutNode,
  sessionId: string,
  leafId?: string,
): TerminalLayoutNode {
  if (sessionLeaf(node, sessionId)) return activateTerminalTab(node, sessionId);
  const destination = targetLeaf(node, leafId);
  if (!destination) return node;
  return replaceLeaf(node, destination.id, (leaf) => ({
    ...leaf,
    tabs: [...leaf.tabs, sessionId],
    activeId: sessionId,
  }));
}

export function activateTerminalTab(
  node: TerminalLayoutNode,
  sessionId: string,
): TerminalLayoutNode {
  const leaf = sessionLeaf(node, sessionId);
  if (!leaf || leaf.activeId === sessionId) return node;
  return replaceLeaf(node, leaf.id, (candidate) => ({
    ...candidate,
    activeId: sessionId,
  }));
}

export function closeTerminalTab(
  node: TerminalLayoutNode,
  sessionId: string,
): TerminalLayoutNode {
  return removeTerminal(node, sessionId);
}

export function moveTerminalTab(
  node: TerminalLayoutNode,
  sessionId: string,
  destinationLeafId: string,
  index?: number,
): TerminalLayoutNode {
  const source = sessionLeaf(node, sessionId);
  const destination = targetLeaf(node, destinationLeafId);
  if (!source || !destination) return node;
  if (source.id === destination.id) {
    const tabs = insertAt(source.tabs, sessionId, index);
    if (tabs.every((id, tabIndex) => id === source.tabs[tabIndex])) {
      return activateTerminalTab(node, sessionId);
    }
    return replaceLeaf(node, source.id, (leaf) => ({
      ...leaf,
      tabs,
      activeId: sessionId,
    }));
  }

  const removed = removeTerminal(node, sessionId);
  const survivingDestination = targetLeaf(removed, destinationLeafId);
  if (!survivingDestination) return node;
  return replaceLeaf(removed, destinationLeafId, (leaf) => ({
    ...leaf,
    tabs: insertAt(leaf.tabs, sessionId, index),
    activeId: sessionId,
  }));
}

export function splitTerminalTab(
  node: TerminalLayoutNode,
  sessionId: string,
  destinationLeafId: string,
  placement: TerminalDropPlacement,
): TerminalLayoutNode {
  const destination = targetLeaf(node, destinationLeafId);
  if (!destination) return node;
  const source = sessionLeaf(node, sessionId);
  if (source?.id === destination.id && source.tabs.length < 2) return node;

  const base = source ? removeTerminal(node, sessionId) : node;
  const survivingDestination = targetLeaf(base, destinationLeafId);
  if (!survivingDestination) return node;

  const moved: TerminalLeaf = {
    kind: "leaf",
    id: nextId(base, "terminal-leaf"),
    tabs: [sessionId],
    activeId: sessionId,
  };
  const splitId = nextId(base, "terminal-split");
  const before = placement === "left" || placement === "top";
  const axis: TerminalSplitAxis =
    placement === "left" || placement === "right" ? "row" : "column";
  return replaceLeaf(base, destinationLeafId, (leaf) => ({
    kind: "split",
    id: splitId,
    axis,
    ratio: 0.5,
    first: before ? moved : leaf,
    second: before ? leaf : moved,
  }));
}

export function setSplitRatio(
  node: TerminalLayoutNode,
  splitId: string,
  ratio: number,
): TerminalLayoutNode {
  if (node.kind === "leaf") return node;
  if (node.id === splitId) {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    return clamped === node.ratio ? node : { ...node, ratio: clamped };
  }
  const first = setSplitRatio(node.first, splitId, ratio);
  const second = setSplitRatio(node.second, splitId, ratio);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}
