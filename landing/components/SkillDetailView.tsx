// landing/components/SkillDetailView.tsx
//
// Shared server-rendered skill detail body. Used by both the full-page route
// (app/skills/[slug]/page.tsx) and the intercepted modal route
// (app/skills/@modal/(.)[slug]/page.tsx) so the two stay in sync.
//
// Each file's Markdown is rendered server-side via MDXRemote and passed as a
// child panel to the client tree toggler — the canonical RSC interleaving
// pattern, so file-switching needs no client-side Markdown parser.

import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { loadSkill, type SkillFile, type SkillRecord } from "@/lib/skills-loader";
import { mdxComponents } from "@/components/mdx";
import { SkillFiles } from "@/app/skills/[slug]/SkillFiles";

// SKILL.md bodies use bare angle-bracket placeholders (<niche>, <product>).
// MDX parses `<` as the start of a JSX tag and throws. Escape `<` → &lt;
// everywhere EXCEPT inside fenced code blocks and inline code spans. `>` is
// left untouched so blockquotes and tables keep working.
function escapeAnglesOutsideCode(s: string): string {
  return s
    .split(/(`[^`\n]*`)/)
    .map((seg) => (seg.startsWith("`") ? seg : seg.replace(/</g, "&lt;")))
    .join("");
}
function sanitizeForMdx(md: string): string {
  const fence = /```[\s\S]*?```/g;
  let out = "";
  let last = 0;
  for (const m of md.matchAll(fence)) {
    out += escapeAnglesOutsideCode(md.slice(last, m.index));
    out += m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  out += escapeAnglesOutsideCode(md.slice(last));
  return out;
}

function renderPanel(file: SkillFile, body: string) {
  if (file.render === "code") {
    const lang = file.path.endsWith(".json")
      ? "json"
      : file.path.endsWith(".yaml") || file.path.endsWith(".yml")
        ? "yaml"
        : "text";
    return (
      <MDXRemote
        source={"```" + lang + "\n" + file.content + "\n```"}
        components={mdxComponents}
        options={{
          parseFrontmatter: false,
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [[rehypeHighlight, { detect: true, ignoreMissing: true }]],
          },
        }}
      />
    );
  }
  return (
    <MDXRemote
      source={sanitizeForMdx(body)}
      components={mdxComponents}
      options={{
        parseFrontmatter: false,
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [[rehypeHighlight, { detect: true, ignoreMissing: true }]],
        },
      }}
    />
  );
}

/** Returns the rendered detail body. `variant` "modal" centers the header. */
export function SkillDetailView({
  skill: s,
  variant = "page",
}: {
  skill: SkillRecord;
  variant?: "page" | "modal";
}) {
  const panels = s.files.map((f) => (
    <div key={f.path} className="skill-panel">
      {renderPanel(f, f.path === "SKILL.md" ? s.body : f.content)}
    </div>
  ));
  const fileMetas = s.files.map((f) => ({ path: f.path, content: f.content }));

  const m = variant === "modal";
  const iconCls = "shrink-0 w-14 h-14 rounded-[14px] object-cover [image-rendering:pixelated] block";
  const monoCls =
    "shrink-0 grid place-items-center w-14 h-14 rounded-[14px] text-[1.1rem] font-bold text-bg [background:linear-gradient(135deg,var(--color-vio),color-mix(in_srgb,var(--color-vio)_55%,#000))]";
  const tagCls = "text-[0.68rem] px-2 py-[0.15rem] rounded-full bg-bg-2 text-ink-3";

  return (
    <div className={m ? "flex flex-col flex-1 min-h-0" : ""}>
      <div className={`flex items-center gap-4 mt-[0.6rem] mb-[0.9rem] ${m ? "flex-none flex-col text-center gap-2 mt-[0.2rem] mb-[0.6rem]" : ""}`}>
        {s.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.icon} alt="" className={iconCls} aria-hidden />
        ) : (
          <span className={monoCls} aria-hidden>{s.monogram}</span>
        )}
        <div className={m ? "grid justify-items-center gap-0.5" : ""}>
          <h1 className={`font-semibold text-ink leading-[1.1] m-0 ${m ? "text-[1.4rem]" : "text-[2rem]"}`}>{s.name}</h1>
          <code className="font-mono text-[0.9rem] text-ink-3">/{s.slug}</code>
        </div>
      </div>

      <p className={m ? "flex-none text-center max-w-[58ch] mx-auto mb-[0.7rem] text-[0.86rem] text-ink-3" : "text-[1rem] leading-[1.6] text-ink-2 max-w-[70ch] mb-[1.1rem]"}>
        {s.blurb}
      </p>

      <div className={`flex flex-wrap items-center justify-between gap-2 ${m ? "flex-none justify-center mb-2" : ""}`}>
        <div className="flex flex-wrap gap-[0.35rem]">
          {s.tags.map((t) => (
            <span key={t} className={tagCls}>{t}</span>
          ))}
          <span className={`${tagCls} !text-vio-2`}>{s.namespace}</span>
        </div>
      </div>

      <div className={m ? "flex-1 min-h-0 min-w-0 flex" : "mt-5"}>
        <SkillFiles files={fileMetas} githubUrl={s.githubUrl} variant={variant}>{panels}</SkillFiles>
      </div>
    </div>
  );
}

export { loadSkill };
