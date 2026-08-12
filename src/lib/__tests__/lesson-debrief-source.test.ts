// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLessonMaterial, getLessonTranscript, getDerivedKeyPoints } =
  vi.hoisted(() => ({
    getLessonMaterial: vi.fn(),
    getLessonTranscript: vi.fn(),
    getDerivedKeyPoints: vi.fn(),
  }));

vi.mock('#/db/lesson', () => ({ getLessonMaterial }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript }));
vi.mock('#/db/derived-key-points', () => ({ getDerivedKeyPoints }));

import { resolveDebriefSource } from '../lesson-debrief-source.server';

describe('resolveDebriefSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLessonMaterial.mockResolvedValue(null);
    getLessonTranscript.mockResolvedValue(null);
    getDerivedKeyPoints.mockResolvedValue(['derived one', 'derived two']);
  });

  it('uses the authored material verbatim when it has key points and text', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['authored'],
    });

    await expect(resolveDebriefSource('l-1')).resolves.toEqual({
      kind: 'material',
      keyPoints: ['authored'],
      text: 'lesson body',
    });
    // The authored lesson wins outright: no derivation, and the transcript is
    // never even looked up.
    expect(getDerivedKeyPoints).not.toHaveBeenCalled();
    expect(getLessonTranscript).not.toHaveBeenCalled();
  });

  it('derives key points from the material text when none were authored', async () => {
    getLessonMaterial.mockResolvedValue({ text: 'lesson body', keyPoints: [] });

    await expect(resolveDebriefSource('l-1')).resolves.toEqual({
      kind: 'material-derived',
      keyPoints: ['derived one', 'derived two'],
      text: 'lesson body',
    });
    // Derived FROM the material, not from the video — the authored lesson is
    // still the source whenever there is one.
    expect(getDerivedKeyPoints).toHaveBeenCalledWith('lesson body');
    expect(getLessonTranscript).not.toHaveBeenCalled();
  });

  it('falls back to the video transcript when the lesson has no material', async () => {
    getLessonTranscript.mockResolvedValue('spoken words from the video');

    await expect(resolveDebriefSource('l-1')).resolves.toEqual({
      kind: 'transcript',
      keyPoints: ['derived one', 'derived two'],
      text: 'spoken words from the video',
    });
    expect(getDerivedKeyPoints).toHaveBeenCalledWith(
      'spoken words from the video',
    );
  });

  it('falls back to the transcript when the material row has no body text', async () => {
    getLessonMaterial.mockResolvedValue({ text: '', keyPoints: [] });
    getLessonTranscript.mockResolvedValue('spoken words from the video');

    const source = await resolveDebriefSource('l-1');
    expect(source?.kind).toBe('transcript');
  });

  it('returns null when there is neither material nor a transcript', async () => {
    await expect(resolveDebriefSource('l-1')).resolves.toBeNull();
  });

  it('returns null rather than an empty-key-point source when derivation yields nothing', async () => {
    getLessonTranscript.mockResolvedValue('spoken words from the video');
    getDerivedKeyPoints.mockResolvedValue([]);

    // generateTest asks for `keyPoints.length * 2` questions, so an empty list
    // would generate a debrief of zero questions rather than fail.
    await expect(resolveDebriefSource('l-1')).resolves.toBeNull();
  });
});
