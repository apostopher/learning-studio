// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { ConfigSectionContainer } from '../config-section-container';

const mutate = vi.hoisted(() => vi.fn());
vi.mock('#/data-hooks/use-update-lesson-config', () => ({
  useUpdateLessonConfig: () => ({ mutate }),
}));

afterEach(() => {
  mutate.mockClear();
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
  requiredSubscriptions: [],
  isConfigured: false,
  videoProvider: null,
  videoRef: null,
};
const privateLesson: BoardLesson = { ...lesson, isAvailable: false };
const debriefOffLesson: BoardLesson = { ...lesson, hasDebrief: false };
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
  lessons: [lesson],
};
const freeModule: BoardModule = { ...paidModule, requiredSubscriptions: [] };

describe('ConfigSectionContainer', () => {
  it('renders the three setting rows', () => {
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

  it('disables the Subscription option when the module is free', () => {
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
      true,
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
      screen.getByRole('button', { name: 'On' }).getAttribute('aria-pressed'),
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

  it('clicking Private sends isAvailable: false', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: lesson.id,
      patch: { isAvailable: false },
    });
  });

  it('clicking Public from a private lesson sends isAvailable: true', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={privateLesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: privateLesson.id,
      patch: { isAvailable: true },
    });
  });

  it('clicking Off sends hasDebrief: false', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={lesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: lesson.id,
      patch: { hasDebrief: false },
    });
  });

  it('clicking On from a debrief-off lesson sends hasDebrief: true', () => {
    render(
      <ConfigSectionContainer
        courseId={1}
        lesson={debriefOffLesson}
        module={paidModule}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'On' }));
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
});
