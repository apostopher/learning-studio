// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CredentialNotice } from '../credential-notice';

describe('CredentialNotice', () => {
  it('announces the error tone to assistive tech', () => {
    render(
      <CredentialNotice tone="error">Key no longer works.</CredentialNotice>,
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'Key no longer works.',
    );
  });

  it('does not announce the info tone', () => {
    render(
      <CredentialNotice tone="info">A key is already saved.</CredentialNotice>,
    );

    // Expected content in a panel the admin just opened — interrupting a screen
    // reader for it would be noise.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('A key is already saved.')).toBeTruthy();
  });

  it('is text only — the surrounding state owns the affordances', () => {
    render(<CredentialNotice tone="error">Broken.</CredentialNotice>);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
