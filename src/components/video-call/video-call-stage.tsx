import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';
import type { VideoCallPhase } from '#/atoms/video-call';
import {
  VideoCallControls,
  type VideoCallControlsProps,
} from './video-call-controls';

const PHASE_COPY: Partial<Record<VideoCallPhase, string>> = {
  'requesting-media': 'Waiting for microphone permission…',
  connecting: 'Connecting to Viper…',
  reconnecting: 'Reconnecting…',
  ending: 'Ending call…',
};

/** Sets a MediaStream on a <video> through a ref callback (DOM manipulation,
 * allowed in presentational components); idempotent across re-renders. */
const attachStream =
  (stream: MediaStream | null) => (el: HTMLVideoElement | null) => {
    if (el && el.srcObject !== stream) el.srcObject = stream;
  };

export interface VideoCallStageProps
  extends Omit<VideoCallControlsProps, 'disabled'> {
  phase: VideoCallPhase;
  errorMessage: string | null;
  canRetry: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  warning: ReactNode;
  onRetry: () => void;
  onDismiss: () => void;
}

export function VideoCallStage(props: VideoCallStageProps) {
  if (props.errorMessage) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-primary text-sm">{props.errorMessage}</p>
        <div className="flex gap-2">
          {props.canRetry && (
            <Button
              onClick={props.onRetry}
              className="rounded-lg bg-accent-9 px-4 py-2 font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2"
            >
              Try again
            </Button>
          )}
          <Button
            onClick={props.onDismiss}
            className="rounded-lg border border-gray-7 px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
          >
            Back to chat
          </Button>
        </div>
      </div>
    );
  }

  const status = PHASE_COPY[props.phase];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 bg-gray-1">
        {/* Viper's audio plays from this element too, so it is never muted. */}
        {/* biome-ignore lint/a11y/useMediaCaption: live two-way call; no caption track exists for a realtime stream (the transcript is saved to the chat afterwards). */}
        <video
          ref={attachStream(props.remoteStream)}
          autoPlay
          playsInline
          aria-label="Viper7"
          className="size-full object-contain"
        />
        {status && (
          <output className="absolute inset-0 flex items-center justify-center bg-gray-1/80 text-secondary text-sm">
            {status}
          </output>
        )}
        {props.localStream && props.isCameraOn && (
          <video
            ref={attachStream(props.localStream)}
            autoPlay
            playsInline
            muted
            aria-label="Your camera"
            // Mirrored like a mirror — a visual-axis transform, not a direction.
            // bottom-3 is physical: Tailwind has no block-end inset utility;
            // this is an overlay corner of the video frame.
            className="absolute end-3 bottom-3 w-28 -scale-x-100 rounded-lg border border-gray-6 shadow-md"
          />
        )}
        {props.warning}
      </div>
      <VideoCallControls
        countdown={props.countdown}
        isMuted={props.isMuted}
        isCameraOn={props.isCameraOn}
        canPopOut={props.canPopOut}
        isDocked={props.isDocked}
        disabled={props.phase !== 'live'}
        onToggleMute={props.onToggleMute}
        onToggleCamera={props.onToggleCamera}
        onTogglePopOut={props.onTogglePopOut}
        onEnd={props.onEnd}
      />
    </div>
  );
}
