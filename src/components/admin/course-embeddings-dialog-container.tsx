import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { embeddingsSearchAtom, trainCourseAtom } from '#/atoms/admin';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';
import { useCourseEmbeddings } from '#/data-hooks/use-course-embeddings';
import { useDeleteEmbedding } from '#/data-hooks/use-delete-embedding';
import { useUploadTrainingDoc } from '#/data-hooks/use-upload-training-doc';
import { CourseEmbeddingsModal } from './course-embeddings-modal';
import { TrainingDocUploadCard } from './training-doc-upload-card';
import { TrainingDocsList } from './training-docs-list';
import { deriveUploadStatus, resolveDocName } from './training-upload-helpers';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const uploadSchema = z.object({
  docName: z.string().optional(),
  file: z
    .instanceof(File, { message: 'Choose a PDF or Word document' })
    .refine(
      (f) =>
        f.type === 'application/pdf' ||
        f.type === DOCX ||
        /\.(pdf|docx)$/i.test(f.name),
      'Only PDF or Word (.docx) files are supported',
    ),
});
type UploadForm = z.infer<typeof uploadSchema>;

/** Container: AI-training modal for a course — upload docs + manage embeddings. */
export const CourseEmbeddingsDialogContainer = () => {
  const [course, setCourse] = useAtom(trainCourseAtom);
  const setSearch = useSetAtom(embeddingsSearchAtom);
  return (
    <CourseEmbeddingsModal
      open={course !== null}
      onOpenChange={(next) => {
        if (!next) {
          setCourse(null);
          setSearch('');
        }
      }}
      title="AI training"
    >
      {course ? <Body courseId={course.id} courseName={course.name} /> : null}
    </CourseEmbeddingsModal>
  );
};

/** Data-bound body; mounts only while the modal is open. */
const Body = ({
  courseId,
  courseName,
}: {
  courseId: number;
  courseName: string;
}) => {
  const [search, setSearch] = useAtom(embeddingsSearchAtom);
  const embeddings = useCourseEmbeddings(courseId);
  const uploadDoc = useUploadTrainingDoc();
  const addEmbeddings = useAddEmbeddings(courseId);
  const deleteEmbedding = useDeleteEmbedding(courseId);

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    mode: 'onSubmit',
    defaultValues: { docName: '' },
  });
  const file = form.watch('file') as File | undefined;
  const status = deriveUploadStatus(
    uploadDoc.isPending,
    addEmbeddings.isPending,
  );

  const submit = form.handleSubmit(async (values) => {
    try {
      const uploaded = await uploadDoc.mutateAsync(values.file);
      await addEmbeddings.mutateAsync({
        url: uploaded.url,
        fileName: resolveDocName(values.docName, uploaded.fileName),
        mimeType: uploaded.mimeType,
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
    <>
      <p className="mb-4 text-gray-11 text-sm">
        Course: <span className="font-medium text-gray-12">{courseName}</span>
      </p>
      <TrainingDocUploadCard
        fileName={file?.name ?? null}
        onPickFile={(f) => form.setValue('file', f, { shouldValidate: true })}
        docName={form.watch('docName') ?? ''}
        onDocNameChange={(v) => form.setValue('docName', v)}
        onSubmit={submit}
        status={status}
        error={fileError}
      />
      <TrainingDocsList
        docs={embeddings.data ?? []}
        search={search}
        onSearchChange={setSearch}
        onDelete={(sourcePath) => deleteEmbedding.mutate({ sourcePath })}
        deletingSourcePath={
          deleteEmbedding.isPending
            ? (deleteEmbedding.variables?.sourcePath ?? null)
            : null
        }
        isLoading={embeddings.isLoading}
      />
    </>
  );
};
