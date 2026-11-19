import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOC_SOURCE,
  DOC_SOURCE_LABELS,
  DocSourceSchema,
} from '../doc-source';

describe('doc-source', () => {
  it('labels both sources', () => {
    expect(DOC_SOURCE_LABELS).toEqual({
      itps: 'ITPS',
      '3d-airmanship': '3D Airmanship',
    });
  });

  it('rejects a label where a value is expected', () => {
    expect(DocSourceSchema.safeParse('ITPS').success).toBe(false);
    expect(DocSourceSchema.safeParse('itps').success).toBe(true);
  });

  it('defaults to 3D Airmanship', () => {
    expect(DEFAULT_DOC_SOURCE).toBe('3d-airmanship');
  });
});
