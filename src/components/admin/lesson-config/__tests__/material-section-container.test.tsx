// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { lessonMaterialDirtyAtomFamily } from '#/atoms/admin';

/**
 * Under this repo's Vite pipeline, `import 'react'` from a src module is a
 * DIFFERENT instance from the one react-dom (and testing-library) drive, so
 * any src component that calls a React hook directly renders with a null
 * dispatcher ("Cannot read properties of null (reading 'useEffect')") — the
 * constraint documented atop link-popover.tsx. Pointing `react` at the CJS
 * instance Node already loaded for react-dom unifies them for this file, so
 * the container's effect actually runs here.
 */
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const hooks = vi.hoisted(() => ({
  material: vi.fn(),
}));
vi.mock('#/data-hooks/use-lesson-material', () => ({
  useLessonMaterial: hooks.material,
}));
vi.mock('#/data-hooks/use-parse-lesson-material', () => ({
  useParseLessonMaterial: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('#/data-hooks/use-save-lesson-material', () => ({
  useSaveLessonMaterial: () => ({ mutate: vi.fn(), error: null }),
}));
// The upload control owns a file-input ref; the react-compiler + vitest pair
// cannot render that (see component-render-test constraints), and the docx
// path is not under test here.
vi.mock('../material-upload', () => ({
  MaterialUpload: () => <div data-testid="material-upload" />,
}));
// The rich-text editor is tiptap on contenteditable — not something jsdom can
// type into, and not what this file is about. A plain input registered under
// the same name keeps the form's shape.
vi.mock('../rich-text-editor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { MaterialSectionContainer } from '../material-section-container';

const renderFor = (lessonId: number) => {
  const store = createStore();
  const view = render(
    <Provider store={store}>
      <MaterialSectionContainer lesson={{ id: lessonId }} />
    </Provider>,
  );
  return { store, ...view };
};

/**
 * The dirty atom is the seam to the Save button in the sidebar — the only
 * reader. These assert on the store, because a flag the container computes
 * but never publishes would leave that button navy forever.
 */
describe('MaterialSectionContainer dirty flag', () => {
  it('publishes dirty for its lesson once a field is edited', () => {
    hooks.material.mockReturnValue({ data: null, isLoading: false });
    const { store } = renderFor(10);
    const dirty = lessonMaterialDirtyAtomFamily(10);
    expect(store.get(dirty)).toBe(false);

    fireEvent.input(screen.getByLabelText('Job of the day (URL)'), {
      target: { value: 'https://example.com/job' },
    });

    expect(store.get(dirty)).toBe(true);
  });

  it('is clean again when the field is put back as it was', () => {
    hooks.material.mockReturnValue({ data: null, isLoading: false });
    const { store } = renderFor(10);
    const field = screen.getByLabelText('Job of the day (URL)');
    fireEvent.input(field, { target: { value: 'x' } });
    fireEvent.input(field, { target: { value: '' } });
    expect(store.get(lessonMaterialDirtyAtomFamily(10))).toBe(false);
  });

  it('withdraws the flag when the panel unmounts, so a closed modal cannot leave a Save button lit', () => {
    hooks.material.mockReturnValue({ data: null, isLoading: false });
    const { store, unmount } = renderFor(10);
    fireEvent.input(screen.getByLabelText('Job of the day (URL)'), {
      target: { value: 'x' },
    });
    expect(store.get(lessonMaterialDirtyAtomFamily(10))).toBe(true);
    unmount();
    expect(store.get(lessonMaterialDirtyAtomFamily(10))).toBe(false);
  });
});
