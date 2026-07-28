import { Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import type { LessonMaterialGeneration } from '#/types';
import { QuizField } from './quiz-field';
import { RichTextEditor } from './rich-text-editor';
import { StringListField } from './string-list-field';

const labelCls = 'font-medium text-secondary text-xs uppercase tracking-wide';

/**
 * Presentational body of the material edit form. Prose fields (text, proTips,
 * assignments) and key points use RichTextEditor via Controller; jobOfTheDay is
 * a plain URL input; quiz + links keep their controls. The container owns
 * useForm and submission.
 */
export const MaterialForm = ({
  register,
  control,
  errors,
  onSubmit,
  isSaving,
  saveError,
}: {
  register: UseFormRegister<LessonMaterialGeneration>;
  control: Control<LessonMaterialGeneration>;
  errors: FieldErrors<LessonMaterialGeneration>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  isSaving: boolean;
  saveError?: string;
}) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Text</span>
        <Controller
          control={control}
          name="text"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Text"
              placeholder="Lesson text…"
            />
          )}
        />
        {errors.text && (
          <p role="alert" className="text-error-text text-sm">
            {errors.text.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Pro tips</span>
        <Controller
          control={control}
          name="proTips"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Pro tips"
              placeholder="Pro tips…"
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Assignments</span>
        <Controller
          control={control}
          name="assignments"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Assignments"
              placeholder="Assignments…"
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-job" className={labelCls}>
          Job of the day (URL)
        </label>
        <input
          id="material-job"
          type="text"
          {...register('jobOfTheDay')}
          className="rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        />
      </div>

      <Controller
        control={control}
        name="keyPoints"
        render={({ field }) => (
          <StringListField
            label="Key points"
            itemNoun="key point"
            value={field.value ?? []}
            onChange={field.onChange}
            renderItem={({ value, onChange, index }) => (
              <RichTextEditor
                value={value}
                onChange={onChange}
                toolbar="bubble"
                ariaLabel={`Key point ${index + 1}`}
                placeholder="Key point…"
              />
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="quiz"
        render={({ field }) => (
          <QuizField value={field.value ?? []} onChange={field.onChange} />
        )}
      />

      <Controller
        control={control}
        name="links"
        render={({ field }) => (
          <StringListField
            label="Links"
            itemNoun="link"
            value={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />

      {saveError && (
        <p role="alert" className="text-error-text text-sm">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-apple-9 px-4 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      >
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Save material
      </button>
    </form>
  );
};
