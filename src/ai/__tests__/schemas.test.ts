import { describe, expect, it } from 'vitest';
import {
  AIEvaluationResultSchema,
  AIFreeTextEvalOutputSchema,
  AITestFreeTextQuestionSchema,
  AITestGenerationOutputSchema,
  AITestMCQQuestionSchema,
  AITestQuestionSchema,
  EvaluatorOutputSchema,
} from '../schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validMCQQuestion = {
  id: 'q1',
  type: 'mcq' as const,
  question: 'What is the **angle of attack**?',
  options: [
    { id: 'a', value: 'Option A' },
    { id: 'b', value: 'Option B' },
    { id: 'c', value: 'Option C' },
    { id: 'd', value: 'Option D' },
  ],
  correctOptionId: 'a',
  keyPointIndex: 0,
};

const validFreeTextQuestion = {
  id: 'q2',
  type: 'free-text' as const,
  question: 'Explain the concept of **lift** in your own words.',
  expectedAnswer:
    'Lift is the aerodynamic force perpendicular to the direction of flight.',
  chunkIds: ['v2-c3'],
  keyPointIndex: 1,
};

// ---------------------------------------------------------------------------
// AITestMCQQuestionSchema
// ---------------------------------------------------------------------------

describe('AITestMCQQuestionSchema', () => {
  it('accepts a valid MCQ question with exactly 4 options', () => {
    const result = AITestMCQQuestionSchema.safeParse(validMCQQuestion);
    expect(result.success).toBe(true);
  });

  it('rejects a question with fewer than 4 options', () => {
    const data = {
      ...validMCQQuestion,
      options: [
        { id: 'a', value: 'Option A' },
        { id: 'b', value: 'Option B' },
        { id: 'c', value: 'Option C' },
      ],
    };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects a question with more than 4 options', () => {
    const data = {
      ...validMCQQuestion,
      options: [
        { id: 'a', value: 'Option A' },
        { id: 'b', value: 'Option B' },
        { id: 'c', value: 'Option C' },
        { id: 'd', value: 'Option D' },
        { id: 'e', value: 'Option E' },
      ],
    };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects a negative keyPointIndex', () => {
    const data = { ...validMCQQuestion, keyPointIndex: -1 };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects when type is not 'mcq'", () => {
    const data = { ...validMCQQuestion, type: 'free-text' };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestFreeTextQuestionSchema
// ---------------------------------------------------------------------------

describe('AITestFreeTextQuestionSchema', () => {
  it('accepts a valid free-text question', () => {
    const result = AITestFreeTextQuestionSchema.safeParse(
      validFreeTextQuestion,
    );
    expect(result.success).toBe(true);
  });

  it("rejects when type is not 'free-text'", () => {
    const data = { ...validFreeTextQuestion, type: 'mcq' };
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects a negative keyPointIndex', () => {
    const data = { ...validFreeTextQuestion, keyPointIndex: -1 };
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('requires one or two chunk ids', () => {
    for (const chunkIds of [[], ['a', 'b', 'c']]) {
      expect(
        AITestFreeTextQuestionSchema.safeParse({
          ...validFreeTextQuestion,
          chunkIds,
        }).success,
      ).toBe(false);
    }
    expect(
      AITestFreeTextQuestionSchema.safeParse({
        ...validFreeTextQuestion,
        chunkIds: ['v2-c3', 'v2-c4'],
      }).success,
    ).toBe(true);
  });

  it('parses without keyPointIndex — it is legacy', () => {
    const { keyPointIndex: _omitted, ...data } = validFreeTextQuestion;
    expect(AITestFreeTextQuestionSchema.safeParse(data).success).toBe(true);
  });

  it('rejects when expectedAnswer is missing', () => {
    const { expectedAnswer: _omitted, ...data } = validFreeTextQuestion;
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestQuestionSchema (discriminated union)
// ---------------------------------------------------------------------------

describe('AITestQuestionSchema (discriminated union)', () => {
  it('correctly parses an MCQ question', () => {
    const result = AITestQuestionSchema.safeParse(validMCQQuestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('mcq');
    }
  });

  it('correctly parses a free-text question', () => {
    const result = AITestQuestionSchema.safeParse(validFreeTextQuestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('free-text');
    }
  });

  it('rejects an unknown type', () => {
    const data = { ...validMCQQuestion, type: 'essay' };
    const result = AITestQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestGenerationOutputSchema
// ---------------------------------------------------------------------------

describe('AITestGenerationOutputSchema', () => {
  it('accepts written questions', () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [validFreeTextQuestion, validFreeTextQuestion],
    });
    expect(result.success).toBe(true);
  });

  it('rejects multiple choice — debriefs ask written questions only', () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [validMCQQuestion, validFreeTextQuestion],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty questions array', () => {
    const result = AITestGenerationOutputSchema.safeParse({ questions: [] });
    expect(result.success).toBe(true);
  });

  it('rejects when questions is missing', () => {
    const result = AITestGenerationOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects when a question in the array is invalid', () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [{ ...validMCQQuestion, options: [] }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EvaluatorOutputSchema
// ---------------------------------------------------------------------------

describe('EvaluatorOutputSchema', () => {
  it('accepts a valid evaluator output with pass results', () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [
        { questionId: 'q1', pass: true, reason: 'Clear and unambiguous.' },
        { questionId: 'q2', pass: true, reason: 'Good open-ended question.' },
      ],
      allPassed: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts results with some failures', () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [
        { questionId: 'q1', pass: false, reason: 'Question is ambiguous.' },
      ],
      allPassed: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty results array', () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [],
      allPassed: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when allPassed is missing', () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [{ questionId: 'q1', pass: true, reason: 'Good.' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects when a result is missing the reason field', () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [{ questionId: 'q1', pass: true }],
      allPassed: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AIEvaluationResultSchema
// ---------------------------------------------------------------------------

describe('AIEvaluationResultSchema', () => {
  it('accepts a valid MCQ evaluation result', () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: 'q1',
      type: 'mcq',
      score: 100,
      userAnswer: 'a',
      explanation: 'Correct answer selected.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid free-text evaluation result', () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: 'q2',
      type: 'free-text',
      score: 75,
      userAnswer: 'Lift is an aerodynamic force.',
      explanation: 'Partially correct, missing detail on perpendicular force.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a score greater than 100', () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: 'q1',
      type: 'mcq',
      score: 101,
      userAnswer: 'a',
      explanation: 'Over the limit.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative score', () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: 'q1',
      type: 'mcq',
      score: -1,
      userAnswer: 'a',
      explanation: 'Negative score.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown type value', () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: 'q1',
      type: 'essay',
      score: 50,
      userAnswer: 'Some answer.',
      explanation: 'Unknown type.',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AIFreeTextEvalOutputSchema
// ---------------------------------------------------------------------------

describe('AIFreeTextEvalOutputSchema', () => {
  const valid = {
    chunkJudgements: [
      { chunkId: 'v2-c1', conveyed: 'fully', note: 'Said 7600.' },
      { chunkId: 'v2-c2', conveyed: 'partly', note: 'Vague on route.' },
    ],
    incorrectClaims: [],
    revisitNote: 'You named the code but not the route.',
  };

  it('accepts per-chunk judgements', () => {
    expect(AIFreeTextEvalOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a judgement other than fully / partly / not', () => {
    expect(
      AIFreeTextEvalOutputSchema.safeParse({
        ...valid,
        chunkJudgements: [{ chunkId: 'a', conveyed: 'mostly', note: '' }],
      }).success,
    ).toBe(false);
  });

  it('requires at least one chunk judgement', () => {
    expect(
      AIFreeTextEvalOutputSchema.safeParse({ ...valid, chunkJudgements: [] })
        .success,
    ).toBe(false);
  });

  it('rejects when revisitNote is missing', () => {
    const { revisitNote: _, ...rest } = valid;
    expect(AIFreeTextEvalOutputSchema.safeParse(rest).success).toBe(false);
  });
});

describe('AIEvaluationResultSchema chunk fields', () => {
  it('accepts chunkScores and revisitNote, and still parses legacy rows', () => {
    const base = {
      questionId: 'q1',
      type: 'free-text' as const,
      score: 50,
      userAnswer: 'a',
      explanation: '',
    };
    expect(
      AIEvaluationResultSchema.safeParse({
        ...base,
        chunkScores: { 'v2-c1': 75 },
        revisitNote: 'x',
      }).success,
    ).toBe(true);
    expect(
      AIEvaluationResultSchema.safeParse({
        ...base,
        essentialIdeas: [{ idea: 'x', conveyed: 'fully' }],
      }).success,
    ).toBe(true);
  });
});
