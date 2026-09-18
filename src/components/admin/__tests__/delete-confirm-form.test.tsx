// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteConfirmForm } from '../delete-confirm-form';

const registerConfirm = {
  name: 'confirm' as const,
  onChange: vi.fn(),
  onBlur: vi.fn(),
  ref: vi.fn(),
};

describe('DeleteConfirmForm', () => {
  it('asks for the thing’s NAME, in the label and the placeholder — not a stock phrase', () => {
    render(
      <DeleteConfirmForm
        confirmPhrase="Swiss Cheese"
        warning="w"
        submitLabel="Delete lesson"
        onSubmit={vi.fn()}
        registerConfirm={registerConfirm}
        canSubmit={false}
        isPending={false}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Type\s+Swiss Cheese\s+to confirm/i);
    expect((input as HTMLInputElement).placeholder).toBe('Swiss Cheese');
    expect(screen.queryByText(/permanently delete/i)).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Delete lesson',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
