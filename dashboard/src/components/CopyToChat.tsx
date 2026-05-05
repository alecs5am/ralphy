import { useState } from "react";
import { useWorkspace } from "../stores/workspace";

type Props = {
  relativePath: string;
  size?: "sm" | "md";
};

export function CopyToChat({ relativePath, size = "sm" }: Props) {
  const projectRoot = useWorkspace((s) => s.projectRoot);
  const [copied, setCopied] = useState(false);

  const absolutePath = `${projectRoot}/${relativePath}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(absolutePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Copy relative path on right-click
    await navigator.clipboard.writeText(relativePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const cls =
    size === "sm"
      ? "px-1.5 py-0.5 text-xs rounded"
      : "px-2 py-1 text-sm rounded-md";

  return (
    <button
      onClick={handleCopy}
      onContextMenu={handleContextMenu}
      title={`Click: copy absolute path\nRight-click: copy relative path\n${absolutePath}`}
      className={`${cls} bg-zinc-700/50 hover:bg-zinc-600 text-zinc-300 hover:text-white transition-colors inline-flex items-center gap-1 shrink-0`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10" /></svg>
          Copy path
        </>
      )}
    </button>
  );
}
