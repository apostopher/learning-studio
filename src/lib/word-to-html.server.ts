import mammoth from 'mammoth';

/**
 * Convert a .docx buffer to HTML. Server-only (mammoth uses Node built-ins).
 * Throws on failure or empty output so callers surface a 5xx instead of feeding
 * empty HTML to the model.
 */
export async function wordToHtml(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer },
    { ignoreEmptyParagraphs: true },
  );
  if (!value || value.trim().length === 0) {
    throw new Error('Word document has no readable content.');
  }
  return value;
}
