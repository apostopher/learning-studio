import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { newsSourcePanelAtom } from '@/atoms/admin';
import { NewsSourceFieldError } from '@/data-hooks/news-source-request';
import { useCourseNewsSources } from '@/data-hooks/use-course-news-sources';
import {
  useCreateNewsSource,
  useDeleteNewsSource,
  useReorderNewsSource,
  useUpdateNewsSource,
} from '@/data-hooks/use-news-source-mutations';
import {
  type CreateNewsSourceInput,
  createNewsSourceInputSchema,
  type NewsSource,
} from '@/lib/admin-schemas';
import { ImageUploadFieldContainer } from './image-upload-field-container';
import { NewsSourceDeleteConfirm } from './news-source-delete-confirm';
import { NewsSourceForm } from './news-source-form';
import { NewsSourcesEditor } from './news-sources-editor';

type FormInput = z.input<typeof createNewsSourceInputSchema>;

const EMPTY_FORM: FormInput = {
  name: '',
  url: '',
  imageUrlAvif: undefined,
  imageUrlWebp: undefined,
  tintColor: '',
};

/**
 * News sources tab of the course modal.
 *
 * Sources are sandboxed per course, so everything here is scoped to `courseId`
 * and deleting is safe by construction — no other course can reference the row.
 * The panel swaps between the list, the create/edit form and a delete
 * confirmation rather than stacking a dialog inside the modal already open.
 */
export const NewsSourcesContainer = ({ courseId }: { courseId: number }) => {
  const { data: sources, isLoading, error } = useCourseNewsSources(courseId);
  const [panelState, setPanelState] = useAtom(newsSourcePanelAtom);
  const createSource = useCreateNewsSource(courseId);
  const updateSource = useUpdateNewsSource(courseId);
  const deleteSource = useDeleteNewsSource(courseId);
  const reorderSource = useReorderNewsSource(courseId);

  // A value left over from another course is stale — fall back to the list.
  const panel = panelState?.courseId === courseId ? panelState : null;
  const target =
    panel?.sourceId === undefined
      ? null
      : (sources?.find((s) => s.id === panel.sourceId) ?? null);

  const form = useForm<FormInput, unknown, CreateNewsSourceInput>({
    resolver: zodResolver(createNewsSourceInputSchema),
    values:
      panel?.mode === 'edit' && target
        ? {
            name: target.name,
            url: target.url,
            imageUrlAvif: target.imageUrlAvif ?? undefined,
            imageUrlWebp: target.imageUrlWebp ?? undefined,
            tintColor: target.tintColor ?? '',
          }
        : EMPTY_FORM,
    mode: 'onSubmit',
  });

  const closePanel = () => {
    setPanelState(null);
    createSource.reset();
    updateSource.reset();
    deleteSource.reset();
  };

  /** A duplicate URL belongs on the URL input, not in a toast. */
  const handleWriteError = (mutationError: unknown) => {
    if (mutationError instanceof NewsSourceFieldError) {
      form.setError(mutationError.field as keyof FormInput, {
        message: mutationError.message,
      });
      return;
    }
    toast.error('Could not save the news source. Please try again.');
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (panel?.mode === 'edit') {
      if (!target) return;
      updateSource.mutate(
        { sourceId: target.id, input: data },
        {
          onSuccess: () => {
            toast.success('News source updated');
            closePanel();
          },
          onError: handleWriteError,
        },
      );
      return;
    }
    createSource.mutate(data, {
      onSuccess: () => {
        toast.success('News source added');
        closePanel();
      },
      onError: handleWriteError,
    });
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sources) return;
    const oldIndex = sources.findIndex((s) => s.id === active.id);
    const newIndex = sources.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove([...sources], oldIndex, newIndex);
    // Neighbours are read from the POST-move array, so they are the sources the
    // dragged row actually landed between.
    const prev = next[newIndex - 1] ?? null;
    const following = next[newIndex + 1] ?? null;
    reorderSource.mutate(
      {
        sourceId: Number(active.id),
        prevSourceId: prev?.id ?? null,
        nextSourceId: following?.id ?? null,
        optimistic: next,
      },
      {
        onError: () => toast.error('Could not reorder. The list was restored.'),
      },
    );
  };

  const handleActiveChange = (source: NewsSource, active: boolean) => {
    updateSource.mutate(
      {
        sourceId: source.id,
        input: {
          name: source.name,
          url: source.url,
          imageUrlAvif: source.imageUrlAvif ?? undefined,
          imageUrlWebp: source.imageUrlWebp ?? undefined,
          tintColor: source.tintColor ?? undefined,
          active,
        },
      },
      {
        onError: () =>
          toast.error(
            active
              ? 'Could not show this source.'
              : 'Could not hide this source.',
          ),
      },
    );
  };

  if (isLoading) {
    return <p className="text-secondary text-sm">Loading news sources…</p>;
  }
  if (error) {
    return (
      <p className="text-error-text text-sm">
        Failed to load this course&rsquo;s news sources.
      </p>
    );
  }

  if (panel?.mode === 'delete' && target) {
    return (
      <NewsSourceDeleteConfirm
        sourceName={target.name}
        isPending={deleteSource.isPending}
        onConfirm={() =>
          deleteSource.mutate(target.id, {
            onSuccess: () => {
              toast.success('News source deleted');
              closePanel();
            },
            onError: () => toast.error('Could not delete the news source.'),
          })
        }
        onCancel={closePanel}
      />
    );
  }

  // `edit`/`delete` additionally require the row to still exist. If it was
  // removed under us — another admin, or a refetch that dropped it — these
  // guards fall through to the list rather than rendering a form bound to
  // nothing or a confirmation naming a source that is already gone.
  if (panel?.mode === 'create' || (panel?.mode === 'edit' && target)) {
    const isEdit = panel.mode === 'edit';
    return (
      <NewsSourceForm
        onSubmit={handleSubmit}
        registerName={form.register('name')}
        registerUrl={form.register('url')}
        registerTintColor={form.register('tintColor')}
        tintColor={(form.watch('tintColor') as string) || 'transparent'}
        imageField={
          <ImageUploadFieldContainer
            pathPrefix="news-sources"
            aspect={1}
            fit="contain"
            subjectLabel="logo"
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
        nameError={form.formState.errors.name?.message}
        urlError={form.formState.errors.url?.message}
        tintColorError={form.formState.errors.tintColor?.message}
        isPending={isEdit ? updateSource.isPending : createSource.isPending}
        submitLabel={isEdit ? 'Save changes' : 'Add news source'}
        onCancel={closePanel}
      />
    );
  }

  return (
    <NewsSourcesEditor
      sources={sources ?? []}
      onAdd={() => setPanelState({ courseId, mode: 'create' })}
      onEdit={(source) =>
        setPanelState({ courseId, mode: 'edit', sourceId: source.id })
      }
      onDelete={(source) =>
        setPanelState({ courseId, mode: 'delete', sourceId: source.id })
      }
      onActiveChange={handleActiveChange}
      onDragEnd={handleDragEnd}
    />
  );
};
