import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { editCourseAtom } from '@/atoms/admin';
import { useUpdateCourse } from '@/data-hooks/use-update-course';
import {
  type CreateCourseInput,
  updateCourseInputSchema,
} from '@/lib/admin-schemas';
import { CourseVideoIntegrationsContainer } from './course-video-integrations-container';
import { CreateCourseForm } from './create-course-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

export const EditCourseDialogContainer = () => {
  const [target, setTarget] = useAtom(editCourseAtom);
  const updateCourse = useUpdateCourse(target?.id ?? 0);
  const form = useForm<
    z.input<typeof updateCourseInputSchema>,
    unknown,
    CreateCourseInput
  >({
    resolver: zodResolver(updateCourseInputSchema),
    values: {
      name: target?.name ?? '',
      description: target?.description ?? '',
      imageUrlAvif: target?.imageUrlAvif ?? undefined,
      imageUrlWebp: target?.imageUrlWebp ?? undefined,
    },
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      updateCourse.reset();
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (!target) return;
    updateCourse.mutate(data, {
      onSuccess: () => {
        toast.success('Course updated');
        onOpenChange(false);
      },
    });
  });

  const sections: ConfigModalSection[] = [
    {
      value: 'basic',
      title: 'Basic info',
      content: (
        // Constrain the form column so inputs don't stretch across the full
        // 1280px shell.
        <div className="max-w-2xl">
          <CreateCourseForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            registerDescription={form.register('description')}
            imageField={
              <ImageUploadFieldContainer
                pathPrefix="courses"
                value={{
                  imageUrlAvif: form.watch('imageUrlAvif') ?? null,
                  imageUrlWebp: form.watch('imageUrlWebp') ?? null,
                }}
                onChange={(next) => {
                  form.setValue(
                    'imageUrlAvif',
                    next.imageUrlAvif ?? undefined,
                    { shouldDirty: true },
                  );
                  form.setValue(
                    'imageUrlWebp',
                    next.imageUrlWebp ?? undefined,
                    { shouldDirty: true },
                  );
                }}
              />
            }
            errors={{
              name: form.formState.errors.name?.message,
              description: form.formState.errors.description?.message,
            }}
            serverError={
              updateCourse.isError
                ? 'Could not save. Please try again.'
                : undefined
            }
            isPending={updateCourse.isPending}
            onCancel={() => onOpenChange(false)}
            submitLabel="Save changes"
          />
        </div>
      ),
    },
    {
      value: 'video',
      title: 'Video providers',
      content: target && (
        <div className="max-w-2xl">
          <CourseVideoIntegrationsContainer courseId={target.id} />
        </div>
      ),
    },
  ];

  return (
    <SectionedConfigModal
      open={target !== null}
      onOpenChange={onOpenChange}
      title="Edit course"
      heading={target?.name ?? ''}
      sections={sections}
    />
  );
};
