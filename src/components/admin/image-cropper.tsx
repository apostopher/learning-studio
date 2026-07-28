import { ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

/**
 * Why this component exists:
 * - Checked: no Base UI component provides interactive image cropping.
 * - Composes the react-easy-crop library (per "libraries over custom"); the
 *   local crop/zoom state is the widget's own interactive state, like a form
 *   field.
 *
 * Pan-and-zoom cropper with a fixed 16:9 frame: the user drags and zooms the
 * image behind the frame, then the framed region is emitted as a Blob for the
 * optimize + upload pipeline.
 */

const ASPECT = 16 / 9;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface ImageCropperProps {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = src;
  });
}

/** Draw the framed region (natural-pixel Area) to a lossless PNG blob. */
async function cropToBlob(src: string, area: Area): Promise<Blob | null> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  // PNG keeps the intermediate lossless; optimizeImage does the final encode
  // (including the downscale to <=1600px).
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export const ImageCropper = ({
  file,
  onCancel,
  onCropped,
}: ImageCropperProps) => {
  // Create AND revoke the object URL in the same effect so a re-run (e.g. dev
  // double-invoke) makes a fresh URL rather than leaving a revoked one.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!objectUrl || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(objectUrl, croppedAreaPixels);
      if (blob) onCropped(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-1">
        {objectUrl && (
          <Cropper
            image={objectUrl}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            objectFit="cover"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        )}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-3">
        <ZoomOut
          className="h-4 w-4 shrink-0 text-secondary"
          aria-hidden="true"
        />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          aria-label="Zoom"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-6 accent-apple-9"
        />
        <ZoomIn
          className="h-4 w-4 shrink-0 text-secondary"
          aria-hidden="true"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || !croppedAreaPixels}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Crop &amp; upload
        </button>
      </div>
    </div>
  );
};
