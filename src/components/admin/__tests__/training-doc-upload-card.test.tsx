// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocUploadCard } from '../training-doc-upload-card';

const base = {
  fileName: null,
  onPickFile: vi.fn(),
  docName: '',
  onDocNameChange: vi.fn(),
  onSubmit: vi.fn(),
  status: 'idle' as const,
  error: null,
};

describe('TrainingDocUploadCard', () => {
  it('disables submit when no file is selected', () => {
    render(<TrainingDocUploadCard {...base} />);
    const submit = screen.getByRole('button', {
      name: /upload document/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables submit and shows the selected file name', () => {
    render(<TrainingDocUploadCard {...base} fileName="drone-manual.pdf" />);
    expect(screen.queryByText('drone-manual.pdf')).not.toBeNull();
    const submit = screen.getByRole('button', {
      name: /upload document/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('shows processing label and disables submit while processing', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        fileName="drone-manual.pdf"
        status="processing"
      />,
    );
    expect(screen.queryByText(/processing embeddings/i)).not.toBeNull();
    const submit = screen.getByRole('button', {
      name: /processing embeddings/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('renders an error message', () => {
    render(<TrainingDocUploadCard {...base} error="Only PDF or Word files" />);
    expect(screen.queryByText('Only PDF or Word files')).not.toBeNull();
  });
});
