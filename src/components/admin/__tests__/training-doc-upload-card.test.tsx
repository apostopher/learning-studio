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
    expect(
      screen.getByRole('button', { name: /upload document/i }),
    ).toBeDisabled();
  });

  it('enables submit and shows the selected file name', () => {
    render(<TrainingDocUploadCard {...base} fileName="drone-manual.pdf" />);
    expect(screen.getByText('drone-manual.pdf')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upload document/i }),
    ).toBeEnabled();
  });

  it('shows processing label and disables submit while processing', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        fileName="drone-manual.pdf"
        status="processing"
      />,
    );
    expect(screen.getByText(/processing embeddings/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /processing embeddings/i }),
    ).toBeDisabled();
  });

  it('renders an error message', () => {
    render(<TrainingDocUploadCard {...base} error="Only PDF or Word files" />);
    expect(screen.getByText('Only PDF or Word files')).toBeInTheDocument();
  });
});
