import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { resolveQuestionSet } from '#/lib/onboarding-session';
import type { OnboardingQuestions } from '#/types';

// Mocks below back `#/lib/onboarding-session.server` (a distinct module from
// `#/lib/onboarding-session` above, despite the shared test filename — see
// the file-naming note ahead of the `advanceOnboarding` describe block).
// `createOnboardingImplementations` is mocked rather than left real because
// its actors (`#/ai/onboarding/*`) import AI provider clients that need real
// env-configured API keys at import time; `advanceOnboarding` only ever
// passes the object through to `runOnboardingTurn`, which is mocked too, so
// its real shape is never exercised here.
const {
  getCourseIdentityBySlug,
  loadOnboardingSession,
  saveMachineSnapshot,
  clearMachineSnapshot,
  runOnboardingTurn,
  createOnboardingImplementations,
  findOnboardingRow,
  hasUserReply,
} = vi.hoisted(() => ({
  getCourseIdentityBySlug: vi.fn(),
  loadOnboardingSession: vi.fn(),
  saveMachineSnapshot: vi.fn(),
  clearMachineSnapshot: vi.fn(),
  runOnboardingTurn: vi.fn(),
  createOnboardingImplementations: vi.fn(),
  findOnboardingRow: vi.fn(),
  hasUserReply: vi.fn(),
}));

vi.mock('#/db/course', () => ({ getCourseIdentityBySlug }));
vi.mock('#/db/course-onboarding', () => ({
  loadOnboardingSession,
  saveMachineSnapshot,
  clearMachineSnapshot,
  deleteOnboarding: vi.fn(),
  findOnboardingRow,
  hasUserReply,
}));
vi.mock('#/lib/onboarding-runner', () => ({ runOnboardingTurn }));
vi.mock('#/machines/onboarding-implementations', () => ({
  createOnboardingImplementations,
}));

import {
  advanceOnboarding,
  closedSessionStatus,
  getOnboardingProgress,
  serialiseUpdatedAt,
} from '#/lib/onboarding-session.server';

const ADMIN: OnboardingQuestions = [
  { id: 'a1b2', text: 'Which airframe do you fly most?' },
  { id: 'c3d4', text: 'What does a good sortie look like to you?' },
];

describe('resolveQuestionSet', () => {
  it('uses the admin questions when the course has any', () => {
    expect(resolveQuestionSet(ADMIN)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
  });

  it('falls back to the defaults when the course has none', () => {
    expect(resolveQuestionSet([])).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen default source even after admin questions appear', () => {
    // The whole point of freezing: a user who onboarded on defaults must not
    // be re-interviewed when an admin later adds questions.
    expect(resolveQuestionSet(ADMIN, 'default')).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('honours a frozen admin source even after the admin deletes every question', () => {
    expect(resolveQuestionSet([], 'admin')).toEqual({
      questions: [],
      source: 'admin',
    });
  });

  it('treats a null frozen source as unfrozen and resolves fresh', () => {
    // Rows created before question_source existed.
    expect(resolveQuestionSet(ADMIN, null)).toEqual({
      questions: ADMIN,
      source: 'admin',
    });
    expect(resolveQuestionSet([], null)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });

  it('treats an undefined frozen source as unfrozen', () => {
    expect(resolveQuestionSet([], undefined)).toEqual({
      questions: DEFAULT_ONBOARDING_QUESTIONS,
      source: 'default',
    });
  });
});

describe('closedSessionStatus', () => {
  const NONE = {
    deletedAt: null,
    consentDeclinedAt: null,
    onboardingCompletedAt: null,
  };

  it('returns null when all three timestamps are null', () => {
    expect(closedSessionStatus(NONE)).toBeNull();
  });

  it('reports deleted when only deletedAt is set', () => {
    expect(closedSessionStatus({ ...NONE, deletedAt: new Date() })).toBe(
      'deleted',
    );
  });

  it('reports declined when only consentDeclinedAt is set', () => {
    expect(
      closedSessionStatus({ ...NONE, consentDeclinedAt: new Date() }),
    ).toBe('declined');
  });

  it('reports complete when only onboardingCompletedAt is set', () => {
    expect(
      closedSessionStatus({ ...NONE, onboardingCompletedAt: new Date() }),
    ).toBe('complete');
  });

  it('prefers deleted over declined and complete when more than one is set', () => {
    // Precedence order matters: a withdrawn session must read as 'deleted'
    // even if it was declined or completed first.
    const now = new Date();
    expect(
      closedSessionStatus({
        deletedAt: now,
        consentDeclinedAt: now,
        onboardingCompletedAt: now,
      }),
    ).toBe('deleted');
  });

  it('prefers declined over complete when both are set but not deleted', () => {
    const now = new Date();
    expect(
      closedSessionStatus({
        deletedAt: null,
        consentDeclinedAt: now,
        onboardingCompletedAt: now,
      }),
    ).toBe('declined');
  });
});

describe('serialiseUpdatedAt', () => {
  it('round-trips a Date to the exact ISO string Date.prototype.toISOString() would produce', () => {
    // Guards the invariant the code's own comment describes: both the
    // client-visible `updatedAt` and the `expectedUpdatedAt` concurrency
    // check MUST go through this same function, or the guard fires on every
    // request.
    const date = new Date('2026-07-28T12:34:56.789Z');
    expect(serialiseUpdatedAt(date)).toBe(date.toISOString());
  });
});

/**
 * Covers `advanceOnboarding` itself — this repo's established precedent for
 * testing glue like this (`selectLatestOnboardingError` in
 * `use-onboarding-chat.ts`, and the route tests in
 * `src/routes/api/course/onboarding/__tests__/`) is to mock every
 * collaborator with `vi.mock`/`vi.hoisted` and assert on what those
 * collaborators were actually called with — not just on the returned value.
 *
 * Deliberately named `onboarding-session.test.ts` (not
 * `onboarding-session.server.test.ts`) per this fix round's brief, which adds
 * to the file that already existed under this name rather than creating a
 * second one — see the mock block at the top of this file.
 */
describe('advanceOnboarding', () => {
  const row = {
    id: 1,
    userId: 'user-1',
    courseId: 1,
    answers: {},
    questionSetHash: null,
    questionSource: 'default',
    consentDeclinedAt: null,
    deletedAt: null,
    machineSnapshot: null,
    machineVersion: null,
    onboardingCompletedAt: null,
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    updatedAt: new Date('2026-07-28T00:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getCourseIdentityBySlug.mockResolvedValue({ id: 1, name: 'PPL' });
    loadOnboardingSession.mockResolvedValue({
      row,
      messages: [],
      questions: [],
      source: 'default',
    });
    createOnboardingImplementations.mockReturnValue({});
    saveMachineSnapshot.mockResolvedValue(new Date('2026-07-28T00:00:01.000Z'));
    clearMachineSnapshot.mockResolvedValue(
      new Date('2026-07-28T00:00:02.000Z'),
    );
  });

  it('clears the snapshot instead of saving it when the turn ends in `failed` (Fix 1)', async () => {
    // Regression test for the critical finding: `failed` is a real XState
    // final state (`status: 'done'`), which `restoreActor` happily restores —
    // only a genuine `status: 'error'` is rejected. Saving a `failed`
    // snapshot would therefore resurrect and instantly re-settle into
    // `failed` again on every future request, permanently bricking this
    // learner's onboarding after one transient model error. It must clear
    // instead, exactly like a `deleted` turn already does.
    runOnboardingTurn.mockResolvedValue({
      snapshot: { some: 'snapshot' },
      status: 'failed',
      transcript: [],
      newTurns: [],
      restoredFromSnapshot: true,
    });

    const result = await advanceOnboarding({
      userId: 'user-1',
      courseSlug: 'ppl',
      event: { type: 'REPLY', text: 'hi' },
    });

    expect(clearMachineSnapshot).toHaveBeenCalledWith({
      onboardingId: row.id,
    });
    expect(saveMachineSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      body: expect.objectContaining({ status: 'failed' }),
    });
  });

  it('skips both the save and the clear for a no-op `start` replay (Fix 4)', async () => {
    // A course-page view calls `start` (event: null) on every render to
    // derive its "should offer onboarding" prompt. When that replay restores
    // an existing snapshot and produces no new turns, nothing actually
    // advanced — persisting anyway would bump `updatedAt` and spuriously
    // 409 another tab's concurrent reply.
    runOnboardingTurn.mockResolvedValue({
      snapshot: { some: 'snapshot' },
      status: 'awaiting_answer',
      transcript: [],
      newTurns: [],
      restoredFromSnapshot: true,
    });

    const result = await advanceOnboarding({
      userId: 'user-1',
      courseSlug: 'ppl',
      event: null,
    });

    expect(saveMachineSnapshot).not.toHaveBeenCalled();
    expect(clearMachineSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      body: expect.objectContaining({
        updatedAt: serialiseUpdatedAt(row.updatedAt),
      }),
    });
  });

  it('still persists a `start` that produced new turns, e.g. the first-ever greet', async () => {
    runOnboardingTurn.mockResolvedValue({
      snapshot: { some: 'snapshot' },
      status: 'awaiting_consent',
      transcript: [{ role: 'assistant', text: 'hi' }],
      newTurns: [{ role: 'assistant', text: 'hi' }],
      restoredFromSnapshot: false,
    });

    await advanceOnboarding({
      userId: 'user-1',
      courseSlug: 'ppl',
      event: null,
    });

    expect(saveMachineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingId: row.id }),
    );
    expect(clearMachineSnapshot).not.toHaveBeenCalled();
  });

  it('still persists an explicit reply even when it produced no new turns', async () => {
    // event !== null must always persist — only the idempotent `start`
    // replay is made read-only.
    runOnboardingTurn.mockResolvedValue({
      snapshot: { some: 'snapshot' },
      status: 'awaiting_answer',
      transcript: [],
      newTurns: [],
      restoredFromSnapshot: true,
    });

    await advanceOnboarding({
      userId: 'user-1',
      courseSlug: 'ppl',
      event: { type: 'REPLY', text: 'hi' },
    });

    expect(saveMachineSnapshot).toHaveBeenCalled();
  });
});

describe('getOnboardingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseIdentityBySlug.mockResolvedValue({ id: 1, name: 'PPL' });
  });

  it('returns course_not_found when the slug does not resolve', async () => {
    getCourseIdentityBySlug.mockResolvedValueOnce(null);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'nope',
    });
    expect(result).toEqual({ ok: false, reason: 'course_not_found' });
    expect(findOnboardingRow).not.toHaveBeenCalled();
  });

  it('returns not_started when no row exists, without checking for a reply', async () => {
    findOnboardingRow.mockResolvedValue(null);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'not_started' });
    expect(hasUserReply).not.toHaveBeenCalled();
    expect(loadOnboardingSession).not.toHaveBeenCalled();
  });

  it('reports a closed status without checking for a reply', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: new Date(),
    });
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'complete' });
    expect(hasUserReply).not.toHaveBeenCalled();
    expect(loadOnboardingSession).not.toHaveBeenCalled();
  });

  it('returns not_started when the row is open and has no user reply yet', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: null,
      machineSnapshot: { some: 'snapshot' },
    });
    hasUserReply.mockResolvedValue(false);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'not_started' });
    expect(hasUserReply).toHaveBeenCalledWith({ onboardingId: 1 });
  });

  it('returns in_progress when the row is open and has a user reply', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: null,
      machineSnapshot: { some: 'snapshot' },
    });
    hasUserReply.mockResolvedValue(true);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'in_progress' });
  });

  it('reports in_progress for an open row with a null machine snapshot, without checking for a reply (Fix 3)', async () => {
    // An open (non-closed) row can only have a null snapshot because its most
    // recent turn ended in `'failed'` — `advanceOnboarding` always either
    // saves a fresh snapshot or clears it via `clearMachineSnapshot`, never
    // leaves it null any other way. Reporting `'not_started'` here would make
    // the widget auto-reopen and re-attempt (and re-fail) the greet forever.
    // The snapshot check short-circuits before `hasUserReply` is ever needed.
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: null,
      machineSnapshot: null,
    });
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'in_progress' });
    expect(hasUserReply).not.toHaveBeenCalled();
  });
});
