/**
 * Recursively collect every column/table name and literal parameter value
 * out of a real drizzle query-builder value: an `SQL` condition tree
 * (`eq`/`and`/`inArray`), or a raw `sql\`...\`` fragment (as `rankBetween`
 * builds). Real drizzle objects, not stubs, are what an implementation
 * passes to `.where()`/`.set()`/`.innerJoin()`'s condition argument —
 * walking one is how a test proves what columns and values were actually
 * referenced, rather than trusting the implementation's own description of
 * itself.
 *
 * `eq`/`inArray` wrap their parameters in a `Param` object exposing
 * `.value`, but a raw `sql\`...${x}...\`` fragment embeds a primitive `x`
 * directly as a bare queryChunk entry with no wrapper — hence the explicit
 * primitive handling below, verified against real drizzle output for both
 * shapes.
 *
 * Shared by `placement-writes.test.ts` and `lesson-course-resolution.test.ts`
 * (Task 5a fix round 2, Minor 4) rather than duplicated: this build has
 * already shipped one token extractor that silently stringified an object
 * to `"[object Object]"` and passed anyway — one shared copy means a fix to
 * that class of bug only has to happen once.
 */
export function collectSqlTokens(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'number' || typeof node === 'string') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectSqlTokens(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.name === 'string') out.push(record.name);
    if ('value' in record) out.push(String(record.value));
    if ('queryChunks' in record) collectSqlTokens(record.queryChunks, out);
  }
  return out;
}
