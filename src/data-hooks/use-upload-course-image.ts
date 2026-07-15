import { useMutation } from '@tanstack/react-query';
import { upload } from '@vercel/blob/client';
import { optimizeCourseImage } from '@/lib/image-optimize';

export interface UploadedCourseImage {
  imageUrlAvif: string;
  imageUrlWebp: string;
}

/**
 * Optimize a selected image to AVIF + WebP in the browser, upload both directly
 * to Vercel Blob via the admin token endpoint, and return their public URLs.
 * The server never receives the bytes — `upload()` gets a short-lived client
 * token from /api/admin/uploads and streams to Blob storage directly.
 */
export function useUploadCourseImage() {
  return useMutation<UploadedCourseImage, Error, File>({
    mutationFn: async (file) => {
      const { avif, webp } = await optimizeCourseImage(file);
      const [avifResult, webpResult] = await Promise.all([
        upload('courses/cover.avif', avif, {
          access: 'public',
          contentType: 'image/avif',
          handleUploadUrl: '/api/admin/uploads',
        }),
        upload('courses/cover.webp', webp, {
          access: 'public',
          contentType: 'image/webp',
          handleUploadUrl: '/api/admin/uploads',
        }),
      ]);
      return { imageUrlAvif: avifResult.url, imageUrlWebp: webpResult.url };
    },
  });
}
