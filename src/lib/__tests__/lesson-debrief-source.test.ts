// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getLessonMaterial,
  getLessonTranscript,
  getDerivedKeyPoints,
  getLessonIdBySlug,
  getHomeCourseIdForLesson,
} = vi.hoisted(() => ({
  getLessonMaterial: vi.fn(),
  getLessonTranscript: vi.fn(),
  getDerivedKeyPoints: vi.fn(),
  getLessonIdBySlug: vi.fn(),
  getHomeCourseIdForLesson: vi.fn(),
}));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug }));
vi.mock('#/db/placements', () => ({ getHomeCourseIdForLesson }));

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
    getLessonIdBySlug.mockResolvedValue(42);
    getHomeCourseIdForLesson.mockResolvedValue(null);
  });

  it('uses the authored material verbatim when it has key points and text', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['authored'],
    });

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      kind: 'material',
      keyPoints: ['authored'],
      context: 'lesson body',
    });
    // The authored lesson wins outright for the key points: no derivation.
    expect(getDerivedKeyPoints).not.toHaveBeenCalled();
  });

  it('derives key points from the material text when none were authored', async () => {
    getLessonMaterial.mockResolvedValue({ text: 'lesson body', keyPoints: [] });

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      kind: 'material-derived',
      keyPoints: ['derived one', 'derived two'],
      context: 'lesson body',
    });
    // Derived FROM the material, not from the video — the authored lesson is
    // still the source of the key points whenever there is one.
    expect(getDerivedKeyPoints).toHaveBeenCalledWith('lesson body');
  });

  it('falls back to the video transcript when the lesson has no material', async () => {
    getLessonTranscript.mockResolvedValue('spoken words from the video');

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      kind: 'transcript',
      keyPoints: ['derived one', 'derived two'],
      context: 'spoken words from the video',
    });
    expect(getDerivedKeyPoints).toHaveBeenCalledWith(
      'spoken words from the video',
    );
    // The transcript is read for the course the caller is serving — playback
    // resolves through that course's credentials (Task 6a).
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', { courseId: 7 });
  });

  it('falls back to the transcript when the material row has no body text', async () => {
    getLessonMaterial.mockResolvedValue({ text: '', keyPoints: [] });
    getLessonTranscript.mockResolvedValue('spoken words from the video');

    const source = await resolveDebriefSource('l-1', 7);
    expect(source?.kind).toBe('transcript');
  });

  it('returns null when there is neither material nor a transcript', async () => {
    await expect(resolveDebriefSource('l-1', 7)).resolves.toBeNull();
  });

  it('returns null rather than an empty-key-point source when derivation yields nothing', async () => {
    getLessonTranscript.mockResolvedValue('spoken words from the video');
    getDerivedKeyPoints.mockResolvedValue([]);

    // generateTest asks for `keyPoints.length * 2` questions, so an empty list
    // would generate a debrief of zero questions rather than fail.
    await expect(resolveDebriefSource('l-1', 7)).resolves.toBeNull();
  });

  it('uses the home-course transcript as context when the lesson has material', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getHomeCourseIdForLesson.mockResolvedValue(3);
    getLessonTranscript.mockResolvedValue('the transcript');

    const source = await resolveDebriefSource('l-1', 7);

    expect(source).toEqual({
      kind: 'material',
      keyPoints: ['authored'],
      context: 'the transcript',
    });
    // Home course (3), not the course being served (7).
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', { courseId: 3 });
  });

  it('uses the material text as context when there is no transcript', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getLessonTranscript.mockResolvedValue(null);

    const source = await resolveDebriefSource('l-1', 7);
    expect(source?.context).toBe('lesson body');
  });

  it('falls back to the passed courseId when the lesson has no home course', async () => {
    getLessonMaterial.mockResolvedValue({ text: 'b', keyPoints: ['a'] });
    getLessonTranscript.mockResolvedValue('t');

    await resolveDebriefSource('l-1', 7);
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', { courseId: 7 });
  });

  it('falls back to material text when the transcript lookup rejects for an authored lesson', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getLessonTranscript.mockRejectedValue(new Error('mux down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      kind: 'material',
      keyPoints: ['authored'],
      context: 'lesson body',
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to material text when the home-course lookup rejects', async () => {
    getLessonMaterial.mockResolvedValue({
      text: 'lesson body',
      keyPoints: ['a'],
    });
    getHomeCourseIdForLesson.mockRejectedValue(new Error('db'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const source = await resolveDebriefSource('l-1', 7);
    expect(source?.context).toBe('lesson body');
    warn.mockRestore();
  });

  it('uses the passed courseId when the lesson slug resolves to no lesson id', async () => {
    getLessonIdBySlug.mockResolvedValue(null);
    getLessonMaterial.mockResolvedValue({ text: 'b', keyPoints: ['a'] });
    getLessonTranscript.mockResolvedValue('t');

    await resolveDebriefSource('l-1', 7);
    expect(getHomeCourseIdForLesson).not.toHaveBeenCalled();
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', { courseId: 7 });
  });
});
