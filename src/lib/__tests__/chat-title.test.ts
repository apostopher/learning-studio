import { describe, expect, it } from 'vitest';
import { chatTitleFromText } from '#/lib/chat-title';

describe('chatTitleFromText', () => {
  it('collapses whitespace and keeps short text whole', () => {
    expect(chatTitleFromText('  hello   world  ')).toBe('hello world');
  });
  it('truncates long text with an ellipsis at 60 chars', () => {
    const t = chatTitleFromText('a'.repeat(80));
    expect(t.length).toBe(61); // 60 + ellipsis
    expect(t.endsWith('…')).toBe(true);
  });
  it('falls back for empty input', () => {
    expect(chatTitleFromText('   ')).toBe('New chat');
  });
});
