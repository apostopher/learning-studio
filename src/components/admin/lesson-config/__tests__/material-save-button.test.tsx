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

  /**
   * Dirty is a cue the admin acts on — "you have edits, press me" — so it
   * must reach them by more than colour (WCAG 1.4.1): the accessible name
   * says so, and the accent class is what carries the colour.
   */
  it('turns accent and says it has unsaved changes when the form is dirty', () => {
    render(<MaterialSaveButton formId="f" isSaving={false} isDirty />);
    const button = screen.getByRole('button', {
      name: 'Save material — unsaved changes',
    });
    expect(button.className).toContain('bg-accent-9');
    expect(button.className).not.toContain('bg-apple-9');
  });

  it('stays the plain primary when the form is clean', () => {
    render(<MaterialSaveButton formId="f" isSaving={false} isDirty={false} />);
    const button = screen.getByRole('button', { name: 'Save material' });
    expect(button.className).toContain('bg-apple-9');
    expect(button.className).not.toContain('bg-accent-9');
  });

  it('reads as saving, not dirty, once the save is in flight', () => {
    render(<MaterialSaveButton formId="f" isSaving isDirty />);
    expect(
      screen.getByRole('button', { name: 'Saving material…' }),
    ).toBeTruthy();
  });
});
