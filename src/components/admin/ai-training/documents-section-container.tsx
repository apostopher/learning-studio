import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  aiTrainingSearchAtom,
  aiTrainingSourceFilterAtom,
  aiTrainingUploadSourceAtom,
} from '#/atoms/admin';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';
import { useCourseEmbeddings } from '#/data-hooks/use-course-embeddings';
import { useDeleteEmbedding } from '#/data-hooks/use-delete-embedding';
import { useUploadTrainingDoc } from '#/data-hooks/use-upload-training-doc';
import { TrainingDocUploadCard } from '../training-doc-upload-card';
import { TrainingDocsList } from '../training-docs-list';
import {
  deriveUploadStatus,
  resolveDocName,
  type TrainingUploadForm,
  trainingUploadSchema,
} from '../training-upload-helpers';

/**
 * The AI Training tab's Documents section: the shared training documents,
 * which belong to no course (`courseId: null`).
 *
 * The same flow as the course dialog's documents panel — upload to Blob, then
 * ingest — with two additions that course scoping made unnecessary there: the
 * admin says which training set (ITPS / 3D Airmanship) each upload belongs to,
 * and the list can be narrowed to one set.
 */
export const DocumentsSectionContainer = () => {
  const [search, setSearch] = useAtom(aiTrainingSearchAtom);
  const [sourceFilter, setSourceFilter] = useAtom(aiTrainingSourceFilterAtom);
  const [uploadSource, setUploadSource] = useAtom(aiTrainingUploadSourceAtom);
  const embeddings = useCourseEmbeddings(null);
  const uploadDoc = useUploadTrainingDoc();
  const addEmbeddings = useAddEmbeddings(null);
  const deleteEmbedding = useDeleteEmbedding(null);

  const form = useForm<TrainingUploadForm>({
    resolver: zodResolver(trainingUploadSchema),
    mode: 'onSubmit',
    defaultValues: { docName: '' },
  });
  const file = form.watch('file') as File | undefined;
  const status = deriveUploadStatus(
    uploadDoc.isPending,
    addEmbeddings.isPending,
  );

  const submit = form.handleSubmit(async (values) => {
    // The card's button is disabled without a source; this guards a submit
    // that reaches here some other way rather than filing it under a guess.
    if (uploadSource === null) return;
    try {
      const uploaded = await uploadDoc.mutateAsync(values.file);
      await addEmbeddings.mutateAsync({
        url: uploaded.url,
        fileName: resolveDocName(values.docName, uploaded.fileName),
        mimeType: uploaded.mimeType,
        source: uploadSource,
      });
      toast.success('Training document added');
      form.reset({ docName: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  });

  const fileError =
    form.formState.errors.file?.message ??
    (uploadDoc.error || addEmbeddings.error
      ? 'Upload failed. Please try again.'
      : null);

  return (
    <div className="flex flex-col gap-6">
      <TrainingDocUploadCard
        fileName={file?.name ?? null}
        onPickFile={(f) => form.setValue('file', f, { shouldValidate: true })}
        docName={form.watch('docName') ?? ''}
        onDocNameChange={(v) => form.setValue('docName', v)}
        onSubmit={submit}
        status={status}
        error={fileError}
        source={{ value: uploadSource, onChange: setUploadSource }}
      />
      <TrainingDocsList
        docs={embeddings.data ?? []}
        search={search}
        onSearchChange={setSearch}
        sourceFilter={{ value: sourceFilter, onChange: setSourceFilter }}
        onDelete={(sourcePath) =>
          deleteEmbedding.mutate(
            { sourcePath },
            {
              onError: () =>
                toast.error(`Couldn't delete ${sourcePath}. Please try again.`),
            },
          )
        }
        deletingSourcePath={
          deleteEmbedding.isPending
            ? (deleteEmbedding.variables?.sourcePath ?? null)
            : null
        }
        isLoading={embeddings.isLoading}
        error={embeddings.isError ? "Couldn't load training documents." : null}
        onRetry={() => void embeddings.refetch()}
        emptyMessage="No training documents yet. Upload a PDF or Word file above."
      />
    </div>
  );
};
