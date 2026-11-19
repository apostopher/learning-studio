import { Combobox } from '@base-ui/react/combobox';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, RotateCcw, Send, Square } from 'lucide-react';
import type {
  FormEventHandler,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { ChatMessage } from '#/components/chat-widget/chat-message';
import { TypingDots } from '#/components/chat-widget/typing-dots';
import { ScrollArea } from '#/components/scroll-area';
import { cn } from '#/lib/cn';

export interface PreviewLessonOption {
  slug: string;
  name: string;
}

export interface PreviewPersonaOption {
  id: number;
  name: string;
  isOrgDefault: boolean;
}

/** One rendered row of the transcript, already flattened by the container. */
export type PreviewChatItem =
  | { key: string; kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { key: string; kind: 'notification'; text: string };

/**
 * A picker's data state. `disabledReason` is non-null whenever the picker
 * cannot be used yet; it is shown and becomes part of the control's name.
 */
export interface PickerState {
  disabledReason: string | null;
  /** A load failure to show, with a retry. */
  error: string | null;
  onRetry: () => void;
}

interface PreviewChatProps {
  lessons: PreviewLessonOption[];
  lessonSlug: string | null;
  onLessonChange: (slug: string | null) => void;
  lessonPicker: PickerState;

  personas: PreviewPersonaOption[];
  personaId: number | null;
  onPersonaChange: (id: number) => void;
  personaPicker: PickerState;
  /** Which version of the persona is under test, or null with no persona. */
  personaVersion: 'draft' | 'published' | null;

  items: PreviewChatItem[];
  showTyping: boolean;
  isReplying: boolean;
  /** The last request's failure, as a sentence. */
  error: string | null;
  onNewChat: () => void;
  onStop: () => void;

  /** Why the composer cannot be used, or null when it can. */
  composerDisabledReason: string | null;
  inputProps: UseFormRegisterReturn;
  onInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;

  /** Stick-to-bottom refs for the transcript. */
  scrollRef?: Ref<HTMLDivElement>;
  contentRef?: Ref<HTMLDivElement>;
}

const fieldLabel = 'block font-medium text-secondary text-sm';
const control =
  'flex w-full items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';
// Locked without opacity: a faded label drops under AA. Secondary text on
// gray-2 is a measured AA pair, so the control stays legible while off.
const controlDisabled =
  'data-[disabled]:cursor-not-allowed data-[disabled]:bg-gray-2 data-[disabled]:text-secondary';

const PickerNote = ({ state }: { state: PickerState }): ReactNode =>
  state.error ? (
    <p
      role="alert"
      className="mbs-1 flex items-center gap-2 text-error-text text-xs"
    >
      {state.error}
      <button
        type="button"
        onClick={state.onRetry}
        className="rounded font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        Retry
      </button>
    </p>
  ) : state.disabledReason ? (
    <p className="mbs-1 text-secondary text-xs">{state.disabledReason}</p>
  ) : null;

/**
 * The AI Training tab's Chat section: pick a lesson and a persona, then talk
 * to Viper as a learner on that lesson would. Nothing here is saved.
 *
 * Hookless. The container owns `useChat`, the composer form, the atoms and
 * the queries; this only lays them out.
 */
export const PreviewChat = ({
  lessons,
  lessonSlug,
  onLessonChange,
  lessonPicker,
  personas,
  personaId,
  onPersonaChange,
  personaPicker,
  personaVersion,
  items,
  showTyping,
  isReplying,
  error,
  onNewChat,
  onStop,
  composerDisabledReason,
  inputProps,
  onInputKeyDown,
  onSubmit,
  scrollRef,
  contentRef,
}: PreviewChatProps) => {
  const lessonNames = new Map(lessons.map((l) => [l.slug, l.name]));
  const personaNames = new Map(personas.map((p) => [p.id, p.name]));

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg text-primary">Chat with Viper</h2>
        <p className="text-secondary text-sm">
          Ask what a learner on this lesson would ask. Search is limited to the
          lesson and the shared documents. Nothing here is saved.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Combobox.Root
            items={lessons.map((l) => l.slug)}
            value={lessonSlug}
            onValueChange={(next) => onLessonChange(next as string | null)}
            itemToStringLabel={(slug: string) => lessonNames.get(slug) ?? slug}
            disabled={lessonPicker.disabledReason !== null}
          >
            <Combobox.Label className={fieldLabel}>Lesson</Combobox.Label>
            <Combobox.Input
              placeholder="Search lessons"
              // Set directly: Base UI's Combobox.Label is not wired to the
              // input outside a Field, so it would leave the input unnamed.
              aria-label={
                lessonPicker.disabledReason
                  ? `Lesson: ${lessonPicker.disabledReason}`
                  : 'Lesson'
              }
              className={cn(
                'mbs-2 placeholder:text-tertiary disabled:cursor-not-allowed disabled:bg-gray-2 disabled:text-secondary',
                control,
              )}
            />
            <Combobox.Portal>
              <Combobox.Positioner sideOffset={4} className="z-50">
                <Combobox.Popup className="w-[var(--anchor-width)] rounded-md border border-gray-6 bg-gray-2 py-1 shadow-lg">
                  <Combobox.Empty className="px-3 py-2 text-secondary text-sm">
                    No matching lessons
                  </Combobox.Empty>
                  <ScrollArea className="max-h-64">
                    <Combobox.List>
                      {(slug: string) => (
                        <Combobox.Item
                          key={slug}
                          value={slug}
                          className="flex cursor-default items-center gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
                        >
                          <span className="flex-1">
                            {lessonNames.get(slug) ?? slug}
                          </span>
                          <Combobox.ItemIndicator>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </Combobox.ItemIndicator>
                        </Combobox.Item>
                      )}
                    </Combobox.List>
                  </ScrollArea>
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
          <PickerNote state={lessonPicker} />
        </div>

        <div>
          <Select.Root
            value={personaId}
            onValueChange={(next) => {
              if (typeof next === 'number') onPersonaChange(next);
            }}
            disabled={personaPicker.disabledReason !== null}
          >
            <Select.Label className={fieldLabel}>Persona</Select.Label>
            <Select.Trigger
              aria-label={
                personaPicker.disabledReason
                  ? `Persona: ${personaPicker.disabledReason}`
                  : undefined
              }
              className={cn('mbs-2 justify-between', control, controlDisabled)}
            >
              <Select.Value>
                {(id: number | null) =>
                  id === null
                    ? 'No persona'
                    : (personaNames.get(id) ?? 'Unknown persona')
                }
              </Select.Value>
              <Select.Icon>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4} className="z-50">
                <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                  {personas.map((persona) => (
                    <Select.Item
                      key={persona.id}
                      value={persona.id}
                      className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                    >
                      <Select.ItemText>{persona.name}</Select.ItemText>
                      {persona.isOrgDefault ? (
                        <span className="ms-2 text-secondary text-xs">
                          Org default
                        </span>
                      ) : null}
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
          <PickerNote state={personaPicker} />
          {personaVersion ? (
            <p className="mbs-1 text-secondary text-xs">
              <span className="font-medium text-primary">
                {personaVersion === 'draft'
                  ? 'Testing draft'
                  : 'Testing published'}
              </span>
              {personaVersion === 'draft'
                ? ' (unpublished edits, not yet live for learners)'
                : ' (what learners get today)'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-80 flex-col overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
        <div className="flex items-center justify-between border-gray-6 border-be px-3 py-2">
          <span className="text-secondary text-xs">
            {items.length === 0 ? 'No messages yet' : 'Preview conversation'}
          </span>
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary text-sm transition-colors hover:bg-gray-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            New chat
          </button>
        </div>

        <ScrollArea
          viewportRef={scrollRef}
          className="max-h-[60vh] min-h-64 flex-1"
          viewportClassName="px-3 py-3"
        >
          <div ref={contentRef} className="flex flex-col gap-3">
            {items.map((item) =>
              item.kind === 'text' ? (
                <ChatMessage key={item.key} text={item.text} role={item.role} />
              ) : (
                <p
                  key={item.key}
                  className="px-1 text-secondary text-xs italic"
                >
                  {item.text}
                </p>
              ),
            )}
            {showTyping ? <TypingDots /> : null}
          </div>
        </ScrollArea>

        {error ? (
          <p
            role="alert"
            className="border-gray-6 border-bs bg-error-3 px-3 py-2 text-error-text text-sm"
          >
            {error}
          </p>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 border-gray-6 border-bs p-3"
        >
          <textarea
            {...inputProps}
            rows={2}
            disabled={composerDisabledReason !== null}
            aria-label={composerDisabledReason ?? 'Message'}
            placeholder={
              composerDisabledReason ?? 'Ask Viper about this lesson'
            }
            onKeyDown={onInputKeyDown}
            className="min-h-10 flex-1 resize-none rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-base text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:bg-gray-2 sm:text-sm"
          />
          {isReplying ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-3 px-4 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={composerDisabledReason !== null}
              aria-label={composerDisabledReason ?? 'Send'}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-apple-9 px-4 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-3 disabled:text-secondary"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send
            </button>
          )}
        </form>
      </div>
    </section>
  );
};
