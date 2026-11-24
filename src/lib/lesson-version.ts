import { z } from 'zod';

export const DEFAULT_LESSON_VERSION = '1.0';

// Two numeric parts, no leading zeros, up to 4 digits each; compared per part.
const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

export const lessonVersionSchema = z
  .string()
  .trim()
  .regex(VERSION_RE, 'Use a number like 1.0');

const parts = (v: string): [number, number] => {
  const [major = '0', minor = '0'] = v.split('.');
  return [Number(major), Number(minor)];
};

export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = parts(a);
  const [bMajor, bMinor] = parts(b);
  return aMajor - bMajor || aMinor - bMinor;
}

export function formatVersion(version: string): string {
  return `v${version}`;
}

export function lockedVersionMessage(
  version: string,
  courseCount: number,
): string {
  const v = formatVersion(version);
  const used =
    courseCount === 0
      ? `${v} was used by a course`
      : `${v} is used by ${courseCount} ${courseCount === 1 ? 'course' : 'courses'}`;
  return `${used}. Enter a higher version to make changes.`;
}

export function notHigherVersionMessage(than: string): string {
  return `Enter a version higher than ${formatVersion(than)}.`;
}

export type VersionState = { version: string; highestTaken: string | null };

/** A version is frozen once a course has taken it. */
export function isVersionLocked(s: VersionState): boolean {
  return s.highestTaken === s.version;
}

/** Null when a content edit carrying `next` is allowed; else why not. `undefined` = keep the current version. */
export function versionEditError(
  s: VersionState,
  next: string | undefined,
): null | { reason: 'locked' } | { reason: 'not-higher'; than: string } {
  if (s.highestTaken === null) return null;
  if (next === undefined || next === s.version) {
    return isVersionLocked(s) ? { reason: 'locked' } : null;
  }
  return compareVersions(next, s.highestTaken) > 0
    ? null
    : { reason: 'not-higher', than: s.highestTaken };
}
