// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { convertToHtml, generateText } = vi.hoisted(() => ({
  convertToHtml: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('mammoth', () => ({ default: { convertToHtml } }));
vi.mock('ai', () => ({ generateText }));

import { convertWordToHtml, convertPdfToHtml } from '#/common/html-converters';

beforeEach(() => vi.clearAllMocks());

describe('convertWordToHtml', () => {
  it('returns mammoth html', async () => {
    convertToHtml.mockResolvedValue({ value: '<p>hi</p>' });
    expect(await convertWordToHtml(Buffer.from('x'))).toBe('<p>hi</p>');
  });
  it('returns empty string on error', async () => {
    convertToHtml.mockRejectedValue(new Error('bad'));
    expect(await convertWordToHtml(Buffer.from('x'))).toBe('');
  });
});

describe('convertPdfToHtml', () => {
  it('returns trimmed model text', async () => {
    generateText.mockResolvedValue({ text: '  <h1>t</h1>  ' });
    const html = await convertPdfToHtml('file.pdf', new ArrayBuffer(4));
    expect(html).toBe('<h1>t</h1>');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash' }),
    );
  });
  it('returns empty string on error', async () => {
    generateText.mockRejectedValue(new Error('bad'));
    expect(await convertPdfToHtml('file.pdf', new ArrayBuffer(4))).toBe('');
  });
});
