// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocRow } from '../training-doc-row';

describe('TrainingDocRow', () => {
  it('renders source and embedding count', () => {
    render(
      <TrainingDocRow
        sourcePath="file-a.pdf"
        count={20}
        onDelete={vi.fn()}
        isDeleting={false}
      />,
    );
    expect(screen.queryByText('file-a.pdf')).not.toBeNull();
    expect(screen.queryByText(/20 embeddings/i)).not.toBeNull();
  });

  it('requires opening the popover and confirming before delete fires', async () => {
    const onDelete = vi.fn();
    render(
      <TrainingDocRow
        sourcePath="file-a.pdf"
        count={20}
        onDelete={onDelete}
        isDeleting={false}
      />,
    );
    // Confirm is not in the DOM until the popover is opened.
    expect(screen.queryByRole('button', { name: /^confirm/i })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /delete file-a.pdf/i }),
    );
    const confirm = await screen.findByRole('button', { name: /^confirm/i });
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
