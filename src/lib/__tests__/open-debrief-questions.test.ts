// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserRoleNames, selectOpenAttemptQuestions } = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  selectOpenAttemptQuestions: vi.fn(),
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames }));
vi.mock('#/db/debrief-attempts', () => ({ selectOpenAttemptQuestions }));

import { findOpenDebriefQuestions } from '../open-debrief-questions.server';

beforeEach(() => {
  vi.clearAllMocks();
  selectOpenAttemptQuestions.mockResolvedValue(['Q one?']);
});

describe('findOpenDebriefQuestions', () => {
  it("returns a learner's open debrief questions", async () => {
    getUserRoleNames.mockResolvedValueOnce(['pilot']);
    expect(await findOpenDebriefQuestions('u1')).toEqual(['Q one?']);
    expect(selectOpenAttemptQuestions).toHaveBeenCalledWith('u1');
  });

  it.each([
    'admin',
    'owner',
  ])('returns none for an org %s: they may ask Viper anything', async (role) => {
    getUserRoleNames.mockResolvedValueOnce([role]);
    expect(await findOpenDebriefQuestions('u1')).toEqual([]);
  });
});
