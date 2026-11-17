import { z } from 'zod';
import { objectIdSchema } from './common.schemas.js';

const poses = ['Front', 'Left', 'Right', 'Up', 'Down'];

export const enrollmentCaptureSchema = z.object({
  sessionId: objectIdSchema,
  pose: z.enum(poses),
  frame: z.string().max(900_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'A JPEG camera frame is required'),
  quality: z.object({
    brightness: z.number().finite().min(0).max(255),
    sharpness: z.number().finite().min(0).max(255),
    yaw: z.number().finite().min(-90).max(90),
    pitch: z.number().finite().min(-90).max(90),
    roll: z.number().finite().min(-90).max(90),
  }),
}).strict();

export const enrollmentCompleteSchema = z.object({ sessionId: objectIdSchema }).strict();
