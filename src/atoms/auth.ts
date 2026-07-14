import { atom } from 'jotai';

/** The email the user is signing in with; set once the OTP send succeeds. */
export const authEmailAtom = atom<string>('');
/** Timestamp (ms) after which the resend button becomes available again. */
export const resendAvailableAtAtom = atom<number>(0);
/** Seconds remaining until the resend button is available; written by the machine's ticker. */
export const resendCountdownAtom = atom<number>(0);
/** Server-side auth error message shown in the form, or null when there is none. */
export const authErrorAtom = atom<string | null>(null);
