// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  selectLessonScoreRow: vi.fn(),
  selectCoursePassMark: vi.fn(),
  getLatestLessonQuizAnswers: vi.fn(),
}));

vi.mock('#/db/lesson-score-facts', () => ({
  selectLessonScoreRow: m.selectLessonScoreRow,
  selectCoursePassMark: m.selectCoursePassMark,
}));
vi.mock('#/db/lesson-quiz', () => ({
  getLatestLessonQuizAnswers: m.getLatestLessonQuizAnswers,
}));

import {
  debriefJudge,
  getCoursePassMark,
  getScoreFacts,
  setScore,
} from '../lesson-score.server';

const lessonRow = (over: Record<string, unknown> = {}) => ({
  videoProvider: 'mux',
  videoRef: 'abc',
  needsVideoWatch: true,
  hasQuiz: true,
  watchedHits: 18,
  ...over,
});
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

beforeEach(() => {
  vi.clearAllMocks();
  m.selectLessonScoreRow.mockResolvedValue(lessonRow());
  m.getLatestLessonQuizAnswers.mockResolvedValue(null);
});

describe('getScoreFacts', () => {
  const facts = () => getScoreFacts('u1', 'l1', 41);

  it('reads the lesson row for this pilot and lesson', async () => {
    await facts();
    expect(m.selectLessonScoreRow).toHaveBeenCalledWith('u1', 41);
  });

  it('video is the share of watched milestones hit (18 of 18 = 1, 9 of 18 = 0.5)', async () => {
    expect((await facts()).video).toBe(1);
    m.selectLessonScoreRow.mockResolvedValue(lessonRow({ watchedHits: 9 }));
    expect((await facts()).video).toBe(0.5);
  });

  it('video is null when the lesson does not ask for a watch', async () => {
    m.selectLessonScoreRow.mockResolvedValue(
      lessonRow({ needsVideoWatch: false }),
    );
    expect((await facts()).video).toBeNull();
  });

  it.each([
    ['no provider', { videoProvider: null }],
    ['no ref', { videoRef: null }],
  ])('video is null when the lesson has no video (%s)', async (_w, over) => {
    m.selectLessonScoreRow.mockResolvedValue(lessonRow(over));
    expect((await facts()).video).toBeNull();
  });

  it('quiz is the latest attempt’s share of correct answers (2 of 3)', async () => {
    m.getLatestLessonQuizAnswers.mockResolvedValue({
      answers: [answer('1', true), answer('2', false), answer('3', true)],
    });
    expect((await facts()).quiz).toBeCloseTo(2 / 3);
    expect(m.getLatestLessonQuizAnswers).toHaveBeenCalledWith('u1', 'l1');
  });

  it('quiz is 0 when the lesson has a quiz and none was taken', async () => {
    expect((await facts()).quiz).toBe(0);
  });

  it('quiz is null when the lesson has no authored quiz, without reading attempts', async () => {
    m.selectLessonScoreRow.mockResolvedValue(lessonRow({ hasQuiz: false }));
    expect((await facts()).quiz).toBeNull();
    expect(m.getLatestLessonQuizAnswers).not.toHaveBeenCalled();
  });

  it('no lesson row: neither part', async () => {
    m.selectLessonScoreRow.mockResolvedValue(null);
    expect(await facts()).toEqual({ video: null, quiz: null });
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

describe('debriefJudge / setScore', () => {
  const full = { video: 1, quiz: 1 };

  it('with video and quiz full and a pass mark of 85, a set passes at 40', () => {
    const judge = debriefJudge(full, 85);
    expect(judge(40)).toBe(true);
    expect(judge(39)).toBe(false);
  });

  it('setScore is the lesson total with the average as the debrief part', () => {
    const s = setScore(full, 85, 50);
    expect(s.total).toBeCloseTo(87.5);
    expect(s.passed).toBe(true);
    expect(s.parts.map((p) => p.part)).toEqual(['video', 'quiz', 'debrief']);
  });

  it('a quiz not taken costs its share: 60 on the debrief totals 65, not passed', () => {
    const s = setScore({ video: 1, quiz: 0 }, 85, 60);
    expect(s.total).toBeCloseTo(65);
    expect(s.passed).toBe(false);
    expect(debriefJudge({ video: 1, quiz: 0 }, 85)(60)).toBe(false);
  });

  it('with no video and no quiz the debrief is the whole score', () => {
    expect(setScore({ video: null, quiz: null }, 75, 74).passed).toBe(false);
    expect(setScore({ video: null, quiz: null }, 75, 75).passed).toBe(true);
  });
});
