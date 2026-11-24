// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  selectCoursePassMark: vi.fn(),
  selectAuthoredQuiz: vi.fn(),
  getLatestLessonQuizAnswers: vi.fn(),
}));

vi.mock('#/db/lesson-score-facts', () => ({
  selectCoursePassMark: m.selectCoursePassMark,
  selectAuthoredQuiz: m.selectAuthoredQuiz,
}));
vi.mock('#/db/lesson-quiz', () => ({
  getLatestLessonQuizAnswers: m.getLatestLessonQuizAnswers,
}));

import { getCoursePassMark, getScoreFacts } from '../lesson-score.server';

const answer = (id: string, correct: boolean) => ({
  id,
  question: `Q${id}`,
  options: [
    { id: 'a', value: 'A' },
    { id: 'b', value: 'B' },
  ],
  correctOptionId: 'a',
  userOptionId: correct ? 'a' : 'b',
});

/** An authored question: option 'a' is right. */
const authored = (id: string) => ({
  id,
  question: `Q${id}`,
  options: [
    { id: 'a', value: 'A' },
    { id: 'b', value: 'B' },
  ],
  correctOptionId: 'a',
});

beforeEach(() => {
  vi.clearAllMocks();
  m.selectAuthoredQuiz.mockResolvedValue([
    authored('1'),
    authored('2'),
    authored('3'),
  ]);
  m.getLatestLessonQuizAnswers.mockResolvedValue(null);
});

describe('getScoreFacts', () => {
  const facts = () => getScoreFacts('u1', 'l1', 7);

  it('quiz is the latest attempt’s count of right answers (2 of 3)', async () => {
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true), answer('2', false), answer('3', true)],
    });
    expect((await facts()).quiz).toEqual({ correct: 2, total: 3 });
    expect(m.getLatestLessonQuizAnswers).toHaveBeenCalledWith('u1', 'l1');
  });

  it('a forged correctOptionId is ignored: answers are graded against the authored quiz', async () => {
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: ['1', '2', '3'].map((id) => ({
        ...answer(id, false),
        // The client claims its own (wrong) pick is the right one.
        correctOptionId: 'b',
      })),
    });
    expect((await facts()).quiz).toEqual({ correct: 0, total: 3 });
    expect(m.selectAuthoredQuiz).toHaveBeenCalledWith('l1', 7);
  });

  it('the denominator is the authored question count: one right answer sent of three authored is 1 of 3', async () => {
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true)],
    });
    expect((await facts()).quiz).toEqual({ correct: 1, total: 3 });
  });

  it('an answer for a question not in the authored quiz counts for nothing', async () => {
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true), answer('x', true), answer('y', true)],
    });
    expect((await facts()).quiz).toEqual({ correct: 1, total: 3 });
  });

  it('grades only the askable questions: one invalid of five, the four asked all right, is 4 of 4', async () => {
    m.selectAuthoredQuiz.mockResolvedValue([
      authored('1'),
      authored('2'),
      // Its correct option is not among its options: never asked.
      { ...authored('bad'), correctOptionId: 'z' },
      authored('3'),
      authored('4'),
    ]);
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: ['1', '2', '3', '4'].map((id) => answer(id, true)),
    });
    expect((await facts()).quiz).toEqual({ correct: 4, total: 4 });
  });

  it('a duplicated question id is graded once', async () => {
    m.selectAuthoredQuiz.mockResolvedValue([
      authored('1'),
      authored('1'),
      authored('2'),
    ]);
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', false), answer('2', true)],
    });
    expect((await facts()).quiz).toEqual({ correct: 1, total: 2 });
  });

  it('no askable questions: quiz is null', async () => {
    m.selectAuthoredQuiz.mockResolvedValue([
      { ...authored('1'), correctOptionId: 'z' },
    ]);
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true)],
    });
    expect((await facts()).quiz).toBeNull();
  });

  it('no authored questions: quiz is null', async () => {
    m.selectAuthoredQuiz.mockResolvedValue(null);
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true)],
    });
    expect((await facts()).quiz).toBeNull();
  });

  it('quiz is 0 right when the lesson has a quiz and none was taken', async () => {
    expect((await facts()).quiz).toEqual({ correct: 0, total: 3 });
  });
});

describe('getCoursePassMark', () => {
  it('reads the course’s pass mark', async () => {
    m.selectCoursePassMark.mockResolvedValue(70);
    expect(await getCoursePassMark(7)).toBe(70);
    expect(m.selectCoursePassMark).toHaveBeenCalledWith(7);
  });

  it('defaults to 85 when there is no course row', async () => {
    m.selectCoursePassMark.mockResolvedValue(null);
    expect(await getCoursePassMark(7)).toBe(85);
  });
});
