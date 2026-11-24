import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  DEFAULT_LESSON_VERSION,
  formatVersion,
  isVersionLocked,
  lessonVersionSchema,
  lockedVersionMessage,
  versionEditError,
} from '#/lib/lesson-version';

describe('lesson version rules', () => {
  it('defaults to 1.0 and formats with a v', () => {
    expect(DEFAULT_LESSON_VERSION).toBe('1.0');
    expect(formatVersion('1.0')).toBe('v1.0');
  });

  it('compares each part as a number', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0', '1.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0')).toBe(0);
    expect(compareVersions('0.9', '1.0')).toBeLessThan(0);
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

  it('words the locked message by course count', () => {
    expect(lockedVersionMessage('1.0', 3)).toBe(
      'v1.0 is used by 3 courses. Enter a higher version to make changes.',
    );
    expect(lockedVersionMessage('1.0', 1)).toBe(
      'v1.0 is used by 1 course. Enter a higher version to make changes.',
    );
    expect(lockedVersionMessage('1.0', 0)).toBe(
      'v1.0 was used by a course. Enter a higher version to make changes.',
    );
  });

  it('locks only when the current version is the highest taken', () => {
    expect(isVersionLocked({ version: '1.0', highestTaken: '1.0' })).toBe(true);
    expect(isVersionLocked({ version: '1.2', highestTaken: '1.0' })).toBe(
      false,
    );
    expect(isVersionLocked({ version: '1.0', highestTaken: null })).toBe(false);
  });

  it('gates content edits', () => {
    const taken = { version: '1.0', highestTaken: '1.0' };
    expect(versionEditError(taken, undefined)).toEqual({ reason: 'locked' });
    expect(versionEditError(taken, '1.0')).toEqual({ reason: 'locked' });
    expect(versionEditError(taken, '0.9')).toEqual({
      reason: 'not-higher',
      than: '1.0',
    });
    expect(versionEditError(taken, '1.1')).toBeNull();
    const open = { version: '1.2', highestTaken: '1.0' };
    expect(versionEditError(open, undefined)).toBeNull();
    expect(versionEditError(open, '1.1')).toBeNull();
    expect(versionEditError(open, '1.0')).toEqual({
      reason: 'not-higher',
      than: '1.0',
    });
    expect(
      versionEditError({ version: '1.0', highestTaken: null }, '0.1'),
    ).toBeNull();
  });
});
