import { z } from 'zod';

/** A course's pass mark until an admin sets one. Mirrors the column default. */
export const DEFAULT_PASS_MARK = 85;

export const PassMarkSchema = z.number().int().min(0).max(100);
