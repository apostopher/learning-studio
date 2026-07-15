import { useMutation } from '@tanstack/react-query';
import { upload } from '@vercel/blob/client';
import { optimizeImage } from '@/lib/image-optimize';

export interface UploadedImage {
  imageUrlAvif: string;
  imageUrlWebp: string;
}

/**
 * Optimize a selected image to AVIF + WebP in the browser and upload both
 * directly to Vercel Blob via the admin token endpoint, returning their public
 * URLs. `pathPrefix` namespaces the blob (e.g. "courses", "modules"). The
 * server never receives the bytes — `upload()` gets a short-lived client token
 * from /api/admin/uploads and streams to Blob storage directly.
 */
export function useUploadImage(pathPrefix: string) {
  return useMutation<UploadedImage, Error, File>({
    mutationFn: async (file) => {
      const { avif, webp } = await optimizeImage(file);
      // Unique base name per upload so entities never collide (writing to an
      // existing blob without allowOverwrite is a 400). The .avif/.webp pair
      // shares one id so they stay associated in storage.
      const id = crypto.randomUUID();
      const [avifResult, webpResult] = await Promise.all([
        upload(`${pathPrefix}/${id}.avif`, avif, {
          access: 'public',
          contentType: 'image/avif',
          handleUploadUrl: '/api/admin/uploads',
        }),
        upload(`${pathPrefix}/${id}.webp`, webp, {
          access: 'public',
          contentType: 'image/webp',
          handleUploadUrl: '/api/admin/uploads',
        }),
      ]);
      return { imageUrlAvif: avifResult.url, imageUrlWebp: webpResult.url };
    },
  });
}
