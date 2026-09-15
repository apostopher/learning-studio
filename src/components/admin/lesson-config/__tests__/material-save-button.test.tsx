// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lessonMaterialFormId } from '../material-form-id';
import { MaterialSaveButton } from '../material-save-button';

describe('MaterialSaveButton', () => {
  /**
   * The button lives in the modal's sidebar, outside the form it saves. The
   * `form` attribute is the whole mechanism — the mutant is a bare submit
   * button that submits nothing, which renders identically.
   */
  it('submits the material form it names, from outside it', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <>
        <form id={lessonMaterialFormId(10)} onSubmit={onSubmit}>
          <input name="text" />
        </form>
        <MaterialSaveButton
          formId={lessonMaterialFormId(10)}
          isSaving={false}
        />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Save material' });
    expect(button.getAttribute('form')).toBe('lesson-material-form-10');
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('is disabled and says so while saving', () => {
    render(<MaterialSaveButton formId="f" isSaving />);
    const button = screen.getByRole('button', {
      name: 'Saving material…',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
