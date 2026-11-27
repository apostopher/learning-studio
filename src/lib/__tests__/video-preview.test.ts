import { describe, expect, it } from 'vitest';
import { videoPreviewSeconds } from '#/lib/video-preview';

const paid = { requiredSubscriptions: ['rpoc'] };
const free = { requiredSubscriptions: [] };

describe('videoPreviewSeconds', () => {
  it('caps a paid lesson for a free seat at 15 seconds', () => {
    expect(videoPreviewSeconds(paid, 'free')).toBe(15);
  });
  it('never caps a free lesson', () => {
    expect(videoPreviewSeconds(free, 'free')).toBeNull();
  });
  it('never caps a paid seat', () => {
    expect(videoPreviewSeconds(paid, 'paid')).toBeNull();
  });
  it('does not cap someone with no seat (refused upstream instead)', () => {
    expect(videoPreviewSeconds(paid, null)).toBeNull();
  });
});
