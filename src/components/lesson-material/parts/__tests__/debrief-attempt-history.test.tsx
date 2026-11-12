// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DebriefAttemptHistory,
  type DebriefAttemptRow,
} from '../debrief-attempt-history';

const attempts: DebriefAttemptRow[] = [
  {
    id: 2,
    when: 'Wed 29 Oct, 9:00 AM',
    score: 100,
    passed: true,
    format: 'chunk',
    questions: [{ id: 'p1', question: 'Passing attempt question' }],
    evaluations: [
      { questionId: 'p1', score: 85, userAnswer: 'My answer', revisitNote: '' },
    ],
  },
  {
    id: 1,
    when: 'Tue 28 Oct, 3:40 PM',
    score: 40,
    passed: false,
    format: 'chunk',
    questions: [{ id: 'f1', question: 'Failed attempt question' }],
    evaluations: [
      {
        questionId: 'f1',
        score: 40,
        userAnswer: 'Because it is quicker',
        revisitNote: 'Revisit why the checklist comes first.',
      },
    ],
  },
];

describe('DebriefAttemptHistory', () => {
  it('lists every attempt in the order given, with date, mastery and outcome', () => {
    render(<DebriefAttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Wed 29 Oct, 9:00 AM');
    expect(items[0].textContent).toContain('100%');
    expect(items[0].textContent).toContain('Passed');
    expect(items[1].textContent).toContain('Tue 28 Oct, 3:40 PM');
    expect(items[1].textContent).toContain('40%');
    expect(items[1].textContent).toContain('Not yet passed');
  });

  it('expands a chunk attempt to question, the answer given and its note, with no per-answer number', async () => {
    // Mastery is the only debrief number (R15): no "/100" on chunk answers.
    render(<DebriefAttemptHistory attempts={attempts} />);
    const failed = screen.getAllByRole('listitem')[1];
    await userEvent.click(
      within(failed).getByRole('button', { name: /Tue 28 Oct/ }),
    );
    expect(within(failed).getByText('Failed attempt question')).toBeDefined();
    expect(within(failed).getByText('Because it is quicker')).toBeDefined();
    expect(
      within(failed).getByText('Revisit why the checklist comes first.'),
    ).toBeDefined();
    expect(failed.textContent).not.toContain('/100');
    expect(screen.queryByText('Passing attempt question')).toBeNull();
  });

  it('renders a legacy multiple-choice attempt as question and score only', async () => {
    // Projected for the client, an old MCQ attempt has no options left and
    // its "answer" is an option id: not shown.
    render(
      <DebriefAttemptHistory
        attempts={[
          {
            id: 3,
            when: 'Mon 1 Sep, 8:00 AM',
            score: 80,
            passed: true,
            format: 'legacy',
            questions: [{ id: 'm1', question: 'What is V1?' }],
            evaluations: [{ questionId: 'm1', score: 100, userAnswer: 'b' }],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    await userEvent.click(
      within(item).getByRole('button', { name: /Mon 1 Sep/ }),
    );
    expect(within(item).getByText('What is V1?')).toBeDefined();
    expect(within(item).getByText('100/100')).toBeDefined();
    expect(within(item).queryByText('b')).toBeNull();
  });

  it('offers no retake from history', () => {
    render(<DebriefAttemptHistory attempts={attempts} />);
    expect(screen.queryByRole('button', { name: /Retake/ })).toBeNull();
  });
});
