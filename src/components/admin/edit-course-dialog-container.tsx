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
import { CourseOnboardingContainer } from './course-onboarding-container';
import { CourseVideoIntegrationsContainer } from './course-video-integrations-container';
import { CreateCourseForm } from './create-course-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';
import { LessonSequencingContainer } from './lesson-sequencing-container';
import { ModuleDependenciesContainer } from './module-dependencies-container';
import { NewsSourcesContainer } from './news-sources-container';
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
                form.setValue('imageUrlAvif', next.imageUrlAvif ?? undefined, {
                  shouldDirty: true,
                });
                form.setValue('imageUrlWebp', next.imageUrlWebp ?? undefined, {
                  shouldDirty: true,
                });
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
      ),
    },
    {
      value: 'dependencies',
      title: 'Module dependencies',
      // This tab edits the course's modules, not the course, so it names them
      // rather than inheriting the course-name heading the other tabs use.
      heading: target ? `${target.name} modules` : '',
      content: target && <ModuleDependenciesContainer courseId={target.id} />,
    },
    {
      value: 'lesson-sequencing',
      title: 'Lesson sequencing',
      // Separate from module dependencies on purpose: that tab sequences
      // modules, this one sequences lessons WITHIN a module. Folding them
      // together would put two different graphs on one surface.
      heading: target ? `${target.name} lessons` : '',
      content: target && <LessonSequencingContainer courseId={target.id} />,
    },
    {
      value: 'video',
      title: 'Video providers',
      content: target && (
        <CourseVideoIntegrationsContainer courseId={target.id} />
      ),
    },
    {
      value: 'onboarding',
      title: 'Onboarding',
      content: target && <CourseOnboardingContainer courseId={target.id} />,
    },
    {
      value: 'news-sources',
      title: 'News sources',
      // Names the course's sources rather than the course: this tab's subject
      // is the feed, and sources belong to this course alone.
      heading: target ? `${target.name} news sources` : '',
      content: target && <NewsSourcesContainer courseId={target.id} />,
    },
  ];

  return (
    <SectionedConfigModal
      open={target !== null}
      onOpenChange={onOpenChange}
      title="Edit course"
      heading={target?.name ?? ''}
      sections={sections}
      // Narrower than the 1280px default: this modal's form content is
      // slim, so a wide shell would just leave dead space on the right.
      width="880px"
      sidebarWidth="220px"
    />
  );
};
