import type { MarketplaceItemPresentation } from "../lib/presentation";

export function MarketplaceDetailTags({ tags, onTag }: { tags: readonly string[]; onTag?(tag: string): void }) {
  if (tags.length === 0) return null;
  return <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Tags">
    {tags.map((tag) => <li key={tag}>{onTag
      ? <button className="rounded-chip bg-surface-sunken px-2 py-1 type-xs text-muted hover:text-ink" type="button" onClick={() => onTag(tag)}>{tag}</button>
      : <span className="inline-block rounded-chip bg-surface-sunken px-2 py-1 type-xs text-muted">{tag}</span>}
    </li>)}
  </ul>;
}

/** Unknown evidence stays in this disclosure instead of becoming a page of warnings. */
export function MarketplaceDetailFacts({ item }: { item: MarketplaceItemPresentation }) {
  const facts = [
    ["Source", item.sourceLabel],
    ["Version", item.version.status === "ready" ? item.version.value : "Not specified"],
    ["Updated", item.updatedAt.status === "ready" ? item.updatedAt.value : "Not specified"],
    ["License", item.license.status === "ready" ? item.license.value : "Not specified"],
    ["Publisher identity", item.publisherIdentity.status === "ready" ? item.publisherIdentity.value : "Not verified"],
    ["Content audit", item.contentAudit.status === "ready" ? item.contentAudit.value : "Not specified"],
    ["Compatibility", item.compatibility.status === "ready" ? item.compatibility.value : "Not specified"],
  ];
  return <section className="min-w-0">
    <h3 className="m-0 mb-2 type-sm font-medium">Version and provenance</h3>
    {item.studio?.reference && <p className="m-0 mb-3 type-xs"><a className="text-ink underline underline-offset-2" href={item.studio.reference.url} target="_blank" rel="noreferrer">{item.studio.reference.title}</a></p>}
    <dl className="m-0 flex flex-col gap-1.5">{facts.map(([label, value]) => <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1" key={label}>
      <dt className="type-xs text-muted">{label}</dt><dd className="m-0 min-w-0 type-xs wrap-anywhere">{value}</dd>
    </div>)}</dl>
  </section>;
}
