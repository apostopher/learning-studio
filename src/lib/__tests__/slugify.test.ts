import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Intro to Flying')).toBe('intro-to-flying');
  });
  it('strips punctuation and collapses separators', () => {
    expect(slugify('A/B  &  C!!')).toBe('a-b-c');
  });
  it('trims leading/trailing separators', () => {
    expect(slugify('  -Hello- ')).toBe('hello');
  });
  it('removes diacritics', () => {
    expect(slugify('Aviación Básica')).toBe('aviacion-basica');
  });
  it('returns empty string when nothing slug-able remains', () => {
    expect(slugify('!!!')).toBe('');
  });
});
