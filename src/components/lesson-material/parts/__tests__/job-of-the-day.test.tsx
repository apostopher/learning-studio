// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobOfTheDay } from '../job-of-the-day';

describe('JobOfTheDay', () => {
  it('shows the empty note it is given, not a fixed one', () => {
    render(
      <JobOfTheDay
        jobOfTheDay={null}
        emptyText="Nothing to test for this lesson yet."
      />,
    );
    expect(
      screen.getByText('Nothing to test for this lesson yet.'),
    ).not.toBeNull();
    expect(screen.queryByText(/job of the day/i)).toBeNull();
  });
});
