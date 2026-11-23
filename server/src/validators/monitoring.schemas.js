import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const deviceParams = z.object({ id });
export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  consent: z.literal(true),
  browserDetailsConsent: z.boolean().default(false),
  screenshotConsent: z.boolean().default(false),
});
export const enrollSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  hostname: z.string().trim().min(1).max(200),
});
export const deviceStateSchema = z.object({ status: z.enum(['active', 'paused', 'revoked']) });
export const deviceConsentSchema = z.object({
  screenshotConsent: z.literal(true),
}).strict();
export const agentStateSchema = z.object({ status: z.enum(['active', 'paused']) });
export const deviceQuerySchema = z.object({ employeeId: id.optional() });
export const heartbeatSchema = z.object({
  activityWatchAvailable: z.boolean(),
  watchers: z.array(z.enum(['currentwindow', 'afkstatus', 'web.tab.current'])).max(3),
  browserBuckets: z.array(z.string().min(1).max(300)).max(50).default([]),
});
export const activityEventSchema = z.object({
  bucketId: z.string().min(1).max(300),
  sourceId: z.string().min(1).max(200),
  type: z.enum(['currentwindow', 'afkstatus', 'web.tab.current']),
  timestamp: z.iso.datetime({ offset: true }),
  duration: z.number().finite().min(0).max(300),
  app: z.string().max(300).optional(),
  title: z.string().max(500).optional(),
  domain: z.string().max(253).regex(/^[a-z\d.:[\]-]+$/i).optional(),
  url: z.url().max(2048).refine((value) => { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }).optional(),
  status: z.enum(['afk', 'not-afk']).optional(),
}).superRefine((event, ctx) => {
  if (event.type === 'afkstatus' && !event.status) ctx.addIssue({ code: 'custom', message: 'AFK status is required' });
  if (event.type === 'currentwindow' && !event.app) ctx.addIssue({ code: 'custom', message: 'Application is required' });
  if (event.type === 'web.tab.current' && !event.domain) ctx.addIssue({ code: 'custom', message: 'Website domain is required' });
});
export const ingestSchema = z.object({ events: z.array(activityEventSchema).max(500) });
export const policySchema = z.object({
  version: z.number().int().min(1), enabled: z.boolean(), includeTitles: z.boolean(), browserEnabled: z.boolean(),
  browserUrlMode: z.enum(['domain', 'origin', 'path', 'full']), browserTitleEnabled: z.boolean(),
  approvedBrowserBuckets: z.array(z.string().min(1).max(300)).max(50),
  excludedApps: z.array(z.string().trim().min(1).max(300)).max(100),
  excludedDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z\d]+(?:[.-][a-z\d]+)*$/)).max(100),
  requireAttendance: z.boolean(), retentionDays: z.number().int().min(1).max(90),
  screenshotsEnabled: z.boolean(), screenshotIntervalSeconds: z.number().int().min(60).max(3600),
  screenshotRetentionDays: z.number().int().min(1).max(30),
  screenshotDisplayMode: z.enum(['primary', 'all']),
  screenshotExcludedApps: z.array(z.string().trim().min(1).max(300)).max(100),
}).strict();
export const screenshotRequestSchema = z.object({
  captureId: z.string().uuid(), capturedAt: z.iso.datetime({ offset: true }),
  width: z.number().int().min(1).max(32768), height: z.number().int().min(1).max(32768),
  byteLength: z.number().int().min(1).max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f\d]{64}$/),
  format: z.enum(['png', 'jpg']).default('png'),
}).strict().refine(({ format, byteLength }) => format !== 'jpg' || byteLength <= 30 * 1024,
  { message: 'Compressed JPEG screenshots must not exceed 30 KB', path: ['byteLength'] });
export const screenshotCompleteSchema = z.object({ captureId: z.string().uuid() }).strict();
export const screenshotCaptureParams = z.object({ captureId: z.string().uuid() });
export const screenshotQuerySchema = z.object({
  employeeId: id.optional(), deviceId: id.optional(), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }),
  page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(24),
}).refine(({ start, end }) => Date.parse(end) > Date.parse(start) && Date.parse(end) - Date.parse(start) <= 31 * 86400_000,
  { message: 'Choose a screenshot period of up to 31 days' });
export const ruleSchema = z.object({ kind: z.enum(['app', 'domain']), match: z.string().trim().toLowerCase().min(1).max(300),
  classification: z.enum(['productive', 'unproductive', 'neutral']) }).strict()
  .refine((data) => data.kind !== 'domain' || /^[a-z\d]+(?:[.-][a-z\d]+)*$/.test(data.match), { message: 'Use a domain name without URL paths' });
export const rotationSchema = z.object({ rotationId: z.string().uuid(), nextTokenHash: z.string().regex(/^[a-f\d]{64}$/) }).strict();
export const reportQuerySchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  employeeId: id.optional(),
}).refine(({ start, end }) => {
  const duration = Date.parse(end) - Date.parse(start);
  return duration > 0 && duration <= 7 * 86400_000;
}, { message: 'Choose a period between one second and seven days' });
export const timelineQuerySchema = reportQuerySchema.and(z.object({
  deviceId: id.optional(),
  type: z.enum(['currentwindow', 'afkstatus', 'web.tab.current']).optional(),
  app: z.string().trim().min(1).max(300).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['desc', 'asc']).default('desc'),
  cursor: z.string().max(80).refine((value) => {
    const [timestamp, cursorId, extra] = value.split('_');
    return !extra && z.iso.datetime().safeParse(timestamp).success && /^[a-f\d]{24}$/i.test(cursorId || '');
  }, { message: 'Invalid timeline cursor' }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}));
