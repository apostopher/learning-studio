import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LESSON_VERSION,
  formatVersion,
  lessonVersionSchema,
} from '#/lib/lesson-version';

describe('lesson version rules', () => {
  it('defaults to 1.0 and formats with a v', () => {
    expect(DEFAULT_LESSON_VERSION).toBe('1.0');
    expect(formatVersion('1.0')).toBe('v1.0');
  });

  it('refuses malformed input and trims spaces', () => {
    for (const bad of ['1', 'v1.1', '01.1', '1.01', '1.1.1', '', '12345.0']) {
      expect(lessonVersionSchema.safeParse(bad).success).toBe(false);
    }
    expect(lessonVersionSchema.parse(' 1.1 ')).toBe('1.1');
    const r = lessonVersionSchema.safeParse('x');
    expect(r.success ? '' : r.error.issues[0]?.message).toBe(
      'Use a number like 1.0',
    );
  });
});
