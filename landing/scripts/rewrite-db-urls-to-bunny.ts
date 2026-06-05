// landing/scripts/rewrite-db-urls-to-bunny.ts
//
// One-shot: rewrite the Supabase Storage URL prefix → Bunny CDN base inside the
// live Postgres JSONB columns that carry media URLs. Postgres itself stays on
// Supabase; only the media host changes.
//
// Targeted columns (confirmed by inspection): units.media, blocks.refs,
// blueprints.data. The replace() is idempotent — re-running is a no-op once no
// row contains the old prefix.
//
// Usage:
//   bun --env-file=.env.local scripts/rewrite-db-urls-to-bunny.ts --dry-run   # report counts
//   bun --env-file=.env.local scripts/rewrite-db-urls-to-bunny.ts --apply     # perform UPDATEs

import { Client } from "pg";

const OLD = "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/";
const NEW = "https://ralphy.b-cdn.net/";
const APPLY = process.argv.includes("--apply");

const TARGETS: { table: string; col: string }[] = [
  { table: "units", col: "media" },
  { table: "blocks", col: "refs" },
  { table: "blueprints", col: "data" },
];

async function main() {
  const dsn = process.env.SUPABASE_DB_URL;
  if (!dsn) throw new Error("Missing SUPABASE_DB_URL");
  const c = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const { table, col } of TARGETS) {
      const before = await c.query(
        `select count(*)::int n from "${table}" where "${col}"::text like $1`,
        [`%${OLD}%`],
      );
      const n = before.rows[0].n as number;
      if (!APPLY) {
        console.log(`[dry-run] ${table}.${col}: ${n} rows contain old prefix`);
        continue;
      }
      if (n === 0) {
        console.log(`${table}.${col}: nothing to do`);
        continue;
      }
      const res = await c.query(
        `update "${table}" set "${col}" = replace("${col}"::text, $1, $2)::jsonb where "${col}"::text like $3`,
        [OLD, NEW, `%${OLD}%`],
      );
      const after = await c.query(
        `select count(*)::int n from "${table}" where "${col}"::text like $1`,
        [`%${OLD}%`],
      );
      console.log(`${table}.${col}: updated ${res.rowCount} rows; ${after.rows[0].n} still contain old prefix (must be 0)`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
