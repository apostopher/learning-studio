import { toast } from 'sonner';
import { useUploadImage } from '@/data-hooks/use-upload-image';
import { ImageUploadField } from './image-upload-field';

export interface ImageValue {
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
}

/**
 * Owns the optimize + upload mutation for a cover image and reports the
 * resulting URLs via onChange. `pathPrefix` namespaces the blob storage path.
 */
export const ImageUploadFieldContainer = ({
  pathPrefix,
  value,
  onChange,
}: {
  pathPrefix: string;
  value: ImageValue;
  onChange: (next: ImageValue) => void;
}) => {
  const uploadImage = useUploadImage(pathPrefix);

  return (
    <ImageUploadField
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
