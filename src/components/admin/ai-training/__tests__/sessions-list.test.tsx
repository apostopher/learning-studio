// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SessionListItem, SessionsList } from '../sessions-list';

const SESSION: SessionListItem = {
  id: 'c1',
  title: 'Crosswind question',
  learnerName: 'Ada Lovelace',
  updatedAt: new Date('2026-11-19T08:30:00'),
  messageCount: 4,
  isVideoCall: false,
};

const base = {
  sessions: [SESSION],
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  page: 0,
  previousDisabledReason: null,
  nextDisabledReason: null,
  onPrevious: vi.fn(),
  onNext: vi.fn(),
};

afterEach(cleanup);

describe('SessionsList', () => {
  it('shows an empty state', () => {
    render(<SessionsList {...base} sessions={[]} />);
    expect(screen.queryByText('No conversations yet.')).not.toBeNull();
  });

  it('marks video-call sessions', () => {
    render(
      <SessionsList
        {...base}
        sessions={[
          SESSION,
          { ...SESSION, id: 'c2', title: 'Call', isVideoCall: true },
        ]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).queryByText('Video call')).toBeNull();
    expect(
      within(rows[1] as HTMLElement).queryByText('Video call'),
    ).not.toBeNull();
  });

  it('names a learner with no profile name', () => {
    render(
      <SessionsList
        {...base}
        sessions={[{ ...SESSION, learnerName: null, messageCount: 0 }]}
      />,
    );
    expect(screen.queryByText('Unnamed learner')).not.toBeNull();
    expect(screen.queryByText('0 messages')).not.toBeNull();
  });

  it('says 1 message, not 1 messages', () => {
    render(
      <SessionsList {...base} sessions={[{ ...SESSION, messageCount: 1 }]} />,
    );
    expect(screen.queryByText('1 message')).not.toBeNull();
  });

  it('hands the chosen chat id to onSelect and marks the selected row', () => {
    const onSelect = vi.fn();
    render(<SessionsList {...base} selectedId="c1" onSelect={onSelect} />);
    const row = screen.getByRole('button', { name: /Crosswind question/ });
    expect(row.getAttribute('aria-current')).toBe('true');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('shows a loading state instead of rows', () => {
    render(<SessionsList {...base} isLoading />);
    expect(screen.queryByText(/Loading conversations/)).not.toBeNull();
    expect(screen.queryByText('Crosswind question')).toBeNull();
  });

  it('shows an error with a retry', () => {
    const onRetry = vi.fn();
    render(
      <SessionsList
        {...base}
        sessions={[]}
        error="Couldn't load conversations."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't load conversations.",
    );
    expect(screen.queryByText('No conversations yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says why a paging control is disabled, visibly and in its name', () => {
    const onPrevious = vi.fn();
    render(
      <SessionsList
        {...base}
        previousDisabledReason="No newer conversations"
        onPrevious={onPrevious}
      />,
    );
    const previous = screen.getByRole('button', {
      name: 'Previous: No newer conversations',
    });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText('No newer conversations')).not.toBeNull();
    fireEvent.click(previous);
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('pages forward through onNext', () => {
    const onNext = vi.fn();
    render(<SessionsList {...base} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
