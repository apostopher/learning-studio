import { describe, expect, it } from 'vitest';
import {
  htmlToSections,
  chunkSectionTokens,
  splitIntoSentences,
  trySnapToSentenceBoundary,
} from '#/ai/embeddings-helper';

describe('htmlToSections', () => {
  it('strips tags and drops paragraphs shorter than 20 chars', () => {
    const html = `<p>short</p>\n\n<p>${'a'.repeat(30)}</p>`;
    const sections = htmlToSections(html, 'file-x');
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('file-x');
    expect(sections[0].text).not.toContain('<p>');
  });
});

describe('chunkSectionTokens', () => {
  it('prefixes each chunk with name + section and keeps single-chunk short text intact', () => {
    const chunks = chunkSectionTokens({
      heading: 'Section 1',
      text: 'The quick brown fox jumps over the lazy dog. Again it jumps.',
      name: 'file-x',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.startsWith('Name: file-x > Section: Section 1')).toBe(
      true,
    );
    expect(chunks[0].name).toBe('file-x');
  });

  it('splits long text into multiple overlapping chunks', () => {
    const long = `${Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')}.`;
    const chunks = chunkSectionTokens({
      heading: 'Section 1',
      text: long,
      name: 'file-x',
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('splitIntoSentences', () => {
  it('splits on sentence boundaries', () => {
    expect(splitIntoSentences('One. Two. Three.')).toEqual([
      'One.',
      'Two.',
      'Three.',
    ]);
  });
  it('returns the whole text when there is no boundary', () => {
    expect(splitIntoSentences('no boundary here')).toEqual(['no boundary here']);
  });
});

describe('trySnapToSentenceBoundary', () => {
  it('snaps to the last terminator within 40 chars', () => {
    expect(trySnapToSentenceBoundary('Hello world. tail')).toBe('Hello world.');
  });
  it('returns null when no terminator is near the end', () => {
    expect(trySnapToSentenceBoundary(`no terminator ${'x'.repeat(60)}`)).toBeNull();
  });
});
