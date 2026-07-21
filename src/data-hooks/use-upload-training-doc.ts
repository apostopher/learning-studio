import { useMutation } from '@tanstack/react-query';
import { upload } from '@vercel/blob/client';

export interface UploadedTrainingDoc {
  url: string;
  fileName: string;
  mimeType: string;
}

/**
 * Upload a PDF/Word file directly to Vercel Blob under a unique `training-docs/`
 * key via the admin client-token endpoint. The server never sees the bytes.
 */
export function useUploadTrainingDoc() {
  return useMutation<UploadedTrainingDoc, Error, File>({
    mutationFn: async (file) => {
      const ext = file.name.split('.').pop() ?? 'bin';
      const result = await upload(
        `training-docs/${crypto.randomUUID()}.${ext}`,
        file,
        {
          access: 'public',
          contentType: file.type,
          handleUploadUrl: '/api/admin/uploads',
        },
      );
      return { url: result.url, fileName: file.name, mimeType: file.type };
    },
  });
}
