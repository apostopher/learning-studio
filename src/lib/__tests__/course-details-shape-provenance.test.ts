import { describe, expect, it } from 'vitest';
import { toLearnerCourseDetails } from '#/lib/course-details-shape';

/**
 * Spec test group 5. The mutant is someone adding `sourceCourseId` (or
 * leaving `courseId`, the OWNER column that `...module` spreads in from the
 * DB row) "just for debugging". A remixed course must serialise as one
 * cohesive course: no key on any module says where it came from.
 */
describe('toLearnerCourseDetails hides provenance', () => {
  it('strips the module’s owner id and any remix keys from every module', () => {
    const shaped = toLearnerCourseDetails(
      {
        id: 2,
        modules: [
          {
            id: 10,
            name: 'Borrowed',
            courseId: 6,
            lessons: [
              { id: 1, videoProvider: 'mux', videoRef: 'x', otherVideoIds: [] },
            ],
          },
        ],
      },
      false,
    );
    const mod = shaped.modules[0] as Record<string, unknown>;
    expect(Object.keys(mod)).not.toContain('courseId');
    expect(
      Object.keys(mod).filter((k) => /owner|source|remix/i.test(k)),
    ).toEqual([]);
    expect(mod.name).toBe('Borrowed');
  });
});
