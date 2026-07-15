/**
 * Client-side image optimization for course covers. Runs entirely in the
 * browser: decode → resize (canvas) → encode to BOTH AVIF and WebP with
 * WASM encoders (libaom / libwebp via @jsquash). The WASM modules are
 * dynamically imported so they only load when an admin actually optimizes an
 * image — never in the SSR bundle or for normal visitors.
 *
 * The encoders are pre-initialized with a `locateFile` that returns
 * Vite-resolved wasm URLs. Without this, emscripten self-resolves the wasm
 * path relative to its glue and the fetch fails under `vite dev` ("both async
 * and sync fetching of the wasm failed"). Routing every wasm filename through
 * a `?url` import makes it resolve correctly in both dev and production.
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

/** @jsquash init(module?, overrides?) — we only ever pass a locateFile override. */
type EncoderInit = (
  module: undefined,
  overrides: { locateFile: (path: string) => string },
) => Promise<unknown>;

// Memoize init so re-uploads within a session don't re-instantiate the wasm.
let webpReady: Promise<void> | null = null;
let avifReady: Promise<void> | null = null;

async function ensureWebpReady(init: EncoderInit): Promise<void> {
  webpReady ??= (async () => {
    const [{ default: base }, { default: simd }] = await Promise.all([
      import('@jsquash/webp/codec/enc/webp_enc.wasm?url'),
      import('@jsquash/webp/codec/enc/webp_enc_simd.wasm?url'),
    ]);
    const urls: Record<string, string> = {
      'webp_enc.wasm': base,
      'webp_enc_simd.wasm': simd,
    };
    await init(undefined, { locateFile: (path) => urls[path] ?? path });
  })();
  return webpReady;
}

async function ensureAvifReady(init: EncoderInit): Promise<void> {
  avifReady ??= (async () => {
    const [{ default: base }, { default: mt }] = await Promise.all([
      import('@jsquash/avif/codec/enc/avif_enc.wasm?url'),
      import('@jsquash/avif/codec/enc/avif_enc_mt.wasm?url'),
    ]);
    const urls: Record<string, string> = {
      'avif_enc.wasm': base,
      'avif_enc_mt.wasm': mt,
    };
    await init(undefined, { locateFile: (path) => urls[path] ?? path });
  })();
  return avifReady;
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

  const [{ default: encodeWebp, init: initWebp }, { default: encodeAvif, init: initAvif }] =
    await Promise.all([
      import('@jsquash/webp/encode'),
      import('@jsquash/avif/encode'),
    ]);

  await Promise.all([
    ensureWebpReady(initWebp as EncoderInit),
    ensureAvifReady(initAvif as EncoderInit),
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
