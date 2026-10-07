import {
  getCallById,
  markCallEnded,
  saveTranscriptOnce,
  type VideoCall,
} from '#/db/video-calls';
import { getConversation } from '#/lib/tavus.server';
import { mapShutdownReason, transcriptToMessages } from '#/lib/tavus-messages';
import { clampDuration } from '#/lib/video-call-allowance';

/**
 * Brings one `video_calls` row in line with Tavus: marks it ended (with the
 * real duration and reason) once Tavus has shut the call down, and appends
 * the transcript once Tavus has it. Called from the webhook, the end route,
 * status polling and the start route's leftover-call check — every step is
 * idempotent (`markCallEnded` only moves active rows; `saveTranscriptOnce`
 * claims before it inserts).
 */
export async function reconcileVideoCall(call: VideoCall): Promise<VideoCall> {
  if (call.status === 'ended' && call.transcriptSavedAt) return call;

  const conversation = await getConversation(call.tavusConversationId);

  if (call.status === 'active' && conversation.status === 'ended') {
    const endedAt = conversation.shutdown?.at ?? new Date();
    await markCallEnded(call.id, {
      endedAt,
      durationSeconds: clampDuration(
        call.startedAt,
        endedAt,
        call.reservedSeconds,
      ),
      endReason: mapShutdownReason(conversation.shutdown?.reason),
    });
  }

  const latest = (await getCallById(call.id)) ?? call;

  if (
    latest.status === 'ended' &&
    !latest.transcriptSavedAt &&
    conversation.transcript
  ) {
    await saveTranscriptOnce(
      latest.id,
      latest.chatId,
      transcriptToMessages(conversation.transcript, {
        durationSeconds: latest.durationSeconds,
        endReason: latest.endReason,
      }),
    );
    return (await getCallById(call.id)) ?? latest;
  }

  return latest;
}
