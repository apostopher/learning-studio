/**
 * Planning half of `duplicate-lessons-run.ts`, split out so the one decision
 * with a footgun — slugs are globally unique, and `lesson_material` hangs
 * off the slug — is unit-tested.
 */

/** `<slug>-<discipline>`, stepping `-2`, `-3`… past anything already taken. */
export function planCopySlugs(
  slugs: readonly string[],
  disciplineSlug: string,
  taken: ReadonlySet<string>,
): { from: string; to: string }[] {
  const used = new Set(taken);
  return slugs.map((from) => {
    const base = `${from}-${disciplineSlug}`;
    let to = base;
    for (let n = 2; used.has(to); n += 1) to = `${base}-${n}`;
    used.add(to);
    return { from, to };
  });
}
