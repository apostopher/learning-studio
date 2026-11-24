// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  readVersionConflict,
  throwIfWriteFailed,
  useSettleContentWrite,
  VersionConflictError,
} from '#/data-hooks/version-conflict';

const CONFLICT = {
  error: 'v1.0 is used by 3 courses. Enter a higher version to make changes.',
  code: 'version',
  version: '1.0',
  highestTaken: '1.0',
};
const answer = (body: unknown, status: number) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });

describe('readVersionConflict', () => {
  it('is the message of a version 409', async () => {
    expect(await readVersionConflict(answer(CONFLICT, 409))).toBe(
      CONFLICT.error,
    );
  });

  it.each([
    ['another 409', answer({ error: 'In use', code: 'in-use' }, 409)],
    ['a 409 that is not JSON', answer('no', 409)],
    ['any other status', answer(CONFLICT, 400)],
  ])('is null for %s', async (_name, res) => {
    expect(await readVersionConflict(res)).toBeNull();
  });
});

describe('throwIfWriteFailed', () => {
  it('tells a version conflict from any other failure', async () => {
    await expect(
      throwIfWriteFailed(answer(CONFLICT, 409), 'Failed'),
    ).rejects.toEqual(new VersionConflictError(CONFLICT.error));
    const other = throwIfWriteFailed(answer('no', 500), 'Failed (500)');
    await expect(other).rejects.toThrow('Failed (500)');
    await expect(other).rejects.not.toBeInstanceOf(VersionConflictError);
    await expect(
      throwIfWriteFailed(answer({}, 200), 'Failed'),
    ).resolves.toBeUndefined();
  });
});

describe('useSettleContentWrite', () => {
  const lesson = { id: 10, version: '1.1', versionCourseCount: 1 };
  const other = { id: 11, version: '1.0', versionCourseCount: 2 };

  async function savedOver(cached: typeof lesson, version?: string) {
    const client = new QueryClient();
    client.setQueryData(dataKeys.orgLibrary(), {
      untitled: [other],
      disciplines: [
        { id: 1, untitled: [], modules: [{ id: 2, lessons: [cached] }] },
      ],
    });
    const { result } = renderHook(() => useSettleContentWrite(10), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.saved(version));
    const library = client.getQueryData<{
      untitled: unknown[];
      disciplines: { modules: { lessons: unknown[] }[] }[];
    }>(dataKeys.orgLibrary());
    expect(library?.untitled).toEqual([other]);
    return library?.disciplines[0].modules[0].lessons[0];
  }

  it('puts the saved version on the lesson, wherever it is filed', async () => {
    expect(await savedOver(lesson, '1.2')).toEqual({
      ...lesson,
      version: '1.2',
      versionCourseCount: 0,
    });
  });

  it('leaves the count of a version the library already knows about', async () => {
    // Two writes share one version; a course took it between their answers.
    expect(await savedOver(lesson, '1.1')).toEqual(lesson);
  });

  it('leaves the version alone when the write sent none', async () => {
    expect(await savedOver(lesson)).toEqual(lesson);
  });
});
