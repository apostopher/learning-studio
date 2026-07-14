import type { createStore } from 'jotai';
import { fromCallback, fromPromise, setup } from 'xstate';

import {
  authEmailAtom,
  authErrorAtom,
  resendAvailableAtAtom,
  resendCountdownAtom,
} from '../atoms/auth';

type JotaiStore = ReturnType<typeof createStore>;

export const RESEND_COOLDOWN_MS = 30_000;

const ERROR_MESSAGES: Record<string, string> = {
  OTP_EXPIRED: 'That code has expired. Request a new one.',
  INVALID_OTP: 'Incorrect code. Please try again.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait a moment and try again.',
};

export function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    if (code in ERROR_MESSAGES) return ERROR_MESSAGES[code];
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}

export type AuthLoginEvent =
  | { type: 'SUBMIT_EMAIL'; email: string }
  | { type: 'SUBMIT_OTP'; otp: string }
  | { type: 'RESEND' }
  | { type: 'BACK' };

export interface AuthLoginDeps {
  store: JotaiStore;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (args: { email: string; otp: string }) => Promise<void>;
  redirect: () => Promise<void>;
}

/**
 * Context-free login machine. It declares the flow's states, transitions, and
 * the *names* of its side effects. Concrete implementations are injected via
 * `authLoginMachine.provide(createAuthLoginImplementations(deps))` so all flow
 * data lives in jotai (never XState context) and network calls stay in
 * react-query.
 */
export const authLoginMachine = setup({
  types: {
    events: {} as AuthLoginEvent,
  },
  actors: {
    sendOtp: fromPromise<void>(async () => {}),
    verifyOtp: fromPromise<void, { otp: string }>(async () => {}),
    redirect: fromPromise<void>(async () => {}),
    ticker: fromCallback(() => {}),
  },
  actions: {
    assignEmail: (_, _params: { email: string }) => {},
    setResendAt: () => {},
    setError: (_, _params: { error: unknown }) => {},
    clearError: () => {},
    resetFlow: () => {},
  },
}).createMachine({
  id: 'authLogin',
  initial: 'emailEntry',
  states: {
    emailEntry: {
      on: {
        SUBMIT_EMAIL: {
          target: 'sendingOtp',
          actions: [
            'clearError',
            {
              type: 'assignEmail',
              params: ({ event }) => ({ email: event.email }),
            },
          ],
        },
      },
    },
    sendingOtp: {
      invoke: {
        src: 'sendOtp',
        onDone: { target: 'otpEntry', actions: 'setResendAt' },
        onError: {
          target: 'emailEntry',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    otpEntry: {
      invoke: { src: 'ticker' },
      on: {
        SUBMIT_OTP: { target: 'verifyingOtp', actions: 'clearError' },
        RESEND: { target: 'resendingOtp', actions: 'clearError' },
        BACK: { target: 'emailEntry', actions: 'resetFlow' },
      },
    },
    verifyingOtp: {
      invoke: {
        src: 'verifyOtp',
        input: ({ event }) => ({
          otp: (event as Extract<AuthLoginEvent, { type: 'SUBMIT_OTP' }>).otp,
        }),
        onDone: 'redirecting',
        onError: {
          target: 'otpEntry',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    resendingOtp: {
      invoke: {
        src: 'sendOtp',
        onDone: { target: 'otpEntry', actions: 'setResendAt' },
        onError: {
          target: 'otpEntry',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    redirecting: {
      invoke: {
        src: 'redirect',
        onDone: 'done',
        onError: {
          target: 'otpEntry',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    done: { type: 'final' },
  },
});

/**
 * Builds the concrete actor/action implementations for `authLoginMachine`.
 * Everything that touches jotai or the network is closed over here, keeping the
 * machine itself pure and testable.
 */
export function createAuthLoginImplementations(deps: AuthLoginDeps) {
  const { store } = deps;
  return {
    actors: {
      sendOtp: fromPromise<void>(async () => {
        await deps.sendOtp(store.get(authEmailAtom));
      }),
      verifyOtp: fromPromise<void, { otp: string }>(async ({ input }) => {
        await deps.verifyOtp({
          email: store.get(authEmailAtom),
          otp: input.otp,
        });
      }),
      redirect: fromPromise<void>(async () => {
        await deps.redirect();
      }),
      ticker: fromCallback(() => {
        const tick = () => {
          const target = store.get(resendAvailableAtAtom);
          const remaining = Math.max(
            0,
            Math.ceil((target - Date.now()) / 1000),
          );
          store.set(resendCountdownAtom, remaining);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      }),
    },
    actions: {
      assignEmail: (_: unknown, params: { email: string }) => {
        store.set(authEmailAtom, params.email);
      },
      setResendAt: () => {
        store.set(resendAvailableAtAtom, Date.now() + RESEND_COOLDOWN_MS);
      },
      setError: (_: unknown, params: { error: unknown }) => {
        store.set(authErrorAtom, resolveErrorMessage(params.error));
      },
      clearError: () => {
        store.set(authErrorAtom, null);
      },
      resetFlow: () => {
        store.set(authEmailAtom, '');
        store.set(authErrorAtom, null);
      },
    },
  };
}
