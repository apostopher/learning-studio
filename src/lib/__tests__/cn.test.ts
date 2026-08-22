import { describe, expect, it } from 'vitest';
import { cn } from '#/lib/cn';

/**
 * `cn` merges Tailwind classes, and tailwind-merge only merges correctly for
 * classes whose group it recognises. This project's font sizes are theme
 * tokens, so they have to be registered explicitly — see `cn.ts`.
 */
describe('cn with this project’s font-size tokens', () => {
  it('keeps a token font size when a text colour follows it', () => {
    // The chip primitive's exact case: the size was being deleted outright,
    // rendering every chip at its inherited size.
    expect(cn('font-mono text-h6 uppercase', 'text-tertiary')).toContain(
      'text-h6',
    );
  });

  it('still lets a later token font size win over an earlier one', () => {
    // Registering the group must not cost us the merging it exists to do.
    const result = cn('text-h6', 'text-h1');
    expect(result).toBe('text-h1');
  });

  it('treats a token size and a stock size as the same group', () => {
    expect(cn('text-h6', 'text-sm')).toBe('text-sm');
    expect(cn('text-sm', 'text-h6')).toBe('text-h6');
  });

  it('leaves text colours merging as they always did', () => {
    expect(cn('text-tertiary', 'text-primary')).toBe('text-primary');
  });
});
