import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content?: string;
  children?: string;
  className?: string;
};

export function Markdown({ content, children, className = "" }: Props) {
  const text = content ?? children ?? "";
  return (
    <div className={`era-md text-[13px] leading-[1.65] text-[#1a1a1a] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => (
            <h1
              className="text-[18px] font-semibold mt-5 mb-2 pb-1 border-b border-[#e5e5e5]"
              {...p}
            />
          ),
          h2: (p) => (
            <h2 className="text-[15px] font-semibold mt-5 mb-2" {...p} />
          ),
          h3: (p) => (
            <h3 className="text-[13px] font-medium mt-4 mb-1.5" {...p} />
          ),
          h4: (p) => (
            <h4
              className="text-[11px] font-medium mt-3 mb-1 uppercase tracking-[0.18em] text-[#6b6b6b] font-mono"
              {...p}
            />
          ),
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
          li: (p) => <li className="marker:text-[#9a9a9a]" {...p} />,
          a: (p) => (
            <a
              className="underline hover:no-underline"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          strong: (p) => <strong className="font-semibold" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          code: ({ inline, className, children, ...rest }: any) =>
            inline ? (
              <code
                className="px-1 py-0.5 bg-[#fafafa] border border-[#e5e5e5] text-[11.5px] font-mono"
                {...rest}
              >
                {children}
              </code>
            ) : (
              <code className={`${className || ""} block`} {...rest}>
                {children}
              </code>
            ),
          pre: (p) => (
            <pre
              className="my-3 p-3 bg-[#fafafa] border border-[#e5e5e5] overflow-x-auto text-[11.5px] font-mono"
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              className="my-2 pl-3 border-l-2 border-[#9a9a9a] italic text-[#6b6b6b]"
              {...p}
            />
          ),
          hr: () => <hr className="my-4 border-[#e5e5e5]" />,
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="border-collapse text-[11.5px]" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-[#fafafa]" {...p} />,
          th: (p) => (
            <th
              className="border border-[#e5e5e5] px-2 py-1 text-left font-medium"
              {...p}
            />
          ),
          td: (p) => (
            <td className="border border-[#e5e5e5] px-2 py-1 align-top" {...p} />
          ),
          img: (p) => (
            <img
              className="my-2 max-w-full border border-[#e5e5e5]"
              loading="lazy"
              {...p}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
