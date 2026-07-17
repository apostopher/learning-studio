import { Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import type { LessonMaterialGeneration } from '#/types';
import { MaterialTextFields } from './material-text-fields';
import { QuizField } from './quiz-field';
import { StringListField } from './string-list-field';

/**
 * Presentational body of the material edit form. Array fields (keyPoints,
 * links, quiz) go through Controller so the field components stay pure; scalar
 * fields use `register`. The container owns useForm and submission.
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
      <MaterialTextFields register={register} errors={errors} />

      <Controller
        control={control}
        name="keyPoints"
        render={({ field }) => (
          <StringListField
            label="Key points"
            itemNoun="key point"
            value={field.value ?? []}
            onChange={field.onChange}
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
        <p role="alert" className="text-red-11 text-sm">
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
