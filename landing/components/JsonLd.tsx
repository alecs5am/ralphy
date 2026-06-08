// Renders a JSON-LD <script> for structured data (schema.org). Server
// component — emits a single inline script so crawlers (Google, Bing) read
// the typed graph without any client JS.
//
// We deliberately do NOT escape `<` here: Next streams this as-is, and
// schema.org payloads never contain a literal "</script>" unless a string
// field does. We strip that one closing-tag sequence defensively so a stray
// value can't break out of the script element.

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
