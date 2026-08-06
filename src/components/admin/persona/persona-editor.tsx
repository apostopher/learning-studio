import { ArrowLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { AutoGrowTextarea } from '#/components/admin/auto-grow-textarea';
import { ScrollArea } from '#/components/scroll-area';
import { cn } from '#/lib/cn';

/** What the header says about the autosaved draft. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface PersonaFieldSpec {
  name: string;
  label: string;
  hint: string;
  register: UseFormRegisterReturn;
  /** True while the field is empty, so the prompt default applies instead. */
  usingDefault: boolean;
}

interface PersonaEditorProps {
  registerName: UseFormRegisterReturn;
  nameError?: string;
  fields: PersonaFieldSpec[];
  /**
   * Controlled rather than registered: `useFieldArray` only tracks arrays of
   * objects, and removing an item from a flat string array leaves the
   * uncontrolled input below it showing its old value.
   */
  quotes: string[];
  onQuoteChange: (index: number, value: string) => void;
  onAddQuote: () => void;
  onRemoveQuote: (index: number) => void;
  /** True while quotes are empty, so viper7's built-in quote list applies. */
  quotesUsingDefault: boolean;
  saveStatus: SaveStatus;
  hasDraft: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  /** Flushes the pending autosave and slides back to the list. */
  onBack: () => void;
  isPublishing: boolean;
  isDiscarding: boolean;
  publishError?: string;
  /** Courses that will feel a publish immediately. */
  usedByCourses: string[];
  isOrgDefault: boolean;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
};

/**
 * Editor pane of the persona carousel.
 *
 * Everything typed here autosaves into the persona's *draft*; only Publish
 * moves it into the content a live chat reads. Back leaves the editor with the
 * draft intact — stepping away from half-finished work is legitimate, and the
 * list marks the persona as having unpublished changes.
 */
export const PersonaEditor = ({
  registerName,
  nameError,
  fields,
  quotes,
  onQuoteChange,
  onAddQuote,
  onRemoveQuote,
  quotesUsingDefault,
  saveStatus,
  hasDraft,
  onPublish,
  onDiscard,
  onBack,
  isPublishing,
  isDiscarding,
  publishError,
  usedByCourses,
  isOrgDefault,
}: PersonaEditorProps) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-gray-6 border-b px-6 py-4">
      {/*
        Back sits on the leading edge, where a return affordance is looked for.
        No persona name beside it: the name is an editable field a few rows
        down, and repeating it as a static heading made the header claim the
        row that the return control should own.
      */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        Back
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {/*
          `<output>` carries an implicit `status` role, so autosave results —
          which arrive without the admin doing anything — announce themselves
          rather than waiting to be discovered. It sits with the save actions
          because that is what it reports on.
        */}
        <output
          className={cn(
            'text-xs',
            saveStatus === 'error' ? 'text-error-text' : 'text-secondary',
          )}
          aria-live="polite"
        >
          {saveStatus === 'error'
            ? "Couldn't save — retrying as you type."
            : SAVE_LABEL[saveStatus]}
        </output>
        {hasDraft && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={isDiscarding}
            className="rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
          >
            {isDiscarding ? 'Discarding…' : 'Discard changes'}
          </button>
        )}
        <button
          type="button"
          onClick={onPublish}
          disabled={!hasDraft || isPublishing}
          className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          Publish
        </button>
      </div>
    </div>

    <ScrollArea className="min-h-0 flex-1" viewportClassName="p-6">
      <div className="flex flex-col gap-6">
        {publishError && (
          <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
            {publishError}
          </p>
        )}

        {hasDraft && (
          <p className="rounded-lg border border-warning-muted bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            These edits are saved as a draft. Chats keep using the published
            version until you press Publish
            {usedByCourses.length > 0
              ? `, which takes effect immediately for ${usedByCourses.join(', ')}.`
              : isOrgDefault
                ? ', which takes effect immediately for every course following the organisation default.'
                : '.'}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="persona-name"
            className="font-medium text-primary text-sm"
          >
            Name
          </label>
          <input
            {...registerName}
            id="persona-name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'persona-name-error' : undefined}
            className="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          />
          <p className="text-secondary text-xs">
            A label for this list — viper7 never reads it. Saved as soon as you
            leave the field.
          </p>
          {nameError && (
            <p id="persona-name-error" className="text-error-text text-sm">
              {nameError}
            </p>
          )}
        </div>

        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={`persona-${field.name}`}
              className="flex flex-wrap items-center gap-2 font-medium text-primary text-sm"
            >
              {field.label}
              {/*
                An empty field isn't broken — the prompt falls back to its
                built-in text for that section. Saying so stops an author
                filling every box just to be safe.
              */}
              {field.usingDefault && (
                <span className="rounded-full bg-gray-3 px-2 py-0.5 font-normal text-secondary text-xs">
                  Using built-in default
                </span>
              )}
            </label>
            <p className="text-secondary text-xs">{field.hint}</p>
            <AutoGrowTextarea
              {...field.register}
              id={`persona-${field.name}`}
              className="min-h-24 text-sm"
            />
          </div>
        ))}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 font-medium text-primary text-sm">
              Quotes
              {quotesUsingDefault && (
                <span className="rounded-full bg-gray-3 px-2 py-0.5 font-normal text-secondary text-xs">
                  Using built-in default
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onAddQuote}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-6 px-2.5 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add quote
            </button>
          </div>
          <p className="text-secondary text-xs">
            Leave empty to keep viper7's built-in aviation quotes. Adding any
            quote replaces that list entirely.
          </p>
          <ul className="flex flex-col gap-2">
            {quotes.map((quote, index) => (
              // Index keys are safe here: quotes are only appended and
              // removed, never reordered, and each input is controlled so a
              // removal re-renders the row below with the correct value.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={index} className="flex items-start gap-2">
                <AutoGrowTextarea
                  value={quote}
                  onChange={(event) => onQuoteChange(index, event.target.value)}
                  aria-label={`Quote ${index + 1}`}
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={() => onRemoveQuote(index)}
                  aria-label={`Remove quote ${index + 1}`}
                  className="mt-1 shrink-0 rounded-md p-2 text-secondary transition-colors hover:bg-error-subtle hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ScrollArea>
  </div>
);
