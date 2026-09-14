import { describe, expect, it } from 'vitest';
import { duplicateLessonNotes } from '#/lib/duplicate-lessons';

describe('duplicateLessonNotes', () => {
  it('names the OTHER modules holding a lesson placed twice in one course', () => {
    const notes = duplicateLessonNotes([
      { name: 'Intro', lessons: [{ id: 1 }, { id: 2 }] },
      { name: 'Weather', lessons: [{ id: 2 }, { id: 3 }] },
      { name: 'Nav', lessons: [{ id: 2 }] },
    ]);
    expect(notes.get(2)).toEqual(['Intro', 'Weather', 'Nav']);
    expect(notes.has(1)).toBe(false);
  });
});
