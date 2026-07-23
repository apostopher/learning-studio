const TITLE_MAX_LENGTH = 60;

/**
 * Derive a chat title from the first user message: collapse whitespace, trim,
 * and cap at 60 chars (appending an ellipsis when truncated). Falls back to
 * 'New chat' for empty/whitespace-only input. Pure — no DB access — so it's
 * unit tested directly (see __tests__/chat-title.test.ts) and can be imported
 * by src/db/chat.ts as a plain static import without pulling in the db module.
 */
export function chatTitleFromText(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return 'New chat';
  if (collapsed.length <= TITLE_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, TITLE_MAX_LENGTH)}…`;
}
