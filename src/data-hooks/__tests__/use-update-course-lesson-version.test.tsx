// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '#/hooks/data/keys';
import { dataKeys } from '../keys';
import { useUpdateCourseLessonVersion } from '../use-update-course-lesson-version';

const REF = { courseSlug: 'itps', lessonSlug: 'stalls' };
/** One cached entry per reader, under the keys the readers really use. */
const BOARDS = [dataKeys.editorBoard(), dataKeys.courseBoard(7)];
const READERS = [
  dataKeys.orgLibrary(),
  dataKeys.lessonPosters(7),
  dataKeys.lessonPlayback(10, 7, 'course', 'fr'),
  queryKeys.courseDetails('itps'),
  queryKeys.lessonMaterial(REF),
  queryKeys.lessonPlayback(REF, 'en'),
  dataKeys.courseProgressSummary('itps'),
  dataKeys.debriefStatus('itps', 'stalls'),
  dataKeys.debriefAttempt('itps', 'stalls'),
  dataKeys.lessonQuizResult('stalls'),
];
const UNRELATED = [
  dataKeys.adminUsers(),
  dataKeys.lessonPlayback(11, 7, 'course'),
  dataKeys.lessonMaterial(10),
  dataKeys.lessonVideo(10),
];

afterEach(() => vi.restoreAllMocks());

/** Which of the entries are stale once the server has answered `response`. */
async function staleAfter(response: Response) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const client = new QueryClient();
  for (const key of [...BOARDS, ...READERS, ...UNRELATED]) {
    client.setQueryData(key, {});
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateCourseLessonVersion(), {
    wrapper,
  });
  await act(async () => {
    await result.current
      .mutateAsync({ courseId: 7, lessonId: 10, toVersion: '1.1' })
      .catch(() => {});
  });
  return [...BOARDS, ...READERS, ...UNRELATED].filter(
    (key) => client.getQueryState(key)?.isInvalidated,
  );
}
const refusal = (code: string) =>
  Response.json({ error: code, code }, { status: 409 });

describe('useUpdateCourseLessonVersion', () => {
  it('success: everything showing this lesson as the course has it, nothing else', async () => {
    expect(await staleAfter(Response.json({ version: '1.1' }))).toEqual([
      ...BOARDS,
      ...READERS,
    ]);
  });

  it('already there: the same, since it moved by another hand', async () => {
    expect(await staleAfter(refusal('current'))).toEqual([
      ...BOARDS,
      ...READERS,
    ]);
  });

  it('stale: the boards and the library, which show what Disciplines is on', async () => {
    expect(await staleAfter(refusal('stale'))).toEqual([
      ...BOARDS,
      dataKeys.orgLibrary(),
    ]);
  });

  it('a failure says nothing about the caches', async () => {
    expect(await staleAfter(new Response('x', { status: 500 }))).toEqual([]);
  });
});
