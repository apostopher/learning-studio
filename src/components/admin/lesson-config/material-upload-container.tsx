import { useAtomValue } from 'jotai';
import { lessonMaterialFillAtomFamily } from '#/atoms/admin';
import { useParseLessonMaterial } from '#/data-hooks/use-parse-lesson-material';
import { MaterialUpload } from './material-upload';

/**
 * The Word-doc fill, under the video preview. Parses the file and hands the
 * result to the material form below, through the fill it publishes.
 */
export const MaterialUploadContainer = ({ lessonId }: { lessonId: number }) => {
  const parse = useParseLessonMaterial(lessonId);
  const target = useAtomValue(lessonMaterialFillAtomFamily(lessonId));
  return (
    <MaterialUpload
      isPending={parse.isPending}
      error={parse.error?.message}
      onFileSelected={(file) =>
        parse.mutate(file, { onSuccess: (parsed) => target?.fill(parsed) })
      }
    />
  );
};
