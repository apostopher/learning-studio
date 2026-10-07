import { utc } from '@date-fns/utc';
import { format } from 'date-fns';
import {
  DAILY_LIMIT_SECONDS,
  type VideoCallEndReason,
  type VideoCallStartErrorReason,
  type VideoCallUnavailableReason,
} from '#/lib/video-call-contract';

export type VideoCallErrorReason =
  | VideoCallStartErrorReason
  | 'mic_denied'
  | 'insecure_context'
  | 'connection_failed';

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export function callEndedLabel(
  durationSeconds: number | null,
  endReason: VideoCallEndReason | null,
): string {
  if (endReason === 'time_limit')
    return 'Video call ended · time limit reached';
  if (durationSeconds !== null) {
    return `Video call ended · ${formatCallDuration(durationSeconds)}`;
  }
  return 'Video call ended';
}

export function secondsUntil(iso: string, nowMs: number): number {
  return (Date.parse(iso) - nowMs) / 1000;
}

function resetsAtLabel(resetsAt: string | null | undefined): string {
  if (!resetsAt) return '00:00 UTC';
  return `${format(new Date(resetsAt), 'HH:mm', { in: utc })} UTC`;
}

/** Why a call can't start and what unlocks it — without the leading
 * "Video call unavailable." so it can also be shown as an error body. */
function unavailableDetail(
  reason: VideoCallUnavailableReason,
  resetsAt: string | null | undefined,
): string {
  switch (reason) {
    case 'daily_limit':
      return `You've used today's ${DAILY_LIMIT_SECONDS / 60} minutes. Resets at ${resetsAtLabel(resetsAt)}.`;
    case 'already_active':
      // Usually a reload mid-call: the old call stays active until Tavus
      // notices the learner left (~30 s). The widget re-checks meanwhile.
      return 'A previous call is still closing. Try again in a minute.';
    case 'not_configured':
      return "Video calls aren't set up on this server yet.";
  }
}

export type VideoButtonLabelInput =
  | { status: 'loading' | 'available' | 'in-call' | 'check-failed' }
  | {
      status: 'unavailable';
      reason: VideoCallUnavailableReason;
      resetsAt?: string;
    };

/** The video button's tooltip AND accessible name — a locked state must say
 * why and what unlocks it in both. */
export function videoButtonLabel(input: VideoButtonLabelInput): string {
  switch (input.status) {
    case 'loading':
      return 'Checking video call availability…';
    case 'available':
      return 'Start a video call with Viper7';
    case 'in-call':
      return 'Video call in progress';
    case 'check-failed':
      return "Couldn't check video call availability. Select to try again.";
    case 'unavailable':
      return `Video call unavailable. ${unavailableDetail(input.reason, input.resetsAt)}`;
  }
}

export function callErrorMessage(
  reason: VideoCallErrorReason,
  resetsAt: string | null,
): string {
  switch (reason) {
    case 'mic_denied':
      return "Viper needs your microphone for a video call. Allow microphone access in your browser's site settings, then try again.";
    case 'insecure_context':
      return 'Video calls need a secure (https) connection.';
    case 'provider_unavailable':
      return "Couldn't start the video call. Try again in a moment.";
    case 'connection_failed':
      return 'The video call lost its connection.';
    case 'daily_limit':
    case 'already_active':
    case 'not_configured':
      return unavailableDetail(reason, resetsAt);
  }
}
