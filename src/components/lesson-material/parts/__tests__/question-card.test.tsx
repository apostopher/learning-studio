// @vitest-environment jsdom
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';
import { freeTextAnswerAtom, QuestionCard } from '../question-card';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const question = { id: 'q2', question: 'Why does it matter?' };
const NOTE =
  'Debriefs are answered in your own words — copy and paste are turned off.';

function setup(
  props: Partial<Parameters<typeof QuestionCard>[0]> = {},
  initial = '',
) {
  const store = createStore();
  store.set(freeTextAnswerAtom, initial);
  const handlers = {
    onSubmit: vi.fn(),
    onBlockedPaste: vi.fn(),
    onAnswerEvent: vi.fn(),
  };
  const wrap = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  render(
    <QuestionCard
      question={question}
      index={0}
      total={2}
      idBase=":q:"
      isEvaluating={false}
      readOnly={false}
      pasteBlockedNote={false}
      clipboardAllowed={false}
      {...handlers}
      {...props}
    />,
    { wrapper: wrap },
  );
  return {
    store,
    ...handlers,
    box: screen.getByRole('textbox') as HTMLTextAreaElement,
  };
}

describe('QuestionCard typed answers only', () => {
  it.each([
    'paste',
    'drop',
    'copy',
    'cut',
  ] as const)('%s is prevented and reported once; the value is unchanged', (kind) => {
    const { box, onBlockedPaste } = setup({}, 'typed');
    const event = createEvent[kind](box);
    act(() => {
      box.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onBlockedPaste).toHaveBeenCalledTimes(1);
    expect(box.value).toBe('typed');
  });

  // A learner pasted a debrief question into Viper for the answer.
  it.each([
    'copy',
    'cut',
    'dragStart',
  ] as const)('the question text refuses %s for a learner, and says why', (kind) => {
    const { onBlockedPaste } = setup();
    const el = screen.getByText(question.question);
    const event = createEvent[kind](el);
    act(() => {
      el.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onBlockedPaste).toHaveBeenCalledTimes(1);
  });

  it('the question text cannot be selected or touch-handled by a learner', () => {
    setup();
    const classes = screen.getByText(question.question).className.split(' ');
    expect(classes).toContain('select-none');
    expect(classes).toContain('touch-none');
  });
});

describe('QuestionCard for an admin or the course author', () => {
  it.each([
    'copy',
    'cut',
    'dragStart',
  ] as const)('the question text allows %s', (kind) => {
    const { onBlockedPaste } = setup({ clipboardAllowed: true });
    const el = screen.getByText(question.question);
    expect(el.className).not.toContain('select-none');
    expect(el.className).not.toContain('touch-none');
    const event = createEvent[kind](el);
    act(() => {
      el.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(onBlockedPaste).not.toHaveBeenCalled();
  });

  it.each([
    'paste',
    'drop',
    'copy',
    'cut',
  ] as const)('the answer box allows %s', (kind) => {
    const { box, onBlockedPaste } = setup({ clipboardAllowed: true });
    const event = createEvent[kind](box);
    act(() => {
      box.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(onBlockedPaste).not.toHaveBeenCalled();
  });
});

describe('QuestionCard notes', () => {
  it('shows the note live and wires it into aria-describedby', () => {
    const { box } = setup({ pasteBlockedNote: true });
    const note = screen.getByText(NOTE);
    expect(note.getAttribute('aria-live')).toBe('polite');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(
      note.getAttribute('id'),
    );
  });

  it('keeps the live region mounted, empty, before any paste, and out of describedby', () => {
    const { box } = setup({ pasteBlockedNote: false });
    expect(screen.queryByText(NOTE)).toBeNull();
    const region = document.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toBe('');
    expect(box.getAttribute('aria-describedby') ?? '').not.toContain(
      region?.getAttribute('id') ?? 'none',
    );
  });

  it('keeps the read-only reason in describedby next to the note', () => {
    const { box } = setup({ readOnly: true, pasteBlockedNote: true });
    const ids = box.getAttribute('aria-describedby')?.split(' ');
    expect(ids).toContain(
      screen.getByText(READ_ONLY_CONTROL_REASON).getAttribute('id'),
    );
    expect(ids).toContain(screen.getByText(NOTE).getAttribute('id'));
  });

  it('reports keydown and input (with how much was removed) to onAnswerEvent', () => {
    const { box, onAnswerEvent, store } = setup({}, 'hello');
    fireEvent.keyDown(box, { key: 'Backspace' });
    expect(onAnswerEvent.mock.calls[0][0]).toMatchObject({ type: 'keydown' });
    fireEvent.change(box, { target: { value: 'he' } });
    expect(onAnswerEvent.mock.calls[1][0]).toEqual({
      type: 'input',
      deltaRemoved: 3,
      length: 2,
    });
    expect(store.get(freeTextAnswerAtom)).toBe('he');
  });

  it('submits the typed answer', async () => {
    const { onSubmit } = setup({}, 'an answer');
    await userEvent.click(screen.getByRole('button', { name: /Submit/ }));
    expect(onSubmit).toHaveBeenCalledWith('an answer');
  });
});

describe('QuestionCard read-only', () => {
  it('refuses to submit, and says why', async () => {
    const { onSubmit, box } = setup({ readOnly: true }, 'x');
    expect(box.readOnly).toBe(true);
    const submit = screen.getByRole('button', { name: /Submit/ });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.getAttribute('aria-describedby')).toBe(
      screen.getByText(READ_ONLY_CONTROL_REASON).getAttribute('id'),
    );
    await userEvent.click(submit, { pointerEventsCheck: 0 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows no reason when not read-only', () => {
    setup();
    expect(screen.queryByText(READ_ONLY_CONTROL_REASON)).toBeNull();
  });
});

describe('QuestionCard count', () => {
  it('says which question this is, of how many', () => {
    setup({ index: 1, total: 7 });
    expect(screen.getByText('Question 2 of 7')).toBeDefined();
  });
});

describe('QuestionCard answer box name', () => {
  it('the answer box is named by the question it answers (aria-labelledby → the question text)', () => {
    const { box } = setup();
    const labelledBy = box.getAttribute('aria-labelledby');
    expect(labelledBy).toBe(':q:-question');
    expect(document.getElementById(labelledBy as string)?.textContent).toBe(
      question.question,
    );
    expect(screen.getByRole('textbox', { name: question.question })).toBe(box);
  });
});
