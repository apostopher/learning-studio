import { describe, expect, it } from 'vitest';
import type { CopiedModule, OrgEditorBoard } from '#/lib/admin-schemas';
import { copiedModuleMessage, copyModuleHint } from '../copied-module-message';

const copied = (
  placed: number,
  skipped: CopiedModule['skipped'] = [],
): CopiedModule =>
  ({
    module: { name: 'Basics' },
    placedLessonIds: Array.from({ length: placed }, (_, i) => i + 1),
    skipped,
  }) as unknown as CopiedModule;

describe('copiedModuleMessage', () => {
  it('says what came along', () => {
    expect(copiedModuleMessage(copied(3), 'Two-Week')).toBe(
      'Added "Basics" to Two-Week with 3 lessons.',
    );
  });

  it('names a few skipped lessons and says they stayed put', () => {
    expect(
      copiedModuleMessage(copied(1, [{ id: 9, name: 'Stalls' }]), 'Two-Week'),
    ).toBe(
      'Added "Basics" to Two-Week with 1 lesson. 1 lesson ("Stalls") was already in Two-Week and stayed where it is.',
    );
  });

  it('counts, rather than lists, many skipped lessons', () => {
    const many = [1, 2, 3, 4].map((id) => ({ id, name: `L${id}` }));
    expect(copiedModuleMessage(copied(0, many), 'Two-Week')).toBe(
      'Added "Basics" to Two-Week with 0 lessons. 4 lessons were already in Two-Week and stayed where they are.',
    );
  });
});

describe('copyModuleHint', () => {
  const board = [
    {
      course: { id: 1, name: 'Two-Week' },
      modules: [{ id: 40, name: 'Fundamentals' }],
    },
  ] as unknown as OrgEditorBoard;

  it('names the module it will follow', () => {
    expect(
      copyModuleHint(board, { courseId: 1, afterModuleId: 40 }, 'Basics'),
    ).toBe(
      'Adds "Basics" to Two-Week, after "Fundamentals", with its lessons.',
    );
  });

  it('just names the course when appending', () => {
    expect(
      copyModuleHint(board, { courseId: 1, afterModuleId: null }, 'Basics'),
    ).toBe('Adds "Basics" to Two-Week, with its lessons.');
  });

  it('says only the dragged lesson comes along for a single-lesson drop', () => {
    expect(
      copyModuleHint(
        board,
        { courseId: 1, afterModuleId: null, onlyLessonId: 5 },
        'Basics',
      ),
    ).toBe('Adds "Basics" to Two-Week, with this lesson.');
  });
});
