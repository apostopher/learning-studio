// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getPinnedSnapshot,
  getLessonTranscript,
  getDerivedKeyPoints,
  getHomeCourseIdForVersion,
} = vi.hoisted(() => ({
  getPinnedSnapshot: vi.fn(),
  getLessonTranscript: vi.fn(),
  getDerivedKeyPoints: vi.fn(),
  getHomeCourseIdForVersion: vi.fn(),
}));
vi.mock('#/db/course-lesson-content', () => ({
  getHomeCourseIdForVersion,
  getPinnedSnapshot,
}));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript }));
vi.mock('#/db/derived-key-points', () => ({ getDerivedKeyPoints }));

import {
  resolveDebriefSource,
  TRANSCRIPT_LOOKUP_TIMEOUT_MS,
} from '../lesson-debrief-source.server';

/** The served course is on version 31, with this (or no) material. */
const hasMaterial = (
  material: { text: string; keyPoints: string[] } | null,
): void => {
  getPinnedSnapshot.mockResolvedValue({
    id: 31,
    text: null,
    keyPoints: null,
    ...material,
  });
};

describe('resolveDebriefSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasMaterial(null);
    getLessonTranscript.mockResolvedValue(null);
    getDerivedKeyPoints.mockResolvedValue(['derived one', 'derived two']);
    getHomeCourseIdForVersion.mockResolvedValue(null);
  });

  it('uses the authored material verbatim when it has key points and text', async () => {
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['authored'],
    });

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      lessonVersionId: 31,
      kind: 'material',
      keyPoints: ['authored'],
      context: 'lesson body',
    });
    // The authored lesson wins outright for the key points: no derivation.
    expect(getDerivedKeyPoints).not.toHaveBeenCalled();
  });

  it('derives key points from the material text when none were authored', async () => {
    hasMaterial({ text: 'lesson body', keyPoints: [] });

    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      lessonVersionId: 31,
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
      lessonVersionId: 31,
      kind: 'transcript',
      keyPoints: ['derived one', 'derived two'],
      context: 'spoken words from the video',
    });
    expect(getDerivedKeyPoints).toHaveBeenCalledWith(
      'spoken words from the video',
    );
    expect(getPinnedSnapshot).toHaveBeenCalledWith('l-1', 7);
    expect(getHomeCourseIdForVersion).toHaveBeenCalledWith(31);
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', {
      courseId: 7,
      versionId: 31,
    });
  });

  it('falls back to the transcript when the material row has no body text', async () => {
    hasMaterial({ text: '', keyPoints: [] });
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
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getHomeCourseIdForVersion.mockResolvedValue(3);
    getLessonTranscript.mockResolvedValue('the transcript');

    const source = await resolveDebriefSource('l-1', 7);

    expect(source).toEqual({
      lessonVersionId: 31,
      kind: 'material',
      keyPoints: ['authored'],
      context: 'the transcript',
    });
    // Home course (3), not the course being served (7).
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', {
      courseId: 3,
      versionId: 31,
    });
  });

  it('uses the material text as context when there is no transcript', async () => {
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getLessonTranscript.mockResolvedValue(null);

    const source = await resolveDebriefSource('l-1', 7);
    expect(source?.context).toBe('lesson body');
  });

  it('falls back to the passed courseId when the version has no home course', async () => {
    hasMaterial({ text: 'b', keyPoints: ['a'] });
    getLessonTranscript.mockResolvedValue('t');

    await resolveDebriefSource('l-1', 7);
    expect(getLessonTranscript).toHaveBeenCalledWith('l-1', {
      courseId: 7,
      versionId: 31,
    });
  });

  it('falls back to material text, flagged degraded, when the transcript lookup rejects for an authored lesson', async () => {
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getLessonTranscript.mockRejectedValue(new Error('mux down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Degraded: chunk generation must not treat this as a changed source.
    await expect(resolveDebriefSource('l-1', 7)).resolves.toEqual({
      lessonVersionId: 31,
      kind: 'material',
      keyPoints: ['authored'],
      context: 'lesson body',
      degraded: true,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to material text when the home-course lookup rejects', async () => {
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['a'],
    });
    getHomeCourseIdForVersion.mockRejectedValue(new Error('db'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const source = await resolveDebriefSource('l-1', 7);
    expect(source?.context).toBe('lesson body');
    expect(source?.degraded).toBe(true);
    warn.mockRestore();
  });

  it('a transcript lookup that hangs past the timeout is a failure: material text, degraded', async () => {
    vi.useFakeTimers();
    try {
      hasMaterial({
        text: 'lesson body',
        keyPoints: ['authored'],
      });
      getLessonTranscript.mockReturnValue(new Promise(() => {}));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pending = resolveDebriefSource('l-1', 7);
      await vi.advanceTimersByTimeAsync(TRANSCRIPT_LOOKUP_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({
        lessonVersionId: 31,
        kind: 'material',
        keyPoints: ['authored'],
        context: 'lesson body',
        degraded: true,
      });
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a transcript that answers within the timeout is used, not degraded', async () => {
    hasMaterial({
      text: 'lesson body',
      keyPoints: ['authored'],
    });
    getLessonTranscript.mockResolvedValue('spoken');
    const source = await resolveDebriefSource('l-1', 7);
    expect(source).toEqual({
      lessonVersionId: 31,
      kind: 'material',
      keyPoints: ['authored'],
      context: 'spoken',
    });
  });

  it('a course without a pin has nothing to debrief from', async () => {
    getPinnedSnapshot.mockResolvedValue(null);

    await expect(resolveDebriefSource('l-1', 7)).resolves.toBeNull();
    expect(getLessonTranscript).not.toHaveBeenCalled();
  });
});
