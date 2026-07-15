/**
 * Client-side image optimization for course covers. Runs entirely in the
 * browser: decode → resize (canvas) → encode to BOTH AVIF and WebP with
 * WASM encoders (libaom / libwebp via @jsquash). The WASM modules are
 * dynamically imported so they only load when an admin actually optimizes an
 * image — never in the SSR bundle or for normal visitors.
 */

const MAX_EDGE = 1600;
// libwebp: quality 0–100, method 0–6 (6 = slowest / best compression).
const WEBP_OPTIONS = { quality: 80, method: 6 } as const;
// libaom AVIF: quality 0–100, speed 0–10 (lower = slower / better).
const AVIF_OPTIONS = { quality: 55, speed: 6 } as const;

export interface OptimizedImage {
  avif: Blob;
  webp: Blob;
  width: number;
  height: number;
}

/** Scale (w, h) down so the longest edge is at most `maxEdge`; never upscale. */
function fitWithin(
  w: number,
  h: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Optimize a user-selected image file into resized AVIF + WebP blobs.
 * Throws if the file can't be decoded or a 2D canvas context is unavailable.
 */
export async function optimizeCourseImage(file: File): Promise<OptimizedImage> {
  // The browser decodes any format it supports (jpeg/png/webp/heic-on-Safari…)
  // and applies EXIF orientation so the pixels are already upright.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context is unavailable');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, width, height);

  // Lazy-load the encoders; each detects SIMD/threads and falls back to the
  // single-threaded build when the page isn't cross-origin isolated.
  const [{ default: encodeWebp }, { default: encodeAvif }] = await Promise.all([
    import('@jsquash/webp/encode'),
    import('@jsquash/avif/encode'),
  ]);

  const [webpBuffer, avifBuffer] = await Promise.all([
    encodeWebp(imageData, WEBP_OPTIONS),
    encodeAvif(imageData, AVIF_OPTIONS),
  ]);

  return {
    avif: new Blob([avifBuffer], { type: 'image/avif' }),
    webp: new Blob([webpBuffer], { type: 'image/webp' }),
    width,
    height,
  };
}
