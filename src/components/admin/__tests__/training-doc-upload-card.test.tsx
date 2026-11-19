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
  it('disables submit when no file is selected, and says why', () => {
    render(<TrainingDocUploadCard {...base} />);
    const submit = screen.getByRole('button', {
      name: 'Choose a file first',
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

  /**
   * A disabled submit must say why. With a source picked but no file, the
   * label (and so the accessible name) asks for the file. Mutant this
   * catches: the old "Upload Document" label on a button that cannot upload.
   */
  it('names the missing file when a source is picked but no file is', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        source={{ value: 'itps', onChange: vi.fn() }}
      />,
    );
    const submit = screen.getByRole('button', {
      name: 'Choose a file first',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('asks for the source first when both are missing', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        source={{ value: null, onChange: vi.fn() }}
      />,
    );
    const submit = screen.getByRole('button', {
      name: 'Choose a source first',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  /**
   * The disabled button's label IS its reason, so it must stay legible:
   * faded text drops under WCAG AA. Same for the Source radios while busy.
   */
  it('keeps disabled controls legible: no opacity fade', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        fileName="drone-manual.pdf"
        source={{ value: null, onChange: vi.fn() }}
      />,
    );
    const submit = screen.getByRole('button', {
      name: 'Choose a source first',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const faded = (el: Element) =>
      [...el.classList].filter((c) => /(^|:)opacity-/.test(c));
    expect(faded(submit)).toEqual([]);
    for (const radio of screen.getAllByRole('radio')) {
      expect(faded(radio)).toEqual([]);
    }
  });

  it('does not fade the form while an upload is in flight', () => {
    const { container } = render(
      <TrainingDocUploadCard
        {...base}
        fileName="drone-manual.pdf"
        status="processing"
        source={{ value: 'itps', onChange: vi.fn() }}
      />,
    );
    const faded = [...container.querySelectorAll('*')].flatMap((el) =>
      [...el.classList].filter((c) => /(^|:)opacity-/.test(c)),
    );
    expect(faded).toEqual([]);
  });
});
