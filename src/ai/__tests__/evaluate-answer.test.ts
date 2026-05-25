import { describe, expect, it } from "vitest";
import { evaluateMCQ } from "../evaluate-answer";
import type { AITestMCQQuestion } from "../schemas";

const mcqQuestion: AITestMCQQuestion = {
  id: "q1",
  type: "mcq",
  question: "Which procedure applies when...?",
  options: [
    { id: "q1a", value: "Option A" },
    { id: "q1b", value: "Option B" },
    { id: "q1c", value: "Option C" },
    { id: "q1d", value: "Option D" },
  ],
  correctOptionId: "q1b",
  keyPointIndex: 0,
};

describe("evaluateMCQ", () => {
  it("scores 100 for correct answer and explanation contains correct option value", () => {
    const result = evaluateMCQ(mcqQuestion, "q1b");

    expect(result.score).toBe(100);
    expect(result.explanation).toContain("Option B");
  });

  it("scores 0 for incorrect answer and explanation still contains correct option value", () => {
    const result = evaluateMCQ(mcqQuestion, "q1a");

    expect(result.score).toBe(0);
    expect(result.explanation).toContain("Option B");
  });

  it("returns the question id, type 'mcq', and the userAnswer", () => {
    const userAnswer = "q1c";
    const result = evaluateMCQ(mcqQuestion, userAnswer);

    expect(result.questionId).toBe("q1");
    expect(result.type).toBe("mcq");
    expect(result.userAnswer).toBe(userAnswer);
  });
});
