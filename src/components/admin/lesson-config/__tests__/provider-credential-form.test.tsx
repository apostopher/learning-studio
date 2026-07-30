// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type CredentialField,
  ProviderCredentialForm,
} from '../provider-credential-form';

/** Minimal stand-in for what react-hook-form's `register` returns. */
const field = (name: string, error?: string): CredentialField => ({
  name,
  label: name,
  type: 'password',
  register: { name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() },
  error,
});

describe('ProviderCredentialForm', () => {
  const baseProps = {
    fields: [field('apiKey')],
    onSubmit: (e: React.FormEvent) => e.preventDefault(),
    isPending: false,
  };

  it('renders no Cancel button for first-time setup', () => {
    render(<ProviderCredentialForm {...baseProps} />);

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('invokes onCancel without submitting when Cancel is clicked', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <ProviderCredentialForm
        {...baseProps}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    // type="button", so backing out must never fire the save.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never prefills a secret field', () => {
    render(<ProviderCredentialForm {...baseProps} />);

    const input = screen.getByLabelText('apiKey') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('associates a field error with its input', () => {
    render(
      <ProviderCredentialForm
        {...baseProps}
        fields={[field('apiKey', 'Required')]}
      />,
    );

    const input = screen.getByLabelText('apiKey');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Required',
    );
  });
});
