import { atom } from "jotai";

export type AuthStep = "email" | "otp";

export const authStepAtom = atom<AuthStep>("email");
export const authEmailAtom = atom<string>("");
/** Timestamp (ms) after which the resend button becomes available again. */
export const resendAvailableAtAtom = atom<number>(0);
/** Monotonically-updated "now" timestamp — ticked by the auth container to drive the resend countdown. */
export const nowAtom = atom<number>(0);
