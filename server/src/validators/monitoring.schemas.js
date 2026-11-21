import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const deviceParams = z.object({ id });
export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  consent: z.literal(true),
});
export const enrollSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  hostname: z.string().trim().min(1).max(200),
});
export const deviceStateSchema = z.object({ status: z.enum(['active', 'paused', 'revoked']) });
export const agentStateSchema = z.object({ status: z.enum(['active', 'paused']) });
export const activityEventSchema = z.object({
  bucketId: z.string().min(1).max(300),
  sourceId: z.string().min(1).max(200),
  type: z.enum(['currentwindow', 'afkstatus', 'web.tab.current']),
  timestamp: z.iso.datetime({ offset: true }),
  duration: z.number().finite().min(0).max(300),
  app: z.string().max(300).optional(),
  title: z.string().max(500).optional(),
  domain: z.string().max(253).regex(/^[a-z\d.:[\]-]+$/i).optional(),
  status: z.enum(['afk', 'not-afk']).optional(),
}).superRefine((event, ctx) => {
  if (event.type === 'afkstatus' && !event.status) ctx.addIssue({ code: 'custom', message: 'AFK status is required' });
  if (event.type === 'currentwindow' && !event.app) ctx.addIssue({ code: 'custom', message: 'Application is required' });
  if (event.type === 'web.tab.current' && !event.domain) ctx.addIssue({ code: 'custom', message: 'Website domain is required' });
});
export const ingestSchema = z.object({ events: z.array(activityEventSchema).max(500) });
export const reportQuerySchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  employeeId: id.optional(),
}).refine(({ start, end }) => {
  const duration = Date.parse(end) - Date.parse(start);
  return duration > 0 && duration <= 7 * 86400_000;
}, { message: 'Choose a period between one second and seven days' });
