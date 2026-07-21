// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
});
