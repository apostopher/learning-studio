// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AIEvaluationResult, AITestQuestion } from '#/ai/schemas';
import { DebriefAttemptHistory } from '../debrief-attempt-history';

const question = (id: string, text: string): AITestQuestion => ({
  id,
  type: 'free-text',
  question: text,
  expectedAnswer: 'x',
  keyPointIndex: 0,
});
const evaluation = (id: string, score: number): AIEvaluationResult => ({
  questionId: id,
  type: 'free-text',
  score,
  userAnswer: 'my answer',
  explanation: 'because',
});

const attempts = [
  {
    id: 2,
    when: 'Wed 29 Oct, 9:00 AM',
    score: 85,
    passed: true,
    questions: [question('p1', 'Passing attempt question')],
    evaluations: [evaluation('p1', 85)],
  },
  {
    id: 1,
    when: 'Tue 28 Oct, 3:40 PM',
    score: 40,
    passed: false,
    questions: [question('f1', 'Failed attempt question')],
    evaluations: [evaluation('f1', 40)],
  },
];

describe('DebriefAttemptHistory', () => {
  it('lists every attempt in the order given, with date, score and outcome (call 3)', () => {
    render(<DebriefAttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Wed 29 Oct, 9:00 AM');
    expect(items[0].textContent).toContain('85/100');
    expect(items[0].textContent).toContain('Passed');
    expect(items[1].textContent).toContain('Tue 28 Oct, 3:40 PM');
    expect(items[1].textContent).toContain('40/100');
    expect(items[1].textContent).toContain('Below par');
  });

  it("expands an attempt to that attempt's own score report", async () => {
    render(<DebriefAttemptHistory attempts={attempts} />);
    const failed = screen.getAllByRole('listitem')[1];
    await userEvent.click(
      within(failed).getByRole('button', { name: /Tue 28 Oct/ }),
    );
    expect(within(failed).getByText('Failed attempt question')).toBeDefined();
    expect(screen.queryByText('Passing attempt question')).toBeNull();
  });

  it('offers no retake from history', () => {
    render(<DebriefAttemptHistory attempts={attempts} />);
    expect(screen.queryByRole('button', { name: /Retake/ })).toBeNull();
  });

  it("rotates only the chevron of the attempt opened, not every question's inside it", async () => {
    // Tailwind's unnamed `group-data-[open]:` matches ANY open `.group`
    // ancestor, and ScoreReport's question rows are groups too.
    render(<DebriefAttemptHistory attempts={attempts} />);
    const passed = screen.getAllByRole('listitem')[0];
    await userEvent.click(
      within(passed).getByRole('button', { name: /Wed 29 Oct/ }),
    );
    const chevrons = passed.querySelectorAll('svg.lucide-chevron-down');
    expect(chevrons.length).toBe(2);
    expect(chevrons[0].getAttribute('class')).toContain(
      'group-data-[open]/attempt:rotate-180',
    );
    expect(chevrons[1].getAttribute('class')).toContain(
      'group-data-[open]/question:rotate-180',
    );
    for (const chevron of chevrons) {
      expect(chevron.getAttribute('class')).not.toMatch(
        /(^|\s)group-data-\[open\]:/,
      );
    }
  });
});
