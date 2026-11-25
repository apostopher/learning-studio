import { z } from 'zod';

export const DEFAULT_LESSON_VERSION = '1.0';

// Two numeric parts, no leading zeros, up to 4 digits each. Only a label:
// compared for equality, never ordered.
const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

export const lessonVersionSchema = z
  .string()
  .trim()
  .regex(VERSION_RE, 'Use a number like 1.0');

export function formatVersion(version: string): string {
  return `v${version}`;
}
