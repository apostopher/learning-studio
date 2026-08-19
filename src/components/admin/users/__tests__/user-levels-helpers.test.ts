import { describe, expect, it } from 'vitest';
import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';
import { resolveChangedByEmail } from '../user-levels-helpers';

const row = (overrides: Partial<LevelHistoryRow> = {}): LevelHistoryRow => ({
  id: 1,
  level: 'advanced',
  source: 'admin',
  message: 'Cleared for advanced ops.',
  note: null,
  changedBy: 'user-abc',
  createdAt: new Date('2026-01-05T00:00:00Z'),
  ...overrides,
});

describe('resolveChangedByEmail', () => {
  it('replaces the raw user id with the matching email', () => {
    const history = [row({ changedBy: 'user-abc' })];
    const emailByUserId = new Map([['user-abc', 'chief@example.com']]);

    const [resolved] = resolveChangedByEmail(history, emailByUserId);

    expect(resolved.changedBy).toBe('chief@example.com');
  });

  it('falls back to the raw id when the actor is not in the map', () => {
    const history = [row({ changedBy: 'user-removed' })];
    const emailByUserId = new Map([['user-abc', 'chief@example.com']]);

    const [resolved] = resolveChangedByEmail(history, emailByUserId);

    expect(resolved.changedBy).toBe('user-removed');
  });

  it('leaves a null changedBy as null', () => {
    const history = [row({ changedBy: null })];
    const emailByUserId = new Map([['user-abc', 'chief@example.com']]);

    const [resolved] = resolveChangedByEmail(history, emailByUserId);

    expect(resolved.changedBy).toBeNull();
  });

  it('does not mutate the input rows', () => {
    const original = row({ changedBy: 'user-abc' });
    const history = [original];
    const emailByUserId = new Map([['user-abc', 'chief@example.com']]);

    resolveChangedByEmail(history, emailByUserId);

    expect(original.changedBy).toBe('user-abc');
  });
});
