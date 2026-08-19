// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useMyLevelMock = vi.fn();
const mutateMock = vi.fn();
vi.mock('#/data-hooks/use-my-level', () => ({
  useMyLevel: (courseSlug: string) => useMyLevelMock(courseSlug),
  useAcknowledgeLevelChange: () => ({ mutate: mutateMock }),
}));

import { CourseLevelBannerForCourse } from '../course-level-banner-for-course';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CourseLevelBannerForCourse', () => {
  it('renders the bare (aria-hidden) bar when there is no pending change', () => {
    useMyLevelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
    });
    const { container } = render(
      <CourseLevelBannerForCourse courseSlug="c-1" />,
    );
    const bar = container.querySelector('.alert-bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the earned-promotion banner and dismisses it with the row id', () => {
    useMyLevelMock.mockReturnValue({
      data: {
        level: 'intermediate',
        pendingChange: {
          id: 9,
          level: 'intermediate',
          message: null,
          source: 'earned',
        },
      },
    });
    render(<CourseLevelBannerForCourse courseSlug="c-1" />);

    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('You’ve reached Intermediate');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mutateMock).toHaveBeenCalledWith(9);
  });

  it('renders the admin-change banner with the message', () => {
    useMyLevelMock.mockReturnValue({
      data: {
        level: 'advanced',
        pendingChange: {
          id: 11,
          level: 'advanced',
          message: 'Nice flying at the fly-in.',
          source: 'admin',
        },
      },
    });
    render(<CourseLevelBannerForCourse courseSlug="c-1" />);

    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('changed to Advanced');
    expect(banner.textContent).toContain('Nice flying at the fly-in.');
  });
});
