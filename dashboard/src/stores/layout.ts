import type { Group, Tab } from "./workspace";

export type GroupNode = {
  id: string;
  kind: "group";
  group: Group;
};

export type SplitNode = {
  id: string;
  kind: "split";
  direction: "horizontal" | "vertical";
  children: LayoutNode[];
};

export type LayoutNode = GroupNode | SplitNode;

export type Side = "left" | "right" | "top" | "bottom";

let _uid = 0;
export const nid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(_uid++).toString(36)}`;

export function wrapGroup(group: Group): GroupNode {
  return { id: "n-" + group.id, kind: "group", group };
}

export function getAllGroups(root: LayoutNode | null): Group[] {
  if (!root) return [];
  if (root.kind === "group") return [root.group];
  return root.children.flatMap(getAllGroups);
}

export function findGroupNode(
  root: LayoutNode | null,
  groupId: string
): { node: GroupNode; parent: SplitNode | null; index: number } | null {
  if (!root) return null;
  const walk = (
    node: LayoutNode,
    parent: SplitNode | null,
    index: number
  ): ReturnType<typeof findGroupNode> => {
    if (node.kind === "group") {
      return node.group.id === groupId ? { node, parent, index } : null;
    }
    for (let i = 0; i < node.children.length; i++) {
      const r = walk(node.children[i], node, i);
      if (r) return r;
    }
    return null;
  };
  return walk(root, null, 0);
}

export function updateGroup(
  root: LayoutNode | null,
  groupId: string,
  updater: (g: Group) => Group
): LayoutNode | null {
  if (!root) return root;
  if (root.kind === "group") {
    return root.group.id === groupId
      ? { ...root, group: updater(root.group) }
      : root;
  }
  let changed = false;
  const children = root.children.map((c) => {
    const nc = updateGroup(c, groupId, updater);
    if (nc !== c) changed = true;
    return nc!;
  });
  return changed ? { ...root, children } : root;
}

export function removeGroup(
  root: LayoutNode | null,
  groupId: string
): LayoutNode | null {
  if (!root) return null;
  if (root.kind === "group") {
    return root.group.id === groupId ? null : root;
  }
  const newChildren = root.children
    .map((c) => removeGroup(c, groupId))
    .filter((c): c is LayoutNode => c !== null);
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // collapse split
  return { ...root, children: newChildren };
}

export function firstGroup(root: LayoutNode | null): Group | null {
  return getAllGroups(root)[0] ?? null;
}

/**
 * Insert a new group beside targetGroupId on the given side.
 * If the parent split already matches the desired direction, splice in as sibling.
 * Otherwise, wrap the target group in a new split with both as children.
 */
export function addGroupBeside(
  root: LayoutNode | null,
  targetGroupId: string,
  side: Side,
  newGroup: Group
): LayoutNode {
  const newNode = wrapGroup(newGroup);
  const desiredDir: "horizontal" | "vertical" =
    side === "left" || side === "right" ? "horizontal" : "vertical";
  const insertAfter = side === "right" || side === "bottom";

  if (!root) return newNode;

  // If target not found, fall back to wrapping root with a split.
  const found = findGroupNode(root, targetGroupId);
  if (!found) {
    return {
      id: nid("sp"),
      kind: "split",
      direction: desiredDir,
      children: insertAfter ? [root, newNode] : [newNode, root],
    };
  }

  // If parent split matches direction, just insert as sibling.
  if (found.parent && found.parent.direction === desiredDir) {
    const insertAt = insertAfter ? found.index + 1 : found.index;
    const updated: SplitNode = {
      ...found.parent,
      children: [
        ...found.parent.children.slice(0, insertAt),
        newNode,
        ...found.parent.children.slice(insertAt),
      ],
    };
    return replaceNode(root, found.parent.id, updated) ?? root;
  }

  // Otherwise wrap the target group in a new split with both children.
  const wrapped: SplitNode = {
    id: nid("sp"),
    kind: "split",
    direction: desiredDir,
    children: insertAfter ? [found.node, newNode] : [newNode, found.node],
  };

  // If target was the root itself, return the wrapped split.
  if (!found.parent) return wrapped;

  // Replace target node in its parent's children.
  const newParent: SplitNode = {
    ...found.parent,
    children: found.parent.children.map((c) =>
      c === found.node ? wrapped : c
    ),
  };
  return replaceNode(root, found.parent.id, newParent) ?? root;
}

function replaceNode(
  root: LayoutNode,
  nodeId: string,
  replacement: LayoutNode
): LayoutNode | null {
  if (root.id === nodeId) return replacement;
  if (root.kind === "group") return null;
  let changed = false;
  const children = root.children.map((c) => {
    const r = replaceNode(c, nodeId, replacement);
    if (r) {
      changed = true;
      return r;
    }
    return c;
  });
  return changed ? { ...root, children } : null;
}

export function computeSide(
  rect: DOMRect,
  x: number,
  y: number
): Side {
  // Normalize position to [-1, 1] relative to center
  const nx = (x - rect.left) / rect.width - 0.5;
  const ny = (y - rect.top) / rect.height - 0.5;
  // Which is bigger in magnitude decides axis; sign decides side
  if (Math.abs(nx) > Math.abs(ny)) {
    return nx < 0 ? "left" : "right";
  }
  return ny < 0 ? "top" : "bottom";
}

export type TabLocator = { area: "editor" | "terminal"; groupId: string; tab: Tab };

export function findTab(
  root: LayoutNode | null,
  tabId: string
): { groupId: string; tab: Tab } | null {
  for (const g of getAllGroups(root)) {
    const t = g.tabs.find((t) => t.id === tabId);
    if (t) return { groupId: g.id, tab: t };
  }
  return null;
}
