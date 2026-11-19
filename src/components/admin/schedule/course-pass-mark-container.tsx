import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useUpdatePassMark } from '#/data-hooks/use-update-pass-mark';
import type { AdminCourseSummary } from '#/lib/admin-schemas';
import { PassMarkSchema } from '#/lib/pass-mark';
import { CoursePassMark } from './course-pass-mark';
import { coursePassMarkOpenAtomFamily } from './course-pass-mark-state';

const formSchema = z.object({
  passMark: z
    .number({ error: 'Enter a number from 0 to 100' })
    .pipe(PassMarkSchema),
});
type FormValues = z.infer<typeof formSchema>;

export const CoursePassMarkContainer = ({
  course,
}: {
  course: AdminCourseSummary;
}) => {
  const [open, setOpen] = useAtom(coursePassMarkOpenAtomFamily(course.id));
  const update = useUpdatePassMark();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { passMark: course.passMark },
    mode: 'onSubmit',
  });
  const { ref, ...inputProps } = form.register('passMark', {
    valueAsNumber: true,
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Always start from the saved value as of this render, never a half-typed
    // or rejected one. Runs on open too, so a refetch that landed while closed
    // is what the editor shows.
    form.reset({ passMark: course.passMark });
    update.reset();
  };

  const onSubmit = form.handleSubmit(({ passMark }) => {
    update.mutate(
      { courseId: course.id, passMark },
      {
        // Not onOpenChange(false): this callback closes over the pre-save
        // `course.passMark` and would reset the form back to the old value.
        onSuccess: () => {
          form.reset({ passMark });
          setOpen(false);
        },
      },
    );
  });

  return (
    <CoursePassMark
      courseId={course.id}
      courseName={course.name}
      passMark={course.passMark}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      inputProps={inputProps}
      inputRef={ref}
      fieldError={form.formState.errors.passMark?.message}
      serverError={update.error?.message}
      isPending={update.isPending}
    />
  );
};
