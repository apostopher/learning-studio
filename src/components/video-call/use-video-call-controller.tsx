import Daily, {
  type DailyCall,
  type DailyEventObjectTrack,
} from '@daily-co/daily-js';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useAtom, useAtomValue } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import { toast } from 'sonner';
import {
  IDLE_VIDEO_CALL,
  videoCallAtom,
  videoCameraOnAtom,
  videoDockedAtom,
  videoLocalStreamAtom,
  videoMicMutedAtom,
  videoRemoteStreamAtom,
  videoTranscriptAtom,
  wideViewportAtom,
} from '#/atoms/video-call';
import type { HeaderVideoCallProps } from '#/components/chat-widget/chat-widget-header';
import { dataKeys } from '#/data-hooks/keys';
import {
  type ChatMessage,
  fetchChatWithMessages,
} from '#/data-hooks/use-chat-messages';
import {
  fetchVideoCallStatus,
  useEndVideoCall,
  useStartVideoCall,
  useVideoCallAllowance,
  VideoCallStartError,
} from '#/data-hooks/use-video-call';
import { callErrorMessage, videoButtonLabel } from '#/lib/video-call-copy';
import {
  CallCountdownContainer,
  CallTimeWarningContainer,
} from './call-countdown-container';
import { OnCallBar } from './on-call-bar';
import { TranscriptStatusLine } from './transcript-status-line';
import { VideoCallStage } from './video-call-stage';
import { VideoCallWindow } from './video-call-window';

const TRANSCRIPT_POLL_MS = 3000;
const TRANSCRIPT_POLL_ATTEMPTS = 20;
const ACTIVE_PHASES = new Set([
  'requesting-media',
  'connecting',
  'live',
  'reconnecting',
  'ending',
]);
const RETRYABLE = new Set([
  'mic_denied',
  'provider_unavailable',
  'connection_failed',
]);

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const toUIMessage = (m: ChatMessage): UIMessage => ({
  id: m.id,
  role: m.role as UIMessage['role'],
  parts: m.parts as UIMessage['parts'],
});

/** The live Daily session: the call object plus the server ids it belongs to,
 * so every handler can tell whether it still owns the current call. */
interface DailySession {
  daily: DailyCall;
  callId: string;
  chatId: string;
}

/**
 * Container logic for the Tavus video call, used by the always-mounted
 * Viper7Chat so a call survives the chat window closing (when popped out)
 * and route changes. Holds the Daily call object in a ref (an external,
 * non-serialisable resource); all UI state is in jotai atoms. Everything runs
 * from event handlers — button clicks and the Daily callbacks registered in
 * `start` — per docs/use-effect-rules.md.
 */
export function useVideoCallController(input: {
  enabled: boolean;
  chatOpen: boolean;
  courseSlug: string | undefined;
  getChatId: () => string | undefined;
  adoptChatId: (id: string) => void;
  replaceMessages: (messages: UIMessage[]) => void;
  /** A text turn is submitted/streaming; replacing messages would drop it. */
  isChatBusy: () => boolean;
}) {
  const [call, setCall] = useAtom(videoCallAtom);
  const [docked, setDocked] = useAtom(videoDockedAtom);
  const [muted, setMuted] = useAtom(videoMicMutedAtom);
  const [cameraOn, setCameraOn] = useAtom(videoCameraOnAtom);
  const [remoteStream, setRemoteStream] = useAtom(videoRemoteStreamAtom);
  const [localStream, setLocalStream] = useAtom(videoLocalStreamAtom);
  const [transcript, setTranscript] = useAtom(videoTranscriptAtom);
  const wide = useAtomValue(wideViewportAtom);
  const queryClient = useQueryClient();
  const startMutation = useStartVideoCall();
  const endMutation = useEndVideoCall();
  const sessionRef = useRef<DailySession | null>(null);
  // Bumped by every `start` and by a hang-up before Daily exists; an async
  // step that resumes under a different value has been cancelled/superseded.
  const attemptRef = useRef(0);

  const isActive = ACTIVE_PHASES.has(call.phase);
  // Disabled during a call: the server's allowance route calls Tavus then.
  const allowance = useVideoCallAllowance(
    input.enabled && input.chatOpen && !isActive,
  );

  function onTrack(event: DailyEventObjectTrack, started: boolean) {
    const { track } = event;
    const isLocal = event.participant?.local ?? false;
    if (isLocal && track.kind === 'audio') return; // never play our own mic back
    const next = (prev: MediaStream | null) => {
      const others = (prev?.getTracks() ?? []).filter(
        (t) => t.kind !== track.kind,
      );
      const tracks = started ? [...others, track] : others;
      return tracks.length > 0 ? new MediaStream(tracks) : null;
    };
    if (isLocal) setLocalStream(next);
    else setRemoteStream(next);
  }

  async function loadTranscript(callId: string, chatId: string) {
    const attempt = attemptRef.current;
    setTranscript('saving');
    for (let i = 0; i < TRANSCRIPT_POLL_ATTEMPTS; i++) {
      await delay(TRANSCRIPT_POLL_MS);
      // A new call started; its own transcript flow owns the status line now.
      if (attemptRef.current !== attempt) return;
      try {
        const status = await queryClient.fetchQuery({
          queryKey: dataKeys.videoCall(callId),
          queryFn: () => fetchVideoCallStatus(callId),
          staleTime: 0,
        });
        if (!status.transcriptSaved) continue;
        // Wait out an in-flight text turn: replacing now would drop it (its
        // user message, or its reply, may not be persisted yet).
        if (input.isChatBusy()) continue;
        // The widget's useChat state is the only client copy (no server
        // rehydration), so load the persisted chat — text turns, the call's
        // transcript and its status lines — and replace it wholesale.
        const chat = await queryClient.fetchQuery({
          queryKey: dataKeys.chatMessages(chatId),
          queryFn: () => fetchChatWithMessages(chatId),
          staleTime: 0,
        });
        if (attemptRef.current !== attempt) return;
        if (input.isChatBusy()) continue;
        input.replaceMessages(chat.messages.map(toUIMessage));
        setTranscript('saved');
        return;
      } catch {
        // Transient — try again on the next tick.
      }
    }
    if (attemptRef.current === attempt) setTranscript('delayed');
  }

  async function finish(session: DailySession, error?: 'connection_failed') {
    // `leave()` fires left-meeting (and possibly participant-left), which
    // land here again; only the first caller for the current session proceeds.
    if (sessionRef.current !== session) return;
    sessionRef.current = null;
    const { daily, callId, chatId } = session;
    setCall((c) => ({ ...c, phase: 'ending' }));
    try {
      await daily.leave();
    } catch {
      // Already gone.
    }
    try {
      await daily.destroy();
    } catch {
      // Already destroyed.
    }
    setRemoteStream(null);
    setLocalStream(null);
    setMuted(false);
    setCameraOn(false);
    // An error is only shown docked (the floating window is for live calls),
    // so a popped-out call that fails comes back to the chat window.
    if (error) setDocked(true);
    setCall({
      ...IDLE_VIDEO_CALL,
      phase: error ? 'error' : 'ended',
      callId,
      chatId,
      error: error ?? null,
    });
    endMutation.mutate(callId);
    void loadTranscript(callId, chatId);
  }

  async function start() {
    if (isActive) return;
    const attempt = ++attemptRef.current;
    const cancelled = () => attemptRef.current !== attempt;
    setDocked(true);
    setTranscript('idle');
    setCall({ ...IDLE_VIDEO_CALL, phase: 'requesting-media' });

    // `mediaDevices` is undefined outside a secure context (plain http), which
    // is not a permission problem — say so instead of blaming the mic.
    if (!navigator.mediaDevices?.getUserMedia) {
      setCall({
        ...IDLE_VIDEO_CALL,
        phase: 'error',
        error: 'insecure_context',
      });
      return;
    }
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of probe.getTracks()) track.stop();
    } catch {
      if (cancelled()) return;
      setCall({ ...IDLE_VIDEO_CALL, phase: 'error', error: 'mic_denied' });
      return;
    }
    if (cancelled()) return;

    setCall({ ...IDLE_VIDEO_CALL, phase: 'connecting' });
    let started: Awaited<ReturnType<typeof startMutation.mutateAsync>>;
    try {
      started = await startMutation.mutateAsync({
        chatId: input.getChatId(),
        courseSlug: input.courseSlug,
      });
    } catch (err) {
      if (cancelled()) return;
      const startError = err instanceof VideoCallStartError ? err : null;
      setCall({
        ...IDLE_VIDEO_CALL,
        phase: 'error',
        error: startError?.reason ?? 'provider_unavailable',
        resetsAt: startError?.resetsAt ?? null,
      });
      return;
    }

    // The server may have created the chat row; later text turns continue it
    // even if the learner hung up while this request was in flight. An
    // existing id is never replaced (the server echoes it back when owned).
    if (!input.getChatId()) input.adoptChatId(started.chatId);
    if (cancelled()) {
      // Hung up before Daily existed: release the server-side conversation.
      endMutation.mutate(started.id);
      return;
    }

    let daily: DailyCall;
    try {
      daily = Daily.createCallObject({ subscribeToTracksAutomatically: true });
    } catch {
      // e.g. a leftover call object (Daily allows one). Nothing was said, so
      // there is no transcript to wait for — just release the conversation.
      endMutation.mutate(started.id);
      setCall({
        ...IDLE_VIDEO_CALL,
        phase: 'error',
        callId: started.id,
        chatId: started.chatId,
        error: 'connection_failed',
      });
      return;
    }
    const session: DailySession = {
      daily,
      callId: started.id,
      chatId: started.chatId,
    };
    sessionRef.current = session;
    // Ids are known from here, so a hang-up during join ends this call.
    setCall({
      ...IDLE_VIDEO_CALL,
      phase: 'connecting',
      callId: started.id,
      chatId: started.chatId,
      endsAt: started.endsAt,
    });
    const end = (error?: 'connection_failed') => void finish(session, error);
    daily
      .on('track-started', (e) => onTrack(e, true))
      .on('track-stopped', (e) => onTrack(e, false))
      .on('participant-left', (e) => {
        // The replica leaving means Tavus ended the call (time limit).
        if (!e.participant.local) end();
      })
      .on('left-meeting', () => end())
      .on('network-connection', (e) => {
        setCall((c) =>
          c.callId === started.id &&
          (c.phase === 'live' || c.phase === 'reconnecting')
            ? {
                ...c,
                phase: e.event === 'interrupted' ? 'reconnecting' : 'live',
              }
            : c,
        );
      })
      .on('camera-error', () => {
        setCameraOn(false);
        toast.error(
          "Camera unavailable. Check your browser's camera permission.",
        );
      })
      .on('error', () => end('connection_failed'));

    try {
      await daily.join({
        url: started.conversationUrl,
        startVideoOff: true,
        startAudioOff: false,
      });
    } catch {
      end('connection_failed');
      return;
    }
    // Hung up (or failed) while joining: `finish` already owns the state.
    if (sessionRef.current !== session) return;
    setCall({
      phase: 'live',
      callId: started.id,
      chatId: started.chatId,
      endsAt: started.endsAt,
      error: null,
      resetsAt: null,
    });
  }

  function hangUp() {
    const session = sessionRef.current;
    if (session) {
      void finish(session);
      return;
    }
    // Before Daily exists (mic prompt or start request in flight): cancel the
    // attempt; `start` releases any server-side call when it resumes.
    if (call.phase === 'requesting-media' || call.phase === 'connecting') {
      attemptRef.current++;
      setCall(IDLE_VIDEO_CALL);
    }
  }

  function toggleMute() {
    sessionRef.current?.daily.setLocalAudio(muted);
    setMuted(!muted);
  }

  function toggleCamera() {
    sessionRef.current?.daily.setLocalVideo(!cameraOn);
    setCameraOn(!cameraOn);
  }

  // Where the stage goes: in the chat window when docked and the window is
  // showing; otherwise in the floating window (which is also the fallback if
  // the chat window is hidden mid-call, e.g. navigating to /admin).
  const showDocked =
    (isActive || call.phase === 'error') && docked && input.chatOpen;
  const showFloating = isActive && (!docked || !input.chatOpen);

  const errorMessage =
    call.phase === 'error' && call.error
      ? callErrorMessage(call.error, call.resetsAt)
      : null;

  const stageNode = (
    <VideoCallStage
      phase={call.phase}
      errorMessage={errorMessage}
      canRetry={call.error !== null && RETRYABLE.has(call.error)}
      remoteStream={remoteStream}
      localStream={localStream}
      countdown={
        call.endsAt ? <CallCountdownContainer endsAt={call.endsAt} /> : '--:--'
      }
      warning={
        call.endsAt ? <CallTimeWarningContainer endsAt={call.endsAt} /> : null
      }
      isMuted={muted}
      isCameraOn={cameraOn}
      canPopOut={wide}
      isDocked={docked}
      onToggleMute={toggleMute}
      onToggleCamera={toggleCamera}
      onTogglePopOut={() => setDocked(!docked)}
      onEnd={hangUp}
      onRetry={() => void start()}
      onDismiss={() => setCall(IDLE_VIDEO_CALL)}
    />
  );

  const locked = (label: string): HeaderVideoCallProps => ({
    label,
    disabled: true,
    onClick: () => {},
  });

  function headerButtonFor(): HeaderVideoCallProps | undefined {
    if (!input.enabled) return undefined;
    if (isActive) return locked(videoButtonLabel({ status: 'in-call' }));
    const { data } = allowance;
    if (!data) {
      // A failed check must not read as "checking…" forever: say so, and let
      // the learner retry. (With data cached, a failed refetch keeps it.)
      return allowance.isError
        ? {
            label: videoButtonLabel({ status: 'check-failed' }),
            disabled: false,
            onClick: () => void allowance.refetch(),
          }
        : locked(videoButtonLabel({ status: 'loading' }));
    }
    if (data.reason) {
      return locked(
        videoButtonLabel({
          status: 'unavailable',
          reason: data.reason,
          resetsAt: data.resetsAt,
        }),
      );
    }
    return {
      label: videoButtonLabel({ status: 'available' }),
      disabled: false,
      onClick: () => void start(),
    };
  }
  const headerButton = headerButtonFor();

  const floatingWindow: ReactNode = (
    <AnimatePresence>
      {showFloating && (
        <VideoCallWindow key="video-window">{stageNode}</VideoCallWindow>
      )}
    </AnimatePresence>
  );

  return {
    headerButton,
    stage: showDocked ? stageNode : undefined,
    topBar:
      isActive && !showDocked && call.endsAt ? (
        <OnCallBar
          countdown={<CallCountdownContainer endsAt={call.endsAt} />}
          onBringBack={() => setDocked(true)}
        />
      ) : undefined,
    floatingWindow,
    afterMessages:
      transcript === 'saving' || transcript === 'delayed' ? (
        <TranscriptStatusLine state={transcript} />
      ) : undefined,
    /** Closing the chat window ends a docked call; a popped-out call keeps going. */
    closeChat: (onClose: () => void) => {
      if (isActive && docked) hangUp();
      onClose();
    },
  };
}
