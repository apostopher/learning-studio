import { z } from 'zod';
import type { MaterialExtraTab } from '#/lib/flagship-course';
import { LessonMaterialGenerationSchema, MaterialLinkSchema } from '#/types';

const isFullWebAddress = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** A row may be blank; a link in it must be one a learner can open. */
const formLinksSchema = z
  .array(
    MaterialLinkSchema.refine(
      ({ url }) => url.trim() === '' || isFullWebAddress(url.trim()),
      {
        path: ['url'],
        message: 'Enter a full web address, like https://example.com',
      },
    ),
  )
  .optional();

/**
 * What the material form accepts, stricter on links than what is stored: a
 * stored or parsed document may hold `www.faa.gov`, and must still load. Only
 * a list this lesson shows is judged: a row nobody can see cannot be fixed.
 */
export const materialFormSchema = (extraTab: MaterialExtraTab | undefined) =>
  LessonMaterialGenerationSchema.extend({
    links: formLinksSchema,
    testThis:
      extraTab === 'testThis'
        ? formLinksSchema
        : LessonMaterialGenerationSchema.shape.testThis,
  });
