// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { ConfigSectionContainer } from '../config-section-container';

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
});
