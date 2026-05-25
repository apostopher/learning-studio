import { describe, expect, it } from "vitest";
import {
  AIEvaluationResultSchema,
  AIFreeTextEvalOutputSchema,
  AITestFreeTextQuestionSchema,
  AITestGenerationOutputSchema,
  AITestMCQQuestionSchema,
  AITestQuestionSchema,
  EvaluatorOutputSchema,
} from "../schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validMCQQuestion = {
  id: "q1",
  type: "mcq" as const,
  question: "What is the **angle of attack**?",
  options: [
    { id: "a", value: "Option A" },
    { id: "b", value: "Option B" },
    { id: "c", value: "Option C" },
    { id: "d", value: "Option D" },
  ],
  correctOptionId: "a",
  keyPointIndex: 0,
};

const validFreeTextQuestion = {
  id: "q2",
  type: "free-text" as const,
  question: "Explain the concept of **lift** in your own words.",
  expectedAnswer:
    "Lift is the aerodynamic force perpendicular to the direction of flight.",
  keyPointIndex: 1,
};

// ---------------------------------------------------------------------------
// AITestMCQQuestionSchema
// ---------------------------------------------------------------------------

describe("AITestMCQQuestionSchema", () => {
  it("accepts a valid MCQ question with exactly 4 options", () => {
    const result = AITestMCQQuestionSchema.safeParse(validMCQQuestion);
    expect(result.success).toBe(true);
  });

  it("rejects a question with fewer than 4 options", () => {
    const data = {
      ...validMCQQuestion,
      options: [
        { id: "a", value: "Option A" },
        { id: "b", value: "Option B" },
        { id: "c", value: "Option C" },
      ],
    };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects a question with more than 4 options", () => {
    const data = {
      ...validMCQQuestion,
      options: [
        { id: "a", value: "Option A" },
        { id: "b", value: "Option B" },
        { id: "c", value: "Option C" },
        { id: "d", value: "Option D" },
        { id: "e", value: "Option E" },
      ],
    };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects a negative keyPointIndex", () => {
    const data = { ...validMCQQuestion, keyPointIndex: -1 };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects when type is not 'mcq'", () => {
    const data = { ...validMCQQuestion, type: "free-text" };
    const result = AITestMCQQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestFreeTextQuestionSchema
// ---------------------------------------------------------------------------

describe("AITestFreeTextQuestionSchema", () => {
  it("accepts a valid free-text question", () => {
    const result =
      AITestFreeTextQuestionSchema.safeParse(validFreeTextQuestion);
    expect(result.success).toBe(true);
  });

  it("rejects when type is not 'free-text'", () => {
    const data = { ...validFreeTextQuestion, type: "mcq" };
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects a negative keyPointIndex", () => {
    const data = { ...validFreeTextQuestion, keyPointIndex: -1 };
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects when expectedAnswer is missing", () => {
    const { expectedAnswer: _omitted, ...data } = validFreeTextQuestion;
    const result = AITestFreeTextQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestQuestionSchema (discriminated union)
// ---------------------------------------------------------------------------

describe("AITestQuestionSchema (discriminated union)", () => {
  it("correctly parses an MCQ question", () => {
    const result = AITestQuestionSchema.safeParse(validMCQQuestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("mcq");
    }
  });

  it("correctly parses a free-text question", () => {
    const result = AITestQuestionSchema.safeParse(validFreeTextQuestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("free-text");
    }
  });

  it("rejects an unknown type", () => {
    const data = { ...validMCQQuestion, type: "essay" };
    const result = AITestQuestionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AITestGenerationOutputSchema
// ---------------------------------------------------------------------------

describe("AITestGenerationOutputSchema", () => {
  it("accepts an array of mixed question types", () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [validMCQQuestion, validFreeTextQuestion],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty questions array", () => {
    const result = AITestGenerationOutputSchema.safeParse({ questions: [] });
    expect(result.success).toBe(true);
  });

  it("rejects when questions is missing", () => {
    const result = AITestGenerationOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects when a question in the array is invalid", () => {
    const result = AITestGenerationOutputSchema.safeParse({
      questions: [{ ...validMCQQuestion, options: [] }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EvaluatorOutputSchema
// ---------------------------------------------------------------------------

describe("EvaluatorOutputSchema", () => {
  it("accepts a valid evaluator output with pass results", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [
        { questionId: "q1", pass: true, reason: "Clear and unambiguous." },
        { questionId: "q2", pass: true, reason: "Good open-ended question." },
      ],
      allPassed: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts results with some failures", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [
        { questionId: "q1", pass: false, reason: "Question is ambiguous." },
      ],
      allPassed: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty results array", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [],
      allPassed: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when allPassed is missing", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [{ questionId: "q1", pass: true, reason: "Good." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects when a result is missing the reason field", () => {
    const result = EvaluatorOutputSchema.safeParse({
      results: [{ questionId: "q1", pass: true }],
      allPassed: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AIEvaluationResultSchema
// ---------------------------------------------------------------------------

describe("AIEvaluationResultSchema", () => {
  it("accepts a valid MCQ evaluation result", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "mcq",
      score: 100,
      userAnswer: "a",
      explanation: "Correct answer selected.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid free-text evaluation result", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q2",
      type: "free-text",
      score: 75,
      userAnswer: "Lift is an aerodynamic force.",
      explanation: "Partially correct, missing detail on perpendicular force.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score greater than 100", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "mcq",
      score: 101,
      userAnswer: "a",
      explanation: "Over the limit.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative score", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "mcq",
      score: -1,
      userAnswer: "a",
      explanation: "Negative score.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown type value", () => {
    const result = AIEvaluationResultSchema.safeParse({
      questionId: "q1",
      type: "essay",
      score: 50,
      userAnswer: "Some answer.",
      explanation: "Unknown type.",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AIFreeTextEvalOutputSchema
// ---------------------------------------------------------------------------

describe("AIFreeTextEvalOutputSchema", () => {
  it("accepts a valid free-text eval output", () => {
    const result = AIFreeTextEvalOutputSchema.safeParse({
      score: 85,
      explanation: "The answer covers the main concept but lacks detail.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boundary scores of 0 and 100", () => {
    expect(
      AIFreeTextEvalOutputSchema.safeParse({
        score: 0,
        explanation: "Completely incorrect.",
      }).success,
    ).toBe(true);

    expect(
      AIFreeTextEvalOutputSchema.safeParse({
        score: 100,
        explanation: "Perfect answer.",
      }).success,
    ).toBe(true);
  });

  it("rejects a score above 100", () => {
    const result = AIFreeTextEvalOutputSchema.safeParse({
      score: 101,
      explanation: "Over the limit.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a score below 0", () => {
    const result = AIFreeTextEvalOutputSchema.safeParse({
      score: -5,
      explanation: "Below zero.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when explanation is missing", () => {
    const result = AIFreeTextEvalOutputSchema.safeParse({ score: 50 });
    expect(result.success).toBe(false);
  });
});
