import { Dialog } from '@base-ui/react/dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { useUploadImage } from '@/data-hooks/use-upload-image';
import { ImageCropper } from './image-cropper';
import { ImageUploadField } from './image-upload-field';

export interface ImageValue {
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
}

/**
 * Owns the crop → optimize → upload flow for a cover image and reports the
 * resulting URLs via onChange. Selecting a file opens a 16:9 crop dialog; the
 * cropped Blob is then optimized and uploaded under `pathPrefix`.
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
  // Transient interactive state for the crop step (the file awaiting a crop).
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  return (
    <>
      <ImageUploadField
        previewUrl={value.imageUrlWebp}
        status={
          uploadImage.isPending
            ? 'busy'
            : uploadImage.isError
              ? 'error'
              : 'idle'
        }
        errorMessage={
          uploadImage.isError
            ? 'Could not optimize or upload the image. Please try again.'
            : undefined
        }
        onSelectFile={(file) => setPendingFile(file)}
        onRemove={() => {
          uploadImage.reset();
          onChange({ imageUrlAvif: null, imageUrlWebp: null });
        }}
      />

      <Dialog.Root
        open={pendingFile !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFile(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-gray-1/70 backdrop-blur-sm" />
          <Dialog.Popup className="fixed inset-0 z-50 m-auto h-fit w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Crop cover image
            </Dialog.Title>
            <Dialog.Description className="mt-1 mb-4 text-sm text-gray-11">
              Position the 16:9 area to use as the cover.
            </Dialog.Description>
            {pendingFile && (
              <ImageCropper
                file={pendingFile}
                onCancel={() => setPendingFile(null)}
                onCropped={(blob) => {
                  setPendingFile(null);
                  uploadImage.mutate(blob, {
                    onSuccess: (urls) => onChange(urls),
                    onError: () => toast.error('Image upload failed'),
                  });
                }}
              />
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
