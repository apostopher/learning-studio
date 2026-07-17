import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { LessonMaterialGeneration } from '#/types';

const labelCls = 'font-medium text-gray-11 text-xs uppercase tracking-wide';
const controlCls =
  'rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';

/** Scalar HTML/text fields of the material form, registered with RHF. */
export const MaterialTextFields = ({
  register,
  errors,
}: {
  register: UseFormRegister<LessonMaterialGeneration>;
  errors: FieldErrors<LessonMaterialGeneration>;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-text" className={labelCls}>
          Text (HTML)
        </label>
        <textarea
          id="material-text"
          rows={8}
          {...register('text')}
          className={controlCls}
        />
        {errors.text && (
          <p role="alert" className="text-red-11 text-sm">
            {errors.text.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-protips" className={labelCls}>
          Pro tips (HTML)
        </label>
        <textarea
          id="material-protips"
          rows={4}
          {...register('proTips')}
          className={controlCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-assignments" className={labelCls}>
          Assignments (HTML)
        </label>
        <textarea
          id="material-assignments"
          rows={4}
          {...register('assignments')}
          className={controlCls}
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
          className={controlCls}
        />
      </div>
    </div>
  );
};
