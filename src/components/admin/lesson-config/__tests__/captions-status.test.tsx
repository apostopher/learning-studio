// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CaptionsStatus, CaptionsStatusLoadError } from '../captions-status';

const base = { languageLabel: 'French', error: null };

describe('CaptionsStatus', () => {
  it.each([
    ['generating', 'Generating French captions… usually a few minutes'],
    ['ready', 'French captions ready'],
    ['unsupported', "Mux can't generate French captions"],
    [
      'no_token',
      "Add a Mux API token to this course's Mux credentials to generate captions",
    ],
    ['none', 'No captions yet'],
  ] as const)('%s states itself', (status, text) => {
    render(<CaptionsStatus {...base} status={status} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('a failure states its reason and offers Retry, which reaches the caller', () => {
    const onRequest = vi.fn();
    render(
      <CaptionsStatus
        {...base}
        status="failed"
        error="Mux rejected the API token."
        onRequest={onRequest}
      />,
    );
    expect(
      screen.getByText('French captions failed: Mux rejected the API token.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('no captions yet offers Generate captions', () => {
    const onRequest = vi.fn();
    render(<CaptionsStatus {...base} status="none" onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate captions' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('a request in flight disables the button and says so', () => {
    render(
      <CaptionsStatus
        {...base}
        status="failed"
        error="x"
        onRequest={vi.fn()}
        isRequesting
      />,
    );
    const button = screen.getByRole('button', {
      name: 'Requesting…',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    // Dimming would drop the label below AA; busy is stated, not faded.
    expect(button.className).not.toContain('opacity');
  });

  it('says why a request failed', () => {
    render(
      <CaptionsStatus
        {...base}
        status="none"
        onRequest={vi.fn()}
        requestError="Captions come from the provider for this video."
      />,
    );
    expect(
      screen.getByText('Captions come from the provider for this video.'),
    ).toBeTruthy();
  });

  it('renders nothing for a video that is not on Mux', () => {
    const { container } = render(<CaptionsStatus {...base} status="not_mux" />);
    expect(container.textContent).toBe('');
  });
});

describe('CaptionsStatusLoadError', () => {
  it('states that the status could not be loaded, as a status line', () => {
    render(<CaptionsStatusLoadError />);
    const line = screen.getByText("Couldn't load captions status");
    expect(line.closest('output')).not.toBeNull();
  });
});
