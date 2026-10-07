import { Button } from '@base-ui/react/button';
import { Tooltip } from '@base-ui/react/tooltip';
import {
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  PictureInPicture2,
  Video,
  VideoOff,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

interface CallControlButtonProps {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Icon toggle for the call bar — Base UI Button + Tooltip, as in the chat
 * header, but a 40 px target since these are used mid-conversation. */
const CallControlButton = ({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: CallControlButtonProps) => (
  <Tooltip.Root disableHoverablePopup>
    <Tooltip.Trigger
      render={
        <Button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-primary transition-colors',
            'bg-gray-4 hover:bg-gray-5 aria-pressed:bg-gray-12 aria-pressed:text-gray-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      }
    >
      {children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={6} className="z-50">
        <Tooltip.Popup className="rounded-md bg-inverted px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
          {label}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export interface VideoCallControlsProps {
  countdown: ReactNode;
  isMuted: boolean;
  isCameraOn: boolean;
  canPopOut: boolean;
  isDocked: boolean;
  disabled: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onTogglePopOut: () => void;
  onEnd: () => void;
}

export function VideoCallControls(props: VideoCallControlsProps) {
  return (
    <div className="flex items-center gap-2 border-gray-6 border-t px-3 py-2">
      <CallControlButton
        label="Mute microphone"
        pressed={props.isMuted}
        disabled={props.disabled}
        onClick={props.onToggleMute}
      >
        {props.isMuted ? (
          <MicOff className="size-5" aria-hidden />
        ) : (
          <Mic className="size-5" aria-hidden />
        )}
      </CallControlButton>
      <CallControlButton
        label="Share camera"
        pressed={props.isCameraOn}
        disabled={props.disabled}
        onClick={props.onToggleCamera}
      >
        {props.isCameraOn ? (
          <Video className="size-5" aria-hidden />
        ) : (
          <VideoOff className="size-5" aria-hidden />
        )}
      </CallControlButton>
      <span className="ms-auto font-medium text-primary text-sm tabular-nums">
        {props.countdown}
      </span>
      {props.canPopOut && (
        <CallControlButton
          label={
            props.isDocked ? 'Pop out video' : 'Bring video back into the chat'
          }
          onClick={props.onTogglePopOut}
        >
          {props.isDocked ? (
            <PictureInPicture2 className="size-5" aria-hidden />
          ) : (
            <Minimize2 className="size-5" aria-hidden />
          )}
        </CallControlButton>
      )}
      <Button
        onClick={props.onEnd}
        className={cn(
          // text-black: white fails AA on red-9 (see red-9 button contrast).
          'inline-flex h-10 items-center gap-2 rounded-full bg-error-9 px-4 font-medium text-black text-sm',
          'transition-colors hover:bg-error-10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2',
        )}
      >
        <PhoneOff className="size-4" aria-hidden />
        End call
      </Button>
    </div>
  );
}
