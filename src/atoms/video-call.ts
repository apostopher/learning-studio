import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ChatWindowRect } from '#/atoms/chat-widget';
import type { VideoCallErrorReason } from '#/lib/video-call-copy';

export type VideoCallPhase =
  | 'idle'
  | 'requesting-media'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'error';

export interface VideoCallState {
  phase: VideoCallPhase;
  callId: string | null;
  chatId: string | null;
  endsAt: string | null;
  error: VideoCallErrorReason | null;
  resetsAt: string | null;
}

export const IDLE_VIDEO_CALL: VideoCallState = {
  phase: 'idle',
  callId: null,
  chatId: null,
  endsAt: null,
  error: null,
  resetsAt: null,
};

/** Not persisted: a call cannot survive a reload (the Daily call object lives in memory). */
export const videoCallAtom = atom<VideoCallState>(IDLE_VIDEO_CALL);
export const videoDockedAtom = atom(true);
export const videoMicMutedAtom = atom(false);
export const videoCameraOnAtom = atom(false);
export const videoRemoteStreamAtom = atom<MediaStream | null>(null);
export const videoLocalStreamAtom = atom<MediaStream | null>(null);
export const videoTranscriptAtom = atom<
  'idle' | 'saving' | 'saved' | 'delayed'
>('idle');

/** Popped-out video window rect; persisted like the chat window's. */
export const videoWindowRectAtom = atomWithStorage<ChatWindowRect | null>(
  'video-window-rect',
  null,
  undefined,
  { getOnInit: true },
);

/** Wall clock that ticks once a second, only while something reads it
 * (the countdown) — so the rest of the widget doesn't re-render each second. */
const nowBaseAtom = atom(Date.now());
nowBaseAtom.onMount = (set) => {
  set(Date.now());
  const id = setInterval(() => set(Date.now()), 1000);
  return () => clearInterval(id);
};
export const nowAtom = atom((get) => get(nowBaseAtom));

const WIDE_QUERY = '(min-width: 640px)';
const wideViewportBaseAtom = atom(
  typeof window === 'undefined' ? true : window.matchMedia(WIDE_QUERY).matches,
);
wideViewportBaseAtom.onMount = (set) => {
  const mql = window.matchMedia(WIDE_QUERY);
  const onChange = () => set(mql.matches);
  onChange();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
/** Pop-out is offered only at ≥ 640 px. */
export const wideViewportAtom = atom((get) => get(wideViewportBaseAtom));
