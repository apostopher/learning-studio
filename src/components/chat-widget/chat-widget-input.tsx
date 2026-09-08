import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Send } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AutoGrowTextarea } from '#/components/admin/auto-grow-textarea';
import { ChatWidgetMicButton } from '#/components/chat-widget/chat-widget-mic-button';
import { useAudioRecorder } from '#/components/chat-widget/use-audio-recorder';
import {
  type CancelReason,
  usePushToTalk,
} from '#/components/chat-widget/use-push-to-talk';
import { cn } from '#/lib/cn';

const formSchema = z.object({
  input: z.string().min(1),
});

type FormData = z.infer<typeof formSchema>;

interface ChatWidgetInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

/**
 * Container: owns the message-composer form (react-hook-form + zod
 * resolver), `useAudioRecorder` (mic capture + transcription) and
 * `usePushToTalk` (the mic's press-and-hold gesture). A finished transcript
 * is sent the same way a typed message is; recorder errors surface as
 * `sonner` toasts. Not render-tested (calls hooks directly — see
 * component-render-test-constraints); exercised by the Task 12 app smoke.
 */
export function ChatWidgetInput({ onSend, isLoading }: ChatWidgetInputProps) {
  const form = useForm<FormData>({
    defaultValues: { input: '' },
    resolver: zodResolver(formSchema),
  });

  const recorder = useAudioRecorder({
    // Announced from the callback rather than from an effect watching an
    // `error` field: a toast is a response to something happening, which is
    // the event-handler case in docs/use-effect-rules.md. It also fixes a
    // silent second failure — as state, two identical errors in a row never
    // changed the value, so the effect never re-ran.
    onError: (error) => {
      if (error === 'permission-denied') {
        toast.error(
          'Microphone access blocked. Allow access in your browser settings.',
        );
      } else if (error === 'no-microphone') {
        toast.error('No microphone detected.');
      } else if (error === 'transcription-failed') {
        toast.error('Transcription failed. Try again.');
      } else if (error === 'too-long') {
        toast.error('Recording capped at 90 seconds.');
      } else {
        toast.error('Voice input failed. Please try again.');
      }
    },
  });
  const reducedMotion = useReducedMotion() ?? false;

  /**
   * A finished transcript is sent exactly like a typed message.
   *
   * This one stays an effect deliberately. The mic is not disabled while a
   * reply streams, so a transcript can land mid-reply — and the condition it
   * waits for (`isLoading` going false) is not an event the recorder can fire.
   * Moving the send into an `onTranscript` callback would have to drop those
   * transcripts on the floor instead of holding them until the reply finishes.
   *
   * NOTE: typed messages are DROPPED in that same window (see `onSubmit`)
   * while spoken ones are deferred. That inconsistency predates this comment
   * and is a product decision, not a refactor.
   */
  useEffect(() => {
    if (!recorder.final || isLoading) return;
    const text = recorder.final.trim();
    recorder.reset();
    if (text) onSend(text);
  }, [recorder.final, isLoading, onSend, recorder.reset]);

  const onSubmit = (data: FormData) => {
    // Guard here too (not just the disabled button) so Enter can't send while a
    // reply is streaming or the mic is busy.
    if (isLoading || recorder.isRecording || recorder.isTranscribing) return;
    if (data.input.trim()) {
      onSend(data.input);
      form.reset();
      recorder.reset();
    }
  };

  const ptt = usePushToTalk({
    disabled: !recorder.isSupported || recorder.isTranscribing,
    onHoldStart: () => void recorder.start(),
    onHoldEnd: () => recorder.stop(),
    onCancel: (reason: CancelReason) => {
      recorder.cancel();
      if (reason === 'short-press') toast('Hold the mic to talk');
    },
  });

  // The textarea can wrap to multiple lines, so Enter has to be handled
  // explicitly to submit (Shift+Enter still inserts a newline).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void form.handleSubmit(onSubmit)();
    }
  };

  const placeholder = recorder.isTranscribing
    ? 'Transcribing…'
    : recorder.isRecording
      ? 'Recording… release to send'
      : 'Type or hold the mic to talk';

  const inputBusy = recorder.isRecording || recorder.isTranscribing;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex items-end gap-2 border-gray-6 border-t p-3"
    >
      <Controller
        name="input"
        control={form.control}
        render={({ field }) => (
          <AutoGrowTextarea
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            readOnly={inputBusy}
            aria-label="Chat message"
            className="max-h-32"
          />
        )}
      />
      <ChatWidgetMicButton
        isRecording={recorder.isRecording}
        isTranscribing={recorder.isTranscribing}
        isSupported={recorder.isSupported}
        reducedMotion={reducedMotion}
        bindings={ptt.bindings}
      />
      <button
        type="submit"
        disabled={isLoading || inputBusy}
        aria-label="Send message"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          'bg-accent-9 text-accent-contrast transition-colors duration-200',
          'hover:bg-accent-10',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
