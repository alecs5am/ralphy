import { useState } from "react";
import { CopyToChat } from "./CopyToChat";

type Props = {
  data: any;
  filePath?: string;
  title?: string;
  maxHeight?: string;
};

function JsonNode({ data, depth = 0 }: { data: any; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (data === null) return <span className="text-zinc-500">null</span>;
  if (typeof data === "boolean")
    return <span className="text-amber-400">{String(data)}</span>;
  if (typeof data === "number")
    return <span className="text-blue-400">{data}</span>;
  if (typeof data === "string") {
    if (data.startsWith("#") && data.length <= 9)
      return (
        <span className="text-emerald-400">
          "<span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-text-bottom" style={{ backgroundColor: data }} />{data}"
        </span>
      );
    return <span className="text-emerald-400">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-zinc-500">[]</span>;
    if (collapsed)
      return (
        <span onClick={() => setCollapsed(false)} className="cursor-pointer text-zinc-400 hover:text-zinc-200">
          [{data.length} items...]
        </span>
      );
    return (
      <span>
        <span onClick={() => setCollapsed(true)} className="cursor-pointer text-zinc-400 hover:text-zinc-200">[</span>
        <div className="pl-4">
          {data.map((item, i) => (
            <div key={i}><JsonNode data={item} depth={depth + 1} />{i < data.length - 1 && ","}</div>
          ))}
        </div>
        ]
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="text-zinc-500">{"{}"}</span>;
    if (collapsed)
      return (
        <span onClick={() => setCollapsed(false)} className="cursor-pointer text-zinc-400 hover:text-zinc-200">
          {"{"}{keys.length} keys...{"}"}
        </span>
      );
    return (
      <span>
        <span onClick={() => setCollapsed(true)} className="cursor-pointer text-zinc-400 hover:text-zinc-200">{"{"}</span>
        <div className="pl-4">
          {keys.map((key, i) => (
            <div key={key}>
              <span className="text-purple-400">"{key}"</span>: <JsonNode data={data[key]} depth={depth + 1} />
              {i < keys.length - 1 && ","}
            </div>
          ))}
        </div>
        {"}"}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

export function JsonViewer({ data, filePath, title, maxHeight = "500px" }: Props) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      {(title || filePath) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
          <span className="text-xs text-zinc-400 font-mono">{title || filePath}</span>
          {filePath && <CopyToChat relativePath={filePath} />}
        </div>
      )}
      <pre
        className="p-3 text-xs font-mono overflow-auto leading-relaxed"
        style={{ maxHeight }}
      >
        <JsonNode data={data} />
      </pre>
    </div>
  );
}
