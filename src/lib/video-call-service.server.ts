import {
  getActiveCallForUser,
  listCallsSince,
  markCallEnded,
  type VideoCall,
} from '#/db/video-calls';
import {
  type Allowance,
  computeAllowance,
  isStale,
  utcDayWindow,
} from '#/lib/video-call-allowance';
import type {
  AllowanceResponse,
  VideoCallStatusResponse,
} from '#/lib/video-call-contract';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

/**
 * Returns the user's genuinely live call, or null. A leftover `active` row
 * (closed tab) is first reconciled with Tavus, which ends abandoned calls
 * ~30 s after the learner leaves — so a learner can retry within a minute
 * rather than waiting out the stale window. The stale window is only the
 * fallback for when Tavus can't be reached.
 */
export async function settleActiveCall(
  userId: string,
  now: Date,
): Promise<VideoCall | null> {
  const active = await getActiveCallForUser(userId);
  if (!active) return null;

  try {
    const latest = await reconcileVideoCall(active);
    if (latest.status === 'ended') return null;
  } catch (err) {
    console.error('video call reconcile failed', err);
  }

  if (isStale(active, now)) {
    await markCallEnded(active.id, {
      endedAt: now,
      durationSeconds: active.reservedSeconds,
      endReason: 'stale',
    });
    return null;
  }
  return active;
}

export async function loadAllowance(
  userId: string,
  now: Date,
): Promise<{ allowance: Allowance; activeCall: VideoCall | null }> {
  const activeCall = await settleActiveCall(userId, now);
  const rows = await listCallsSince(userId, utcDayWindow(now).start);
  return { allowance: computeAllowance(rows, now), activeCall };
}

export function toAllowanceResponse(input: {
  allowance: Allowance;
  activeCall: VideoCall | null;
  configured: boolean;
}): AllowanceResponse {
  const { allowance, activeCall, configured } = input;
  const reason = !configured
    ? 'not_configured'
    : activeCall
      ? 'already_active'
      : allowance.canStart
        ? null
        : 'daily_limit';
  return {
    canStart: reason === null,
    reason,
    remainingSeconds: allowance.remainingSeconds,
    resetsAt: allowance.resetsAt.toISOString(),
    activeCallId: activeCall?.id ?? null,
  };
}

export function toStatusResponse(call: VideoCall): VideoCallStatusResponse {
  return {
    status: call.status,
    endReason: call.endReason,
    durationSeconds: call.durationSeconds,
    transcriptSaved: call.transcriptSavedAt !== null,
    chatId: call.chatId,
  };
}
