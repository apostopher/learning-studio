import { describe, expect, it } from "vitest";
import {
  completionTimestamp,
  resolveDoneAt,
  videoWatchedAt,
} from "./backfill-lesson-completions";

const d = (iso: string) => new Date(iso);

describe("completionTimestamp", () => {
  it("returns the latest of the parts", () => {
    expect(
      completionTimestamp({
        videoWatchedAt: d("2026-01-01T10:00:00Z"),
        sectionTappedAt: [d("2026-01-03T10:00:00Z"), d("2026-01-02T10:00:00Z")],
        quizFirstAt: d("2026-01-02T12:00:00Z"),
        visitedAt: null,
      }),
    ).toEqual(d("2026-01-03T10:00:00Z"));
  });

  it("ignores nulls", () => {
    expect(
      completionTimestamp({
        videoWatchedAt: null,
        sectionTappedAt: [],
        quizFirstAt: d("2026-01-02T12:00:00Z"),
        visitedAt: null,
      }),
    ).toEqual(d("2026-01-02T12:00:00Z"));
  });

  it("is null when every part is null or empty", () => {
    expect(
      completionTimestamp({
        videoWatchedAt: null,
        sectionTappedAt: [],
        quizFirstAt: null,
        visitedAt: null,
      }),
    ).toBeNull();
  });
});

describe("videoWatchedAt", () => {
  const firstHits = new Map([
    [10, d("2026-01-01T10:00:00Z")],
    [15, d("2026-01-05T10:00:00Z")],
    [20, d("2026-01-02T10:00:00Z")],
  ]);

  it("is the latest first-hit across the required milestones", () => {
    expect(videoWatchedAt(firstHits, [10, 15, 20])).toEqual(
      d("2026-01-05T10:00:00Z"),
    );
  });

  it("is null while any required milestone was never hit", () => {
    expect(videoWatchedAt(firstHits, [10, 15, 20, 25])).toBeNull();
  });
});

describe("resolveDoneAt", () => {
  const base = {
    videoWatchedAt: null,
    sectionTappedAt: [] as Date[],
    quizFirstAt: null,
    visitedAt: null,
  };

  it("counts only the parts the lesson needs", () => {
    expect(
      resolveDoneAt(
        { video: false, sections: 0, quiz: true, visit: false },
        {
          ...base,
          videoWatchedAt: d("2026-03-01T00:00:00Z"),
          quizFirstAt: d("2026-01-01T00:00:00Z"),
        },
      ),
    ).toEqual(d("2026-01-01T00:00:00Z"));
  });

  it("is null when a needed part has no timestamp, rather than guessing from the rest", () => {
    expect(
      resolveDoneAt(
        { video: true, sections: 0, quiz: true, visit: false },
        { ...base, quizFirstAt: d("2026-01-01T00:00:00Z") },
      ),
    ).toBeNull();
  });

  it("needs a timestamp for every needed section", () => {
    expect(
      resolveDoneAt(
        { video: false, sections: 2, quiz: false, visit: false },
        { ...base, sectionTappedAt: [d("2026-01-01T00:00:00Z")] },
      ),
    ).toBeNull();
  });

  it("uses the visit when it is the lesson only requirement", () => {
    expect(
      resolveDoneAt(
        { video: false, sections: 0, quiz: false, visit: true },
        { ...base, visitedAt: d("2026-02-01T00:00:00Z") },
      ),
    ).toEqual(d("2026-02-01T00:00:00Z"));
  });
});
