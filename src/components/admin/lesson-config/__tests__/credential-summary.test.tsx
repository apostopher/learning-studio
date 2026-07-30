// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CredentialSummary,
  formatCredentialDisplay,
} from '../credential-summary';

describe('formatCredentialDisplay', () => {
  // Behaviour carried over verbatim from course-video-integrations-container so
  // the refactor does not change what admins see. The spacing around digit runs
  // is clumsy ("Api Key Last 4") — a copy fix, not a refactor fix.
  it('humanises camelCase keys', () => {
    expect(formatCredentialDisplay({ apiKeyLast4: '1234' })).toBe(
      'Api Key Last 4: 1234',
    );
  });

  it('joins multiple entries', () => {
    expect(formatCredentialDisplay({ keyId: 'abc', region: 'eu' })).toBe(
      'Key Id: abc · Region: eu',
    );
  });
});

describe('CredentialSummary', () => {
  const baseProps = {
    display: { keyId: 'abc123' },
    lastSavedAt: null,
    onUpdate: () => {},
  };

  it('shows the identifying fragment', () => {
    render(<CredentialSummary {...baseProps} />);

    expect(screen.getByText('Key Id: abc123')).toBeTruthy();
  });

  it('labels the timestamp as saved, not verified', () => {
    render(
      <CredentialSummary
        {...baseProps}
        lastSavedAt={new Date(2026, 6, 30, 14, 5)}
      />,
    );

    // The server stamps this on every write and never refreshes it, so calling
    // it "verified" would promise a freshness guarantee it cannot keep.
    expect(screen.getByText(/saved 30 Jul 2026 at 2:05 PM/)).toBeTruthy();
    expect(screen.queryByText(/verified/i)).toBeNull();
  });

  it('invokes onUpdate when the update button is clicked', () => {
    const onUpdate = vi.fn();
    render(<CredentialSummary {...baseProps} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /Update key/ }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('omits Remove when no handler is supplied', () => {
    render(<CredentialSummary {...baseProps} />);

    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('invokes onRemove when Remove is clicked', () => {
    const onRemove = vi.fn();
    render(<CredentialSummary {...baseProps} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('disables Remove while the removal is in flight', () => {
    const onRemove = vi.fn();
    render(<CredentialSummary {...baseProps} onRemove={onRemove} isRemoving />);

    const button = screen.getByRole('button', { name: /Remove/ });
    fireEvent.click(button);

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(onRemove).not.toHaveBeenCalled();
  });
});
