/**
 * Embed every lesson snapshot that has no search rows, so Viper can find it:
 * whatever a route failed to index, and lessons placed while the lesson
 * versions rollout was under way. Safe to re-run; it does only what is missing.
 *
 * Run: pnpm db:index-lesson-versions
 */
import {
  indexLessonVersions,
  unindexedLessonVersionIds,
} from '#/lib/index-lesson-versions.server';

/** Returns the exit code. */
export async function run(
  print: (line: string) => void = console.log,
): Promise<number> {
  const { indexed, failed } = await indexLessonVersions(
    await unindexedLessonVersionIds(),
  );
  print(`Indexed ${indexed} lesson versions.`);
  if (failed.length === 0) return 0;
  print(
    `${failed.length} failed: ${failed.join(', ')}. Run this again to retry them.`,
  );
  return 1;
}

if (process.argv[1]?.endsWith('index-lesson-versions.ts')) {
  run().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
