// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlternateVideoForm } from '../alternate-video-form';

const registerUrl = {
  name: 'url' as const,
  onChange: vi.fn(),
  onBlur: vi.fn(),
  ref: vi.fn(),
};
const base = {
  onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
  lang: 'fr-CA' as const,
  langOptions: [{ code: 'fr-CA' as const, label: 'Canadian French' }],
  onLangChange: vi.fn(),
  registerUrl,
  detectedLabel: null,
  showUnsupported: false,
  isPending: false,
};

describe('AlternateVideoForm', () => {
  it('keeps Add disabled until a provider is detected', () => {
    render(<AlternateVideoForm {...base} />);
    expect(
      (
        screen.getByRole('button', {
          name: 'Add language',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('enables Add and names the detected provider', () => {
    render(<AlternateVideoForm {...base} detectedLabel="Synthesia" />);
    expect(screen.getByText('Detected: Synthesia')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Add language',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('explains an unsupported URL', () => {
    render(<AlternateVideoForm {...base} showUnsupported />);
    expect(screen.getByText(/unsupported url/i)).toBeTruthy();
  });

  it('says why nothing can be added when every language is taken', () => {
    render(<AlternateVideoForm {...base} lang={null} langOptions={[]} />);
    expect(
      screen.getByText(/every supported language is attached/i),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add language' })).toBeNull();
  });

  it('still shows a server error when every language is taken', () => {
    render(
      <AlternateVideoForm
        {...base}
        lang={null}
        langOptions={[]}
        serverError="boom"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('boom');
  });
});
