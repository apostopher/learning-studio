import { describe, expect, it } from 'vitest';
import { buildChatRequestBody } from '#/components/chat-widget/use-chat-widget';

/**
 * `useChatWidget` itself is not rendered here — this repo's Vite pipeline
 * nulls the React hook dispatcher for any hook that calls a raw React/router
 * hook (`useRef`, `useParams`, ...) when exercised via `renderHook` (see the
 * doc comment on `buildChatRequestBody` in `use-chat-widget.ts`, and the
 * skipped tests in `use-chat-window-geometry.test.ts` for the fuller
 * writeup). `buildChatRequestBody` is the part of the `courseSlug` plumbing
 * that COULD be pulled out as a pure function, so it's tested directly here;
 * the other half — `useParams({ strict: false })` actually reading the
 * matched route's `courseSlug` — is verified only by `tsc` and static
 * reading, not by a test.
 */
describe('buildChatRequestBody', () => {
  it('carries the current courseSlug through to the request body', () => {
    const result = buildChatRequestBody({
      id: 'req-1',
      messages: [],
      trigger: 'submit-message',
      messageId: undefined,
      body: undefined,
      chatId: 'chat-1',
      courseSlug: 'itps-uas-remote',
    });
    expect(result).toMatchObject({
      courseSlug: 'itps-uas-remote',
      chatId: 'chat-1',
    });
  });

  it('carries courseSlug through as undefined on a route with no course (e.g. /app)', () => {
    const result = buildChatRequestBody({
      id: 'req-1',
      messages: [],
      trigger: 'submit-message',
      messageId: undefined,
      body: undefined,
      chatId: undefined,
      courseSlug: undefined,
    });
    expect(result.courseSlug).toBeUndefined();
  });

  it('does not let a custom body field silently drop the standard fields', () => {
    // Regression guard for the exact footgun documented on
    // prepareSendMessagesRequest: its returned `body` REPLACES the whole
    // request body rather than merging, so every field the route needs must
    // survive the spread here.
    const result = buildChatRequestBody({
      id: 'req-1',
      messages: [{ id: 'm1', role: 'user', parts: [] }],
      trigger: 'submit-message',
      messageId: 'm1',
      body: undefined,
      chatId: 'chat-1',
      courseSlug: 'itps-uas-remote',
    });
    expect(result).toMatchObject({
      id: 'req-1',
      messages: [{ id: 'm1', role: 'user', parts: [] }],
      trigger: 'submit-message',
      messageId: 'm1',
    });
  });
});
