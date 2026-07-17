// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const { convertToHtml } = vi.hoisted(() => ({ convertToHtml: vi.fn() }));
vi.mock('mammoth', () => ({ default: { convertToHtml } }));

import { wordToHtml } from '../word-to-html.server';

describe('wordToHtml', () => {
  it("returns mammoth's HTML value", async () => {
    convertToHtml.mockResolvedValueOnce({
      value: '<p>Hello</p>',
      messages: [],
    });
    const html = await wordToHtml(Buffer.from('fake-docx'));
    expect(html).toBe('<p>Hello</p>');
    expect(convertToHtml).toHaveBeenCalledWith(
      { buffer: expect.any(Buffer) },
      { ignoreEmptyParagraphs: true },
    );
  });

  it('throws when mammoth returns empty output', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '   ', messages: [] });
    await expect(wordToHtml(Buffer.from('x'))).rejects.toThrow(
      /no readable content/i,
    );
  });

  it('throws when mammoth itself fails', async () => {
    convertToHtml.mockRejectedValueOnce(new Error('corrupt zip'));
    await expect(wordToHtml(Buffer.from('x'))).rejects.toThrow(/corrupt zip/);
  });
});
