// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocsList } from '../training-docs-list';

const docs = [
  { sourcePath: 'file-alpha.pdf', count: 20 },
  { sourcePath: 'file-beta.docx', count: 15 },
];

const base = {
  docs,
  search: '',
  onSearchChange: vi.fn(),
  onDelete: vi.fn(),
  deletingSourcePath: null,
  isLoading: false,
};

describe('TrainingDocsList', () => {
  it('shows the count and all rows', () => {
    render(<TrainingDocsList {...base} />);
    expect(screen.queryByText(/2 documents/i)).not.toBeNull();
    expect(screen.queryByText('file-alpha.pdf')).not.toBeNull();
    expect(screen.queryByText('file-beta.docx')).not.toBeNull();
  });

  it('filters rows by search (case-insensitive)', () => {
    render(<TrainingDocsList {...base} search="BETA" />);
    expect(screen.queryByText('file-alpha.pdf')).toBeNull();
    expect(screen.queryByText('file-beta.docx')).not.toBeNull();
  });

  it('renders an empty state when there are no docs', () => {
    render(<TrainingDocsList {...base} docs={[]} />);
    expect(screen.queryByText(/no training documents yet/i)).not.toBeNull();
  });

  it('shows a loading state', () => {
    render(<TrainingDocsList {...base} docs={[]} isLoading />);
    expect(screen.queryByText(/loading/i)).not.toBeNull();
  });

  /**
   * The two narrowings combine: a doc must match the source AND the search.
   * Mutant this catches: either filter dropped, which leaves "Wx basics"
   * (wrong source) on screen.
   */
  it('filters by source and search together', () => {
    const onChange = vi.fn();
    render(
      <TrainingDocsList
        {...base}
        docs={[
          { sourcePath: 'Wx brief', count: 3, source: 'itps' },
          { sourcePath: 'Wx basics', count: 4, source: '3d-airmanship' },
          { sourcePath: 'Nav brief', count: 5, source: 'itps' },
        ]}
        search="wx"
        sourceFilter={{ value: 'itps', onChange }}
      />,
    );
    expect(screen.queryByText('Wx brief')).not.toBeNull();
    expect(screen.queryByText('Wx basics')).toBeNull();
    expect(screen.queryByText('Nav brief')).toBeNull();
    // The row says which training set it belongs to.
    expect(screen.queryAllByText('ITPS').length).toBeGreaterThan(0);

    fireEvent.click(
      within(
        screen.getByRole('radiogroup', { name: /filter by source/i }),
      ).getByRole('radio', { name: '3D Airmanship' }),
    );
    expect(onChange).toHaveBeenCalledWith('3d-airmanship');
  });
});
