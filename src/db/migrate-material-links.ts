import { sql } from 'drizzle-orm';
import { db } from '#/db';
import type { MaterialLink } from '#/types';

/**
 * Converts `lesson_material.links` from `text[]` to `json`, now that a link is
 * a `{ name, url }` pair rather than a bare string.
 *
 * By hand rather than via `drizzle-kit push` for the same reason as
 * migrate-org-personas: push diffs the whole schema, and this database has
 * pre-existing drift that makes it offer to **truncate** `doc_urls` (13 rows)
 * to add `uniq_course_source_path_url`. These statements touch one column.
 *
 * The old strings were never plain URLs — three shapes are in the table:
 * markdown `[Name](url)`, a full HTML `<a href>` (what the rich-text editor
 * produced), and a bare URL. The first two already carry the name a human
 * wrote, so they are parsed into `name`/`url` instead of being flattened.
 * A bare URL gets an empty name, which the student view renders as the URL.
 *
 * Re-running is a no-op — the column type is checked first.
 *
 * Usage:
 *   pnpm db:migrate-material-links
 */

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");

/** Parse one legacy link string into a `{ name, url }`, or null if it has no URL. */
export function parseLegacyLink(raw: string): MaterialLink | null {
  const value = raw.trim();
  if (!value) return null;

  // A label identical to its href adds nothing — drop it so the view falls back
  // to the URL rather than printing it twice.
  const link = (name: string, url: string): MaterialLink => ({
    name: name === url ? '' : name,
    url,
  });

  const markdown = value.match(/^\[([^\]]*)\]\(\s*([^)\s]+)\s*\)$/);
  if (markdown) {
    return link(markdown[1].trim(), markdown[2].trim());
  }

  const anchor = value.match(
    /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  if (anchor) {
    return link(
      decodeEntities(anchor[2].replace(/<[^>]+>/g, '')).trim(),
      decodeEntities(anchor[1]).trim(),
    );
  }

  if (/^(https?:\/\/|www\.|mailto:)/i.test(value))
    return { name: '', url: value };

  // No URL anywhere — a stray note, not a link. Reported, not silently dropped.
  return null;
}

async function main() {
  const { rows: cols } = await db.execute<{ udt_name: string }>(sql`
    select udt_name
      from information_schema.columns
     where table_name = 'lesson_material' and column_name = 'links'
  `);

  const udt = cols[0]?.udt_name;
  if (!udt) {
    console.error('lesson_material.links not found — nothing to migrate.');
    process.exit(1);
  }
  if (udt !== '_text') {
    console.log(`lesson_material.links is already "${udt}" — nothing to do.`);
    process.exit(0);
  }

  const { rows } = await db.execute<{ id: number; links: string[] | null }>(
    sql`select id, links from lesson_material where links is not null`,
  );

  const dropped: Array<{ id: number; value: string }> = [];
  const converted = rows.map((row) => {
    const links: MaterialLink[] = [];
    for (const raw of row.links ?? []) {
      const parsed = parseLegacyLink(raw);
      if (parsed) links.push(parsed);
      else if (raw.trim()) dropped.push({ id: row.id, value: raw });
    }
    return { id: row.id, links };
  });

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`alter table "lesson_material" add column if not exists "links_json" json`,
    );
    for (const row of converted) {
      await tx.execute(
        sql`update "lesson_material" set "links_json" = ${JSON.stringify(row.links)}::json where "id" = ${row.id}`,
      );
    }
    await tx.execute(sql`alter table "lesson_material" drop column "links"`);
    await tx.execute(
      sql`alter table "lesson_material" rename column "links_json" to "links"`,
    );
  });

  const total = converted.reduce((n, r) => n + r.links.length, 0);
  const named = converted.reduce(
    (n, r) => n + r.links.filter((l) => l.name).length,
    0,
  );
  console.log(
    `lesson_material.links is now json — ${converted.length} rows, ${total} links (${named} with a name).`,
  );
  if (dropped.length > 0) {
    console.log(`Dropped ${dropped.length} entries with no URL:`);
    for (const d of dropped) console.log(`  [row ${d.id}] ${d.value}`);
  }
  process.exit(0);
}

// Guarded so `parseLegacyLink` can be imported (e.g. for a dry run) without the
// import itself migrating the table.
if (process.argv[1]?.endsWith('migrate-material-links.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
