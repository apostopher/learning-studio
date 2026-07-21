import { encode, decode } from 'gpt-tokenizer';

// -------- precision knobs --------
const CHUNK_TOKENS = 300;
const OVERLAP_TOKENS = 70;
const MIN_PARAGRAPH_CHARS = 20;

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Section = {
  heading: string;
  text: string;
  name: string;
};

/** Extract text content from HTML and split into logical sections. */
export function htmlToSections(html: string, name: string): Section[] {
  const textContent = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return textContent
    .split(/(?:\n\s*\n|\r\n\s*\r\n)/)
    .map((section) => section.trim())
    .filter((section) => section.length >= MIN_PARAGRAPH_CHARS)
    .map((section, index) => ({
      heading: `Section ${index + 1}`,
      text: section,
      name,
    }));
}

/** Token-aware chunker: 300 tokens with 70 overlap. */
export function chunkSectionTokens(section: Section) {
  const sentences = splitIntoSentences(section.text);
  const joined = sentences.join(' ');
  const tokens = encode(joined);

  const chunks: { heading: string; text: string; name: string }[] = [];
  const prefix = `Name: ${section.name} > Section: ${section.heading}\n\n`;

  let i = 0;
  while (i < tokens.length) {
    const j = Math.min(i + CHUNK_TOKENS, tokens.length);
    let body = decode(tokens.slice(i, j)).trim();

    if (j < tokens.length) {
      const soft = trySnapToSentenceBoundary(body);
      if (soft) body = soft;
    }

    chunks.push({
      heading: section.heading,
      text: `${prefix}${body}`,
      name: section.name,
    });

    if (j === tokens.length) break;
    i = Math.max(0, j - OVERLAP_TOKENS);
  }
  return chunks;
}

export function splitIntoSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}

export function trySnapToSentenceBoundary(s: string): string | null {
  const idx = Math.max(s.lastIndexOf('.'), s.lastIndexOf('!'), s.lastIndexOf('?'));
  if (idx > -1 && s.length - idx <= 40) return s.slice(0, idx + 1).trim();
  return null;
}
