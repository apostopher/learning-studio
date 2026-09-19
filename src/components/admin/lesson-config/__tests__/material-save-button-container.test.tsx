// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { lessonMaterialDirtyAtomFamily } from '#/atoms/admin';

const m = vi.hoisted(() => ({ button: vi.fn() }));

// The button is the consumer under test: `isDirty` only matters if it
// arrives HERE. Reading the atom back in the test would pass with the prop
// unwired.
vi.mock('../material-save-button', () => ({
  MaterialSaveButton: (props: Record<string, unknown>) => {
    m.button(props);
    return null;
  },
}));

import { MaterialSaveButtonContainer } from '../material-save-button-container';

const renderFor = (lessonId: number, store: ReturnType<typeof createStore>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <MaterialSaveButtonContainer lessonId={lessonId} />
      </Provider>
    </QueryClientProvider>,
  );

describe('MaterialSaveButtonContainer', () => {
  it("hands the button its lesson's dirty flag", () => {
    const store = createStore();
    store.set(lessonMaterialDirtyAtomFamily(10), true);
    renderFor(10, store);
    expect(m.button).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDirty: true }),
    );
  });

  it("is not dirty because ANOTHER lesson's form is", () => {
    const store = createStore();
    store.set(lessonMaterialDirtyAtomFamily(11), true);
    renderFor(10, store);
    expect(m.button).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDirty: false }),
    );
  });
});
