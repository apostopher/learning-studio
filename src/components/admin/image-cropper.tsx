import { ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

/**
 * Why this component exists:
 * - Checked: no Base UI component provides interactive image cropping.
 * - Composes the react-image-crop library (per "libraries over custom"); the
 *   local crop/zoom state is the widget's own interactive state, like a form
 *   field.
 *
 * Lets the user position a 16:9 crop box over a selected image and zoom it, then
 * emits the cropped region as a Blob for the optimize + upload pipeline.
 */

const ASPECT = 16 / 9;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface ImageCropperProps {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

export const ImageCropper = ({
  file,
  onCancel,
  onCropped,
}: ImageCropperProps) => {
  // Create AND revoke the object URL in the same effect so a re-run (e.g. dev
  // double-invoke) makes a fresh URL rather than leaving the img pointing at a
  // revoked one — the cause of the "broken image" in the crop preview.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [busy, setBusy] = useState(false);

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    setCrop(
      centerCrop(
        makeAspectCrop(
          { unit: '%', width: 90 },
          ASPECT,
          naturalWidth,
          naturalHeight,
        ),
        naturalWidth,
        naturalHeight,
      ),
    );
  };

  const handleConfirm = async () => {
    const image = imgRef.current;
    if (!image || !crop) return;
    setBusy(true);

    // Crop is stored in display units; scale up to the image's natural pixels.
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelCrop = convertToPixelCrop(crop, image.width, image.height);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pixelCrop.width * scaleX);
    canvas.height = Math.round(pixelCrop.height * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Replicate react-image-crop's `scale` transform: the image is zoomed about
    // its natural centre, then the crop offset is applied.
    const centerX = image.naturalWidth / 2;
    const centerY = image.naturalHeight / 2;
    ctx.translate(-pixelCrop.x * scaleX, -pixelCrop.y * scaleY);
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    );

    // PNG keeps the intermediate lossless; optimizeImage does the final encode
    // (including the downscale to <=1600px).
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    setBusy(false);
    if (blob) onCropped(blob);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-h-[60vh] justify-center overflow-hidden rounded-lg bg-gray-1">
        {objectUrl && (
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            aspect={ASPECT}
            keepSelection
            minWidth={40}
          >
            <img
              ref={imgRef}
              src={objectUrl}
              onLoad={onImageLoad}
              alt="Crop source"
              style={{ transform: `scale(${zoom})` }}
              className="max-h-[60vh] w-auto object-contain"
            />
          </ReactCrop>
        )}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-3">
        <ZoomOut className="h-4 w-4 shrink-0 text-gray-11" aria-hidden="true" />
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
        <ZoomIn className="h-4 w-4 shrink-0 text-gray-11" aria-hidden="true" />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-11 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || !crop}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Crop &amp; upload
        </button>
      </div>
    </div>
  );
};
