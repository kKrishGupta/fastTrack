import { z } from 'zod';
import { objectIdSchema, paginationSchema } from './common.schemas.js';

export const createWfhRequestSchema = z.object({
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(10).max(500),
  locationLabel: z.string().trim().max(200).optional(),
  position: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().nonnegative().max(10_000),
  }),
}).strict();

export const wfhQuerySchema = paginationSchema.extend({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional() });
export const reviewWfhRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(500).optional(),
}).strict();
export const wfhIdParamsSchema = z.object({ id: objectIdSchema });
