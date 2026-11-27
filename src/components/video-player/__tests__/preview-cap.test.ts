import { describe, expect, it } from 'vitest';
import {
  clampToPreview,
  displayDuration,
  hasReachedPreviewCap,
  isPreviewEnded,
  previewPlayFrom,
} from '../preview-cap';

const preview = { seconds: 15, fullDurationSeconds: 853 };

describe('preview cap', () => {
  it('holds a seek inside the preview, and leaves a full video alone', () => {
    expect(clampToPreview(400, preview)).toBe(15);
    expect(clampToPreview(10, preview)).toBe(10);
    expect(clampToPreview(400, undefined)).toBe(400);
  });

  it('stops at the cap', () => {
    expect(hasReachedPreviewCap(14.9, preview)).toBe(false);
    expect(hasReachedPreviewCap(15, preview)).toBe(true);
    expect(hasReachedPreviewCap(900, undefined)).toBe(false);
  });

  it('starts the preview over when Play is pressed at the cap', () => {
    expect(previewPlayFrom(15, preview)).toBe(0);
    expect(previewPlayFrom(5, preview)).toBeNull();
    expect(previewPlayFrom(15, undefined)).toBeNull();
  });

  it('shows the whole video’s length, falling back to the media’s', () => {
    expect(displayDuration(18, preview)).toBe(853);
    expect(
      displayDuration(18, { seconds: 15, fullDurationSeconds: null }),
    ).toBe(18);
    expect(displayDuration(853, undefined)).toBe(853);
  });

  it('is over only while paused at the cap', () => {
    expect(isPreviewEnded({ paused: true, currentTime: 15 }, preview)).toBe(
      true,
    );
    expect(isPreviewEnded({ paused: false, currentTime: 15 }, preview)).toBe(
      false,
    );
    expect(isPreviewEnded({ paused: true, currentTime: 3 }, preview)).toBe(
      false,
    );
    expect(isPreviewEnded({ paused: true, currentTime: 15 }, undefined)).toBe(
      false,
    );
  });
});
