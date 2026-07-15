import { toast } from 'sonner';
import { useUploadCourseImage } from '@/data-hooks/use-upload-course-image';
import { CourseImageField } from './course-image-field';

export interface CourseImageValue {
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
}

/** Owns the optimize + upload mutation; reports the resulting URLs via onChange. */
export const CourseImageFieldContainer = ({
  value,
  onChange,
}: {
  value: CourseImageValue;
  onChange: (next: CourseImageValue) => void;
}) => {
  const uploadImage = useUploadCourseImage();

  return (
    <CourseImageField
      previewUrl={value.imageUrlWebp}
      status={
        uploadImage.isPending ? 'busy' : uploadImage.isError ? 'error' : 'idle'
      }
      errorMessage={
        uploadImage.isError
          ? 'Could not optimize or upload the image. Please try again.'
          : undefined
      }
      onSelectFile={(file) =>
        uploadImage.mutate(file, {
          onSuccess: (urls) => onChange(urls),
          onError: () => toast.error('Image upload failed'),
        })
      }
      onRemove={() => {
        uploadImage.reset();
        onChange({ imageUrlAvif: null, imageUrlWebp: null });
      }}
    />
  );
};
