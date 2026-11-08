import { describe, expect, it } from 'vitest';
import type { CourseLessonQuizQuestion } from '#/types';
import {
  buildQuizAnswers,
  newQuizSeed,
  partitionQuiz,
  type QuizProgress,
  quizForAttempt,
  quizGradeLabel,
  quizOptionState,
  restoreQuizProgress,
  revealAnnouncement,
  scoreQuizAnswers,
  shuffleQuiz,
} from '../lesson-quiz';

const question = (
  overrides: Partial<CourseLessonQuizQuestion> = {},
): CourseLessonQuizQuestion => ({
  id: 'q1',
  question: '<p>What is V1?</p>',
  options: [
    { id: 'a', value: '<p>Decision speed</p>' },
    { id: 'b', value: '<p>Rotation speed</p>' },
  ],
  correctOptionId: 'a',
  ...overrides,
});

describe('partitionQuiz', () => {
  it('keeps a well-formed question', () => {
    const { askable, droppedIds } = partitionQuiz([question()]);
    expect(askable).toHaveLength(1);
    expect(droppedIds).toEqual([]);
  });

  it('drops a question whose correctOptionId matches no option', () => {
    // The editor defaults correctOptionId to 'a' and never revalidates it when
    // that option is deleted. Asking this marks the student wrong and shows no
    // correct answer.
    const broken = question({
      id: 'q2',
      options: [
        { id: 'b', value: 'x' },
        { id: 'c', value: 'y' },
      ],
      correctOptionId: 'a',
    });
    const { askable, droppedIds } = partitionQuiz([question(), broken]);
    expect(askable.map((q) => q.id)).toEqual(['q1']);
    expect(droppedIds).toEqual(['q2']);
  });

  it('drops a question with fewer than two options', () => {
    const thin = question({ id: 'q2', options: [{ id: 'a', value: 'x' }] });
    expect(partitionQuiz([thin]).droppedIds).toEqual(['q2']);
  });

  it('drops duplicate option ids', () => {
    const dupe = question({
      id: 'q2',
      options: [
        { id: 'a', value: 'x' },
        { id: 'a', value: 'y' },
      ],
    });
    expect(partitionQuiz([dupe]).droppedIds).toEqual(['q2']);
  });

  it('keeps the first of two questions sharing an id', () => {
    const first = question({ question: '<p>first</p>' });
    const second = question({ question: '<p>second</p>' });
    const { askable, droppedIds } = partitionQuiz([first, second]);
    expect(askable).toHaveLength(1);
    expect(askable[0].question).toBe('<p>first</p>');
    expect(droppedIds).toEqual(['q1']);
  });

  it('treats a null quiz as empty rather than throwing', () => {
    expect(partitionQuiz(null)).toEqual({ askable: [], droppedIds: [] });
  });
});

describe('restoreQuizProgress', () => {
  const quiz = [
    question({ id: 'q1' }),
    question({ id: 'q2' }),
    question({ id: 'q3' }),
  ];

  it('restores a cursor sitting on the next unanswered question', () => {
    const stored: QuizProgress = {
      index: 1,
      answers: { q1: 'a' },
      revealedQuestionId: null,
    };
    expect(restoreQuizProgress(stored, quiz)).toBe(stored);
  });

  it('restores a held wrong answer', () => {
    const stored: QuizProgress = {
      index: 0,
      answers: { q1: 'b' },
      revealedQuestionId: 'q1',
    };
    expect(restoreQuizProgress(stored, quiz)).toBe(stored);
  });

  it('discards progress whose answered question no longer exists', () => {
    // Admin deleted q1 between sessions; the stored answer now refers to
    // whatever question happens to sit at that position.
    const stored: QuizProgress = {
      index: 1,
      answers: { deleted: 'a' },
      revealedQuestionId: null,
    };
    expect(restoreQuizProgress(stored, quiz)).toBeNull();
  });

  it('discards progress whose chosen option was deleted', () => {
    const stored: QuizProgress = {
      index: 1,
      answers: { q1: 'z' },
      revealedQuestionId: null,
    };
    expect(restoreQuizProgress(stored, quiz)).toBeNull();
  });

  it('discards an index past the end of a shortened quiz', () => {
    const stored: QuizProgress = {
      index: 3,
      answers: { q1: 'a', q2: 'a', q3: 'a' },
      revealedQuestionId: null,
    };
    expect(restoreQuizProgress(stored, quiz.slice(0, 2))).toBeNull();
  });

  it('discards answers that skip a question', () => {
    const stored: QuizProgress = {
      index: 2,
      answers: { q1: 'a', q3: 'a' },
      revealedQuestionId: null,
    };
    expect(restoreQuizProgress(stored, quiz)).toBeNull();
  });

  it('discards a reveal pointing at a question that is not the last answered', () => {
    const stored: QuizProgress = {
      index: 1,
      answers: { q1: 'a', q2: 'a' },
      revealedQuestionId: 'q1',
    };
    expect(restoreQuizProgress(stored, quiz)).toBeNull();
  });

  it('discards nothing stored', () => {
    expect(restoreQuizProgress(null, quiz)).toBeNull();
  });
});

describe('buildQuizAnswers', () => {
  it('snapshots each question alongside the chosen option', () => {
    const quiz = [question({ id: 'q1' }), question({ id: 'q2' })];
    const answers = buildQuizAnswers(quiz, { q1: 'b', q2: 'a' });

    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({
      id: 'q1',
      question: '<p>What is V1?</p>',
      correctOptionId: 'a',
      userOptionId: 'b',
    });
    // The options are snapshotted too — that is what makes a later review
    // survive an admin rewording them.
    expect(answers[0].options).toEqual(quiz[0].options);
  });

  it('leaves userOptionId undefined for an unanswered question', () => {
    const answers = buildQuizAnswers([question()], {});
    expect(answers[0].userOptionId).toBeUndefined();
  });
});

describe('scoreQuizAnswers', () => {
  it('counts only answers matching the snapshotted correct option', () => {
    const quiz = [
      question({ id: 'q1' }),
      question({ id: 'q2' }),
      question({ id: 'q3' }),
    ];
    const score = scoreQuizAnswers(
      buildQuizAnswers(quiz, { q1: 'a', q2: 'b', q3: 'a' }),
    );
    expect(score).toEqual({ correct: 2, total: 3 });
  });

  it('scores the denominator over asked questions only', () => {
    // A quiz of three where one was dropped as unaskable is out of two.
    const { askable } = partitionQuiz([
      question({ id: 'q1' }),
      question({ id: 'q2', options: [{ id: 'a', value: 'x' }] }),
      question({ id: 'q3' }),
    ]);
    const score = scoreQuizAnswers(
      buildQuizAnswers(askable, { q1: 'a', q3: 'b' }),
    );
    expect(score).toEqual({ correct: 1, total: 2 });
  });
});

describe('quizGradeLabel', () => {
  it.each([
    [{ correct: 3, total: 3 }, 'Perfect score!'],
    [{ correct: 7, total: 10 }, 'Great job!'],
    [{ correct: 6, total: 10 }, 'Keep practicing!'],
    [{ correct: 0, total: 0 }, 'No questions'],
  ])('%o reads as %s', (score, label) => {
    expect(quizGradeLabel(score)).toBe(label);
  });
});

describe('quizOptionState', () => {
  const base = { correctOptionId: 'a', chosenOptionId: 'b', showAnswer: true };

  it('is idle for every option before the reveal', () => {
    expect(quizOptionState({ ...base, optionId: 'a', revealed: false })).toBe(
      'idle',
    );
  });

  it('marks the correct option, the wrong pick, and dims the rest', () => {
    expect(quizOptionState({ ...base, optionId: 'a', revealed: true })).toBe(
      'correct',
    );
    expect(quizOptionState({ ...base, optionId: 'b', revealed: true })).toBe(
      'wrong',
    );
    expect(quizOptionState({ ...base, optionId: 'c', revealed: true })).toBe(
      'dimmed',
    );
  });

  it('still marks the correct option when the student picked it', () => {
    expect(
      quizOptionState({
        correctOptionId: 'a',
        chosenOptionId: 'a',
        optionId: 'a',
        revealed: true,
        showAnswer: true,
      }),
    ).toBe('correct');
  });

  it('without the answer, a wrong pick marks only the pick — the correct option is not given away', () => {
    const hidden = { ...base, revealed: true, showAnswer: false };
    expect(quizOptionState({ ...hidden, optionId: 'a' })).toBe('dimmed');
    expect(quizOptionState({ ...hidden, optionId: 'b' })).toBe('wrong');
    expect(quizOptionState({ ...hidden, optionId: 'c' })).toBe('dimmed');
  });

  it('without the answer, a right pick is still confirmed', () => {
    expect(
      quizOptionState({
        correctOptionId: 'a',
        chosenOptionId: 'a',
        optionId: 'a',
        revealed: true,
        showAnswer: false,
      }),
    ).toBe('correct');
  });
});

describe('revealAnnouncement', () => {
  it('announces a correct answer', () => {
    expect(revealAnnouncement(question(), 'a')).toBe('Correct.');
  });

  it('says only "Incorrect." when wrong — never reads the correct option aloud', () => {
    expect(revealAnnouncement(question(), 'b')).toBe('Incorrect.');
  });
});

describe('shuffleQuiz', () => {
  // Five questions of four options: 120 × 24⁵ arrangements, so two different
  // seeds landing on the same one is vanishingly unlikely.
  const quiz: CourseLessonQuizQuestion[] = ['q1', 'q2', 'q3', 'q4', 'q5'].map(
    (id) =>
      question({
        id,
        question: `<p>${id}?</p>`,
        options: ['a', 'b', 'c', 'd'].map((o) => ({
          id: o,
          value: `<p>${id}${o}</p>`,
        })),
        correctOptionId: 'c',
      }),
  );
  const order = (q: CourseLessonQuizQuestion[]) =>
    q.map((x) => `${x.id}:${x.options.map((o) => o.id).join('')}`).join(' ');

  it('is the same order for the same seed, so a reload mid-attempt keeps it', () => {
    expect(order(shuffleQuiz(quiz, 42))).toBe(order(shuffleQuiz(quiz, 42)));
  });

  it('reorders questions AND options between seeds', () => {
    const seen = new Set(
      [1, 2, 3, 4, 5].map((seed) => order(shuffleQuiz(quiz, seed))),
    );
    expect(seen.size).toBe(5);
    const firstQuestions = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => shuffleQuiz(quiz, seed)[0]?.id),
    );
    expect(firstQuestions.size).toBeGreaterThan(1);
    const q1Options = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        shuffleQuiz(quiz, seed)
          .find((q) => q.id === 'q1')
          ?.options.map((o) => o.id)
          .join(''),
      ),
    );
    expect(q1Options.size).toBeGreaterThan(1);
  });

  it('only reorders: every question, option and correct answer survives intact', () => {
    const shuffled = shuffleQuiz(quiz, 7);
    expect([...shuffled].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      quiz.map((q) => ({
        ...q,
        options: expect.arrayContaining(q.options),
      })),
    );
    for (const q of shuffled) {
      expect(q.options).toHaveLength(4);
      expect(q.correctOptionId).toBe('c');
    }
  });

  it('does not mutate the authored quiz', () => {
    const before = order(quiz);
    shuffleQuiz(quiz, 3);
    expect(order(quiz)).toBe(before);
  });
});

describe('quizForAttempt', () => {
  const quiz = ['q1', 'q2', 'q3'].map((id) => question({ id }));

  it("shows the attempt's own shuffle", () => {
    const progress: QuizProgress = {
      index: 0,
      answers: {},
      revealedQuestionId: null,
      seed: 9,
    };
    expect(quizForAttempt(quiz, progress)).toEqual(shuffleQuiz(quiz, 9));
  });

  it('keeps authored order for progress saved before shuffling existed', () => {
    // A pilot mid-attempt across the deploy must not have their answered
    // prefix scrambled out from under them (restoreQuizProgress would
    // discard it).
    const legacy = { index: 1, answers: { q1: 'a' }, revealedQuestionId: null };
    expect(quizForAttempt(quiz, legacy)).toBe(quiz);
    expect(quizForAttempt(quiz, { ...legacy, seed: null })).toBe(quiz);
  });
});

describe('newQuizSeed', () => {
  it('is a fresh unsigned 32-bit integer each time', () => {
    const seeds = Array.from({ length: 20 }, newQuizSeed);
    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
    expect(new Set(seeds).size).toBeGreaterThan(15);
  });
});
