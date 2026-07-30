import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMySubscribedSlugs = vi.hoisted(() => vi.fn());
const getCourseResumeTarget = vi.hoisted(() => vi.fn());

vi.mock('#/lib/course-functions', () => ({ getMySubscribedSlugs }));
vi.mock('#/lib/course-resume-functions', () => ({ getCourseResumeTarget }));

const { courseResumeQueryOptions, subscribedSlugsQueryOptions } = await import(
  '../course-access-queries'
);

// The hoisted mocks are module-scoped (vi.mock factories require a hoisted
// reference), so call counts leak across `it` blocks without this — matching
// this file's other data-hooks tests, which reset mocks between cases.
afterEach(() => vi.clearAllMocks());

describe('subscribedSlugsQueryOptions', () => {
  it('serves a second guard from cache instead of calling the server again', async () => {
    getMySubscribedSlugs.mockResolvedValue(['nav-basics']);
    const client = new QueryClient();

    const first = await client.ensureQueryData(subscribedSlugsQueryOptions());
    const second = await client.ensureQueryData(subscribedSlugsQueryOptions());

    expect(first).toEqual(['nav-basics']);
    expect(second).toEqual(['nav-basics']);
    // The redirect hop re-runs the layout guard; that must not re-query.
    expect(getMySubscribedSlugs).toHaveBeenCalledTimes(1);
  });
});

describe('courseResumeQueryOptions', () => {
  it('passes the slug through to the server function as input data', async () => {
    getCourseResumeTarget.mockResolvedValue({
      kind: 'lesson',
      moduleSlug: 'm1',
      lessonSlug: 'l1',
    });
    const client = new QueryClient();

    await client.ensureQueryData(courseResumeQueryOptions('nav-basics'));

    expect(getCourseResumeTarget).toHaveBeenCalledWith({
      data: { courseSlug: 'nav-basics' },
    });
  });

  it('caches per slug, not globally', async () => {
    getCourseResumeTarget.mockResolvedValue({
      kind: 'none',
      reason: 'no-lessons',
    });
    const client = new QueryClient();

    await client.ensureQueryData(courseResumeQueryOptions('course-a'));
    await client.ensureQueryData(courseResumeQueryOptions('course-b'));

    expect(getCourseResumeTarget).toHaveBeenCalledTimes(2);
  });
});
