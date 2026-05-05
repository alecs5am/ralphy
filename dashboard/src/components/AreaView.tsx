import type { ReactNode } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useWorkspace } from "../stores/workspace";
import type { LayoutNode } from "../stores/layout";
import { GroupView } from "./GroupView";
import { ERA } from "../era/tokens";

type Props = {
  root: LayoutNode | null;
  emptyPlaceholder?: ReactNode;
};

export function AreaView({ root, emptyPlaceholder }: Props) {
  if (!root) {
    return emptyPlaceholder ? <>{emptyPlaceholder}</> : null;
  }
  return <NodeView node={root} depth={0} />;
}

function NodeView({ node, depth }: { node: LayoutNode; depth: number }) {
  const activeGroupId = useWorkspace((s) => s.activeGroupId);

  if (node.kind === "group") {
    return (
      <GroupView
        group={node.group}
        isActiveGroup={activeGroupId === node.group.id}
      />
    );
  }

  const handleClass =
    node.direction === "horizontal"
      ? "w-px relative bg-[var(--era-rule)] hover:bg-[var(--era-ink)] transition-colors"
      : "h-px relative bg-[var(--era-rule)] hover:bg-[var(--era-ink)] transition-colors";

  return (
    <PanelGroup
      direction={node.direction}
      id={node.id}
      autoSaveId={`ralph-editor-${node.id}`}
    >
      {node.children.flatMap((child, idx) => {
        const pieces: ReactNode[] = [];
        if (idx > 0) {
          pieces.push(
            <PanelResizeHandle
              key={`h-${child.id}`}
              className={handleClass}
              style={{ background: ERA.rule }}
            />
          );
        }
        pieces.push(
          <Panel
            key={child.id}
            id={child.id}
            order={idx}
            defaultSize={100 / node.children.length}
            minSize={10}
          >
            <NodeView node={child} depth={depth + 1} />
          </Panel>
        );
        return pieces;
      })}
    </PanelGroup>
  );
}
