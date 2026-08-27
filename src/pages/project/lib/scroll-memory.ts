import { useCallback, useLayoutEffect, useRef, type UIEvent } from "react";

export function useRememberedScroll(
  memory: Map<string, number>,
  key: string,
  resetToken: string | number,
): { ref(node: HTMLElement | null): void; onScroll(event: UIEvent<HTMLElement>): void } {
  const nodeRef = useRef<HTMLElement | null>(null);
  const previous = useRef({ key, resetToken });
  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) node.scrollTop = memory.get(key) ?? 0;
  }, [key, memory]);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    memory.set(key, event.currentTarget.scrollTop);
  }, [key, memory]);

  useLayoutEffect(() => {
    if (previous.current.key === key && !Object.is(previous.current.resetToken, resetToken)) {
      memory.delete(key);
      if (nodeRef.current) nodeRef.current.scrollTop = 0;
    }
    previous.current = { key, resetToken };
  }, [key, memory, resetToken]);

  return { ref, onScroll };
}
