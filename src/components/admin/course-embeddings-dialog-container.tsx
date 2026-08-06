import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  editingPersonaIdAtom,
  embeddingsSearchAtom,
  newPersonaNameAtom,
  pendingDeletePersonaIdAtom,
  personaPaneAtom,
  trainCourseAtom,
} from '#/atoms/admin';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';
import { useCourseEmbeddings } from '#/data-hooks/use-course-embeddings';
import { useDeleteEmbedding } from '#/data-hooks/use-delete-embedding';
import { useUploadTrainingDoc } from '#/data-hooks/use-upload-training-doc';
import { PersonaSectionContainer } from './persona/persona-section-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';
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

/**
 * Container: AI-training modal for a course.
 *
 * Two sections behind the shared sidebar shell — training documents (course-
 * scoped embeddings) and persona (org-scoped, but selected per course). The
 * persona section is `fill`, because its carousel manages its own height and
 * scrolling rather than flowing down the shell's scroll area.
 */
export const CourseEmbeddingsDialogContainer = () => {
  const [course, setCourse] = useAtom(trainCourseAtom);
  const setSearch = useSetAtom(embeddingsSearchAtom);
  const setPane = useSetAtom(personaPaneAtom);
  const setEditingPersonaId = useSetAtom(editingPersonaIdAtom);
  const setPendingDelete = useSetAtom(pendingDeletePersonaIdAtom);
  const setNewPersonaName = useSetAtom(newPersonaNameAtom);

  const sections: ConfigModalSection[] = course
    ? [
        {
          value: 'documents',
          title: 'Training documents',
          content: <Body courseId={course.id} />,
        },
        {
          value: 'persona',
          title: 'Persona',
          fill: true,
          content: (
            <PersonaSectionContainer
              courseId={course.id}
              courseName={course.name}
            />
          ),
        },
      ]
    : [];

  return (
    <SectionedConfigModal
      open={course !== null}
      onOpenChange={(next) => {
        if (!next) {
          setCourse(null);
          setSearch('');
          // Reset the persona section so reopening starts on the list rather
          // than mid-edit on a persona from the previous course's visit.
          setPane('list');
          setEditingPersonaId(null);
          setPendingDelete(null);
          setNewPersonaName('');
        }
      }}
      title="AI training"
      heading={course?.name ?? ''}
      sections={sections}
    />
  );
};

/** Data-bound body; mounts only while the modal is open. */
const Body = ({ courseId }: { courseId: number }) => {
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
    // No course line here any more: the sidebar shell renders the course name
    // as this panel's heading.
    <>
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
