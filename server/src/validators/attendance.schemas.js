import { z } from 'zod';
import { objectIdSchema, paginationSchema } from './common.schemas.js';

export const challengeSchema = z.object({}).strict().default({});

export const locationVerificationSchema = z.object({
  challengeId: objectIdSchema,
  officeId: objectIdSchema.optional(),
  wfhRequestId: objectIdSchema.optional(),
  position: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().nonnegative().max(10_000),
    timestamp: z.union([z.string().datetime(), z.number().finite().nonnegative()]),
  }),
});

export const faceVerificationSchema = z.object({
  challengeId: objectIdSchema,
  evidence: z.object({
    adapter: z.string().trim().min(1).max(80),
    challengeResponse: z.string().trim().min(1).max(200),
    frame: z.string().max(900_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'A JPEG camera frame is required').optional(),
    quality: z.object({
      brightness: z.number().finite().min(0).max(255),
      sharpness: z.number().finite().min(0).max(255),
      yaw: z.number().finite().min(-90).max(90),
      pitch: z.number().finite().min(-90).max(90),
      roll: z.number().finite().min(-90).max(90),
    }).optional(),
  }),
});

export const checkInSchema = z.object({ challengeId: objectIdSchema });
export const historyQuerySchema = paginationSchema;
