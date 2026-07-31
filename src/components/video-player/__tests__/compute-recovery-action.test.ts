import { describe, expect, it } from 'vitest';
import {
  computeRecoveryDecision,
  MAX_RECOVERY_ATTEMPTS,
} from '../compute-recovery-action';

describe('computeRecoveryDecision', () => {
  it('retries on the first fatal rejection, counting up from zero prior attempts', () => {
    const decision = computeRecoveryDecision(0);
    expect(decision).toEqual({
      kind: 'retry',
      attempt: 1,
      message: 'Your playback session expired. Reconnecting…',
    });
  });

  it('keeps retrying while under the cap', () => {
    const decision = computeRecoveryDecision(MAX_RECOVERY_ATTEMPTS - 1);
    expect(decision.kind).toBe('retry');
    if (decision.kind !== 'retry') throw new Error('expected retry');
    expect(decision.attempt).toBe(MAX_RECOVERY_ATTEMPTS);
  });

  it('goes terminal once the cap is reached — never an unbounded retry loop', () => {
    const decision = computeRecoveryDecision(MAX_RECOVERY_ATTEMPTS);
    expect(decision.kind).toBe('terminal');
  });

  it('stays terminal for any attempt count beyond the cap, not just exactly at it', () => {
    expect(computeRecoveryDecision(MAX_RECOVERY_ATTEMPTS + 5).kind).toBe(
      'terminal',
    );
  });

  it('gives the terminal state truthful copy, not the "Reconnecting…" message', () => {
    const decision = computeRecoveryDecision(MAX_RECOVERY_ATTEMPTS);
    if (decision.kind !== 'terminal') throw new Error('expected terminal');
    expect(decision.message).not.toMatch(/reconnect/i);
    expect(decision.message.length).toBeGreaterThan(0);
  });
});
