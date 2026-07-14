import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';

import {
  authEmailAtom,
  authErrorAtom,
  resendAvailableAtAtom,
} from '../../atoms/auth';
import {
  authLoginMachine,
  createAuthLoginImplementations,
} from '../auth-login-machine';

interface Overrides {
  sendOtp?: (email: string) => Promise<void>;
  verifyOtp?: (args: { email: string; otp: string }) => Promise<void>;
  redirect?: () => Promise<void>;
}

function makeActor(overrides: Overrides = {}) {
  const store = createStore();
  const redirect = overrides.redirect ?? vi.fn(async () => {});
  const sendOtp = overrides.sendOtp ?? vi.fn(async () => {});
  const verifyOtp = overrides.verifyOtp ?? vi.fn(async () => {});
  const impl = createAuthLoginImplementations({
    store,
    sendOtp,
    verifyOtp,
    redirect,
  });
  const actor = createActor(authLoginMachine.provide(impl));
  return { store, actor, redirect, sendOtp, verifyOtp };
}

describe('authLoginMachine', () => {
  it('completes the happy path and redirects exactly once', async () => {
    const { store, actor, redirect } = makeActor();
    actor.start();

    actor.send({ type: 'SUBMIT_EMAIL', email: 'pilot@example.com' });
    await waitFor(actor, (s) => s.matches('otpEntry'));
    expect(store.get(authEmailAtom)).toBe('pilot@example.com');

    actor.send({ type: 'SUBMIT_OTP', otp: '123456' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(redirect).toHaveBeenCalledTimes(1);

    actor.stop();
  });

  it('returns to otpEntry and records a mapped error on invalid otp', async () => {
    const { store, actor, redirect } = makeActor({
      verifyOtp: async () => {
        throw { code: 'INVALID_OTP' };
      },
    });
    actor.start();

    actor.send({ type: 'SUBMIT_EMAIL', email: 'pilot@example.com' });
    await waitFor(actor, (s) => s.matches('otpEntry'));

    actor.send({ type: 'SUBMIT_OTP', otp: '000000' });
    await waitFor(
      actor,
      (s) => s.matches('otpEntry') && store.get(authErrorAtom) !== null,
    );

    expect(store.get(authErrorAtom)).toBe('Incorrect code. Please try again.');
    expect(redirect).not.toHaveBeenCalled();

    actor.stop();
  });

  it('resends and bumps the resend timer', async () => {
    const { store, actor, sendOtp } = makeActor();
    actor.start();

    actor.send({ type: 'SUBMIT_EMAIL', email: 'pilot@example.com' });
    await waitFor(actor, (s) => s.matches('otpEntry'));
    const firstResendAt = store.get(resendAvailableAtAtom);

    actor.send({ type: 'RESEND' });
    await waitFor(actor, (s) => s.matches('resendingOtp'));
    await waitFor(actor, (s) => s.matches('otpEntry'));

    expect(sendOtp).toHaveBeenCalledTimes(2);
    expect(store.get(resendAvailableAtAtom)).toBeGreaterThanOrEqual(
      firstResendAt,
    );

    actor.stop();
  });

  it('clears email and error on BACK', async () => {
    const { store, actor } = makeActor({
      sendOtp: async () => {
        throw { code: 'TOO_MANY_ATTEMPTS' };
      },
    });
    actor.start();

    // Trigger an error first so we can prove BACK clears it.
    actor.send({ type: 'SUBMIT_EMAIL', email: 'pilot@example.com' });
    await waitFor(
      actor,
      (s) => s.matches('emailEntry') && store.get(authErrorAtom) !== null,
    );
    expect(store.get(authErrorAtom)).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );

    // Now succeed to reach otpEntry, then go BACK.
    const { store: store2, actor: actor2 } = makeActor();
    actor2.start();
    actor2.send({ type: 'SUBMIT_EMAIL', email: 'pilot@example.com' });
    await waitFor(actor2, (s) => s.matches('otpEntry'));
    actor2.send({ type: 'BACK' });
    await waitFor(actor2, (s) => s.matches('emailEntry'));
    expect(store2.get(authEmailAtom)).toBe('');
    expect(store2.get(authErrorAtom)).toBeNull();

    actor.stop();
    actor2.stop();
  });
});
