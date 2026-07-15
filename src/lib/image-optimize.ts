/**
 * Client-side image optimization for admin cover images (courses, modules…).
 * Runs entirely in the
 * browser: decode → resize (canvas) → encode to BOTH AVIF and WebP with
 * WASM encoders (libaom / libwebp via @jsquash). The WASM modules are
 * dynamically imported so they only load when an admin actually optimizes an
 * image — never in the SSR bundle or for normal visitors.
 *
 * The encoders are pre-initialized with a `locateFile` that points at the wasm
 * binaries served statically from /public/wasm. Emscripten otherwise resolves
 * the wasm relative to its glue via import.meta.url, which `vite dev` does not
 * serve from inside node_modules ("both async and sync fetching of the wasm
 * failed"). Serving the binaries from /public sidesteps bundler resolution and
 * behaves identically in dev and production.
 *
 * These files are copied from the packages — re-copy after upgrading
 * @jsquash/webp or @jsquash/avif:
 *   cp node_modules/@jsquash/webp/codec/enc/*.wasm public/wasm/
 *   cp node_modules/@jsquash/avif/codec/enc/*.wasm public/wasm/
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

// Emscripten requests each wasm by basename (e.g. "webp_enc_simd.wasm"); map it
// to the static copy under /public/wasm.
const locateWasm = (path: string): string => `/wasm/${path}`;

// Memoize init so re-uploads within a session don't re-instantiate the wasm.
let webpReady: Promise<unknown> | null = null;
let avifReady: Promise<unknown> | null = null;

const ensureWebpReady = (init: EncoderInit) =>
  (webpReady ??= init(undefined, { locateFile: locateWasm }));
const ensureAvifReady = (init: EncoderInit) =>
  (avifReady ??= init(undefined, { locateFile: locateWasm }));

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
export async function optimizeImage(file: File): Promise<OptimizedImage> {
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

  const [
    { default: encodeWebp, init: initWebp },
    { default: encodeAvif, init: initAvif },
  ] = await Promise.all([
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
