// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { ConfigSectionContainer } from '../config-section-container';

const mutate = vi.hoisted(() => vi.fn());
const setVisibility = vi.hoisted(() => vi.fn());
vi.mock('#/data-hooks/use-update-lesson-config', () => ({
  useUpdateLessonConfig: () => ({ mutate }),
}));
vi.mock('#/data-hooks/use-set-lesson-visibility', () => ({
  useSetLessonVisibility: () => ({ mutate: setVisibility }),
}));

afterEach(() => {
  mutate.mockClear();
  setVisibility.mockClear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const lesson: BoardLesson = {
  id: 10,
  name: 'L',
  slug: 'l',
  rank: 1,
  isAvailable: true,
  hasDebrief: true,
  needsVideoWatch: true,
  requiredSubscriptions: [],
  levels: [],
  isConfigured: false,
  quizQuestionCount: 0,
  version: '1.0',
  disciplineVersion: '1.0',
  dependsOn: [],
  videoProvider: null,
  videoRef: null,
};
const privateLesson: BoardLesson = { ...lesson, isAvailable: false };
const debriefOffLesson: BoardLesson = { ...lesson, hasDebrief: false };
/** Has a video, so Video watch is fully editable. */
const videoLesson: BoardLesson = {
  ...lesson,
  isConfigured: true,
  quizQuestionCount: 0,
  dependsOn: [],
  videoProvider: 'synthesia',
  videoRef: 'ref',
};
/** No video and not currently required — Required must be blocked. */
const noVideoOptionalLesson: BoardLesson = {
  ...lesson,
  isConfigured: false,
  quizQuestionCount: 0,
  dependsOn: [],
  needsVideoWatch: false,
};
const subscriptionLesson: BoardLesson = {
  ...lesson,
  requiredSubscriptions: ['associate'],
};
const paidModule: BoardModule = {
  id: 1,
  name: 'M',
  slug: 'm',
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: 1,
  requiredSubscriptions: ['associate'],
  dependsOn: [],
  sequentialLessons: true,
  learnerCount: 0,
  owner: { id: 1, name: 'M' },
  otherCourseCount: 0,
  lessons: [lesson],
};
const freeModule: BoardModule = { ...paidModule, requiredSubscriptions: [] };

describe('ConfigSectionContainer', () => {
  it('renders the four setting rows', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Access' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Video watch' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Debrief' })).toBeTruthy();
  });

  it('marks the active availability option pressed', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    expect(
      screen
        .getByRole('button', { name: 'Public' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('offers Subscription even when the module is free', () => {
    // No screen sets a module's access, so every module is free; paid then
    // takes every subscription (`accessSubscriptions`).
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={freeModule}
      />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: 'Subscription' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('marks the active debrief option pressed', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    expect(
      within(screen.getByRole('group', { name: 'Debrief' }))
        .getByRole('button', { name: 'Required' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('marks the active access option pressed', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    expect(
      screen.getByRole('button', { name: 'Free' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('clicking Private hides it in this course', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(setVisibility).toHaveBeenCalledWith({
      courseId: 1,
      lessonId: lesson.id,
      isVisible: false,
    });
  });

  it('clicking Public from a private lesson shows it in this course', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={privateLesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    expect(setVisibility).toHaveBeenCalledWith({
      courseId: 1,
      lessonId: privateLesson.id,
      isVisible: true,
    });
  });

  it('clicking Optional on Debrief sends hasDebrief: false', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Debrief' })).getByRole(
        'button',
        { name: 'Optional' },
      ),
    );
    expect(mutate).toHaveBeenCalledWith({
      lessonId: lesson.id,
      patch: { hasDebrief: false },
    });
  });

  it('clicking Required from a debrief-optional lesson sends hasDebrief: true', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={debriefOffLesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Debrief' })).getByRole(
        'button',
        { name: 'Required' },
      ),
    );
    expect(mutate).toHaveBeenCalledWith({
      lessonId: debriefOffLesson.id,
      patch: { hasDebrief: true },
    });
  });

  it('clicking Subscription with a paid module sends the module’s subscriptions', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Subscription' }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: lesson.id,
      patch: { requiredSubscriptions: ['associate'] },
    });
  });

  it('clicking Free from a subscription lesson sends an empty array', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={subscriptionLesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Free' }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: subscriptionLesson.id,
      patch: { requiredSubscriptions: [] },
    });
  });

  it('clicking Optional sends needsVideoWatch: false', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={videoLesson}
        module={freeModule}
      />,
      { wrapper },
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Video watch' })).getByRole(
        'button',
        { name: 'Optional' },
      ),
    );
    expect(mutate).toHaveBeenCalledWith({
      lessonId: videoLesson.id,
      patch: { needsVideoWatch: false },
    });
  });

  it('clicking Required from an optional lesson with a video sends true', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={{ ...videoLesson, needsVideoWatch: false }}
        module={freeModule}
      />,
      { wrapper },
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Video watch' })).getByRole(
        'button',
        { name: 'Required' },
      ),
    );
    expect(mutate).toHaveBeenCalledWith({
      lessonId: videoLesson.id,
      patch: { needsVideoWatch: true },
    });
  });

  it('disables Required and warns when the lesson has no video', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={noVideoOptionalLesson}
        module={freeModule}
      />,
      { wrapper },
    );
    expect(
      within(screen.getByRole('group', { name: 'Video watch' })).getByRole(
        'button',
        { name: 'Required' },
      ),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toMatch(/no video yet/i);
  });

  it('leaves Required clickable when it is already selected without a video', () => {
    // The 20 imported lessons in this state must not render their selected
    // option disabled — and must be able to move to Optional.
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={freeModule}
      />,
      { wrapper },
    );
    expect(
      within(screen.getByRole('group', { name: 'Video watch' })).getByRole(
        'button',
        { name: 'Required' },
      ),
    ).toHaveProperty('disabled', false);
    expect(screen.getByRole('status').textContent).toMatch(
      /never be satisfied/i,
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Video watch' })).getByRole(
        'button',
        { name: 'Optional' },
      ),
    );
    expect(mutate).toHaveBeenCalledWith({
      lessonId: lesson.id,
      patch: { needsVideoWatch: false },
    });
  });

  it('shows no warning when the lesson has a video', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={videoLesson}
        module={freeModule}
      />,
      { wrapper },
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
