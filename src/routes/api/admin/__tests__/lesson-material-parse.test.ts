// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fully stub these — the route imports permission/db modules that pull in
// real db/session wiring vitest can't resolve (@/ imports, side effects). `#/`
// not `@/`: vitest cannot resolve the `@/` alias, and the route imports via
// `#/`, so the mock specifiers must match exactly or the route gets the real
// module instead of the stub.
const {
  ForbiddenError,
  getDisciplineIdForLessonId,
  requireLessonContentPermission,
  absentResourceResponse,
  isStaffAnywhere,
  wordToHtml,
  generateLessonMaterial,
} = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    getDisciplineIdForLessonId: vi.fn(),
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    isStaffAnywhere: vi.fn(),
    wordToHtml: vi.fn(),
    generateLessonMaterial: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission,
  absentResourceResponse,
  isStaffAnywhere,
}));
vi.mock('#/db/lesson-access', () => ({ getDisciplineIdForLessonId }));
vi.mock('#/lib/word-to-html.server', () => ({ wordToHtml }));
vi.mock('#/ai/generate-lesson-material', () => ({ generateLessonMaterial }));

import { parseLessonMaterialHandler } from '../lesson-material.parse';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function requestWith(
  file: File | null,
  lessonId: string | null = '10',
): Request {
  const form = new FormData();
  if (file) form.append('file', file);
  if (lessonId !== null) form.append('lessonId', lessonId);
  return new Request('http://test/api/admin/lesson-material/parse', {
    method: 'POST',
    body: form,
  });
}

const MATERIAL = {
  text: '<p>Body</p>',
  keyPoints: [],
  proTips: '',
  quiz: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  // Deliberately NOT defaulted here (fix round 3): `isStaffAnywhere` now
  // covers both `course_staff` and `discipline_staff`, and the gap this
  // round closes was hidden by exactly this kind of blanket default —
  // nothing exercised the floor against a real refusal. Each test below
  // sets it explicitly, matching what that test means to exercise.
  //
  // This lesson's discipline — a sentinel so a branch that forwards the wrong
  // value fails a `toHaveBeenCalledWith` assertion rather than passing by
  // coincidence.
  getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 7,
  });
  requireLessonContentPermission.mockResolvedValue(undefined);
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  absentResourceResponse.mockResolvedValue(new Response(null, { status: 404 }));
});

describe('parseLessonMaterialHandler', () => {
  /**
   * Minor 1 (fix round 2): this route now does real work — buffering and
   * parsing a multipart body, then a DB query — before the lesson id is even
   * known. Without a floor, an anonymous caller could force both, per
   * request, before ever being refused. `isStaffAnywhere` is the same cheap
   * floor `uploads.ts`'s `requireUploadAccess` uses; the precise per-lesson
   * authority is still `requireLessonContentPermission`, once the lesson id
   * is known.
   *
   * Asserting `request.formData` was never called is the assertion that
   * actually pins the ORDERING — a status-only check would pass even if the
   * floor ran after the body was already parsed.
   *
   * Mutant: move the `isStaffAnywhere` check to AFTER `request.formData()`
   * (restoring this round's regression). RED: `formData` spy is called
   * before the floor ever runs.
   */
  it('refuses a non-staff/anonymous caller before ever reading the body', async () => {
    isStaffAnywhere.mockResolvedValueOnce(false);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    const request = requestWith(file, '10');
    const formDataSpy = vi.spyOn(request, 'formData');

    const res = await parseLessonMaterialHandler(request);

    expect(res.status).toBe(403);
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(getDisciplineIdForLessonId).not.toHaveBeenCalled();
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  /**
   * Important 3 (fix round 1): guard on the SAME lesson, with the SAME guard,
   * as the save this parse feeds — `lessons.$lessonId.material.ts`'s POST.
   * This is the exact pairing ("this person can save THIS lesson"), not the
   * approximate one ("someone who could save something") the route used
   * before: an SME on any discipline could parse a file for an "Untitled"
   * lesson only an org admin could actually save.
   */
  it('resolves the lessonId sent in the form data and forwards its discipline with an update action', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);

    await parseLessonMaterialHandler(requestWith(file, '10'));

    expect(getDisciplineIdForLessonId).toHaveBeenCalledWith(10);
    expect(requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
  });

  // Mutant: guard ignores the resolved discipline (or the old
  // `canParseLessonMaterial` course-less bound survives alongside it).
  // Refusing only the mocked guard would then not stop generation — RED.
  it('returns 403 without generating when the guard rejects', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    requireLessonContentPermission.mockRejectedValueOnce(new ForbiddenError());
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file, '10'));

    expect(res.status).toBe(403);
    expect(wordToHtml).not.toHaveBeenCalled();
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  /**
   * Fix round 3: the floor (`isStaffAnywhere`) and the per-lesson guard
   * (`requireLessonContentPermission`) are separate mocks at this layer, so
   * this is the discipline-only-SME case at the route's own black-box level
   * — an actor who is staff ONLY via `discipline_staff` (floor resolves
   * `true`) and holds no course_staff row at all reaches and passes the
   * per-lesson guard exactly the same as any other admitted actor. The
   * real distinguishing logic — that `isStaffAnywhere` itself checks
   * `discipline_staff`, not just `course_staff` — is unit-tested directly in
   * lib/__tests__/permissions-server.test.ts ("is true for a discipline-only
   * SME holding zero course_staff rows").
   */
  it('allows a discipline-only SME once the floor and the per-lesson guard both resolve', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file, '10'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MATERIAL);
  });

  // The enumeration oracle, same as every other lesson-content route: a
  // missing lessonId is handed to `absentResourceResponse`, which answers 404
  // only to someone on the teaching side.
  it('hands a non-existent lessonId to absentResourceResponse, without generating', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    getDisciplineIdForLessonId.mockResolvedValueOnce({ found: false });
    absentResourceResponse.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file, '999'));

    expect(absentResourceResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  it('returns 400 when lessonId is missing, without resolving a discipline', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    const res = await parseLessonMaterialHandler(requestWith(file, null));
    expect(res.status).toBe(400);
    expect(getDisciplineIdForLessonId).not.toHaveBeenCalled();
  });

  it('returns 400 when lessonId is not a positive integer', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    const res = await parseLessonMaterialHandler(requestWith(file, 'abc'));
    expect(res.status).toBe(400);
    expect(getDisciplineIdForLessonId).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-docx file', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      400,
    );
  });

  it('returns 400 when no file is provided', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      400,
    );
  });

  it('converts, generates, and returns parsed material', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MATERIAL);
    expect(generateLessonMaterial).toHaveBeenCalledWith('<p>Body</p>');
  });

  it('returns 500 when generation throws', async () => {
    isStaffAnywhere.mockResolvedValueOnce(true);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockRejectedValueOnce(new Error('model down'));
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      500,
    );
  });
});
