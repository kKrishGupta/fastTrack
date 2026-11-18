import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.preprocess(
  (value) => value === true || value === 'true',
  z.boolean(),
);

const optionalOriginList = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const origins = value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    return origins.length ? origins : undefined;
  },
  z.array(z.string().url()).min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    ALLOWED_ORIGINS: optionalOriginList,
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
    AUTH_COOKIE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    EMPLOYEE_INVITE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    RESEND_API_KEY: z.string().trim().min(10, 'RESEND_API_KEY is invalid').optional(),
    RESEND_FROM_EMAIL: z.string().trim().email().optional(),
    CHALLENGE_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    TRUST_PROXY: booleanFromString.default(false),
    ALLOW_TEST_FACE_ADAPTER: booleanFromString.default(false),
    ALLOW_DEMO_FACE_ADAPTER: booleanFromString.default(false),
    DEV_LOCATION_ACCURACY_MAX: z.coerce.number().int().min(80).max(500).default(150),
  })
  .superRefine((value, context) => {
    const allowedOrigins = [value.CLIENT_ORIGIN, ...(value.ALLOWED_ORIGINS || [])];
    if (value.NODE_ENV === 'production' && allowedOrigins.some((origin) => !origin.startsWith('https://'))) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'CLIENT_ORIGIN and every ALLOWED_ORIGINS entry must use HTTPS in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.ALLOW_TEST_FACE_ADAPTER) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOW_TEST_FACE_ADAPTER'],
        message: 'The development face adapter cannot be enabled in production',
      });
    }
    if (Boolean(value.RESEND_API_KEY) !== Boolean(value.RESEND_FROM_EMAIL)) {
      context.addIssue({
        code: 'custom',
        path: value.RESEND_API_KEY ? ['RESEND_FROM_EMAIL'] : ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured together',
      });
    }
  });

export function loadConfig(source = process.env) {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = result.data;
  const clientOrigin = env.CLIENT_ORIGIN.replace(/\/$/, '');
  const allowedOrigins = [...new Set([clientOrigin, ...(env.ALLOWED_ORIGINS || [])])];
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    clientOrigin,
    allowedOrigins: Object.freeze(allowedOrigins),
    mongoUri: env.MONGODB_URI,
    jwtSecret: env.JWT_SECRET,
    authCookieHours: env.AUTH_COOKIE_HOURS,
    employeeInviteHours: env.EMPLOYEE_INVITE_HOURS,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    challengeMinutes: env.CHALLENGE_MINUTES,
    trustProxy: env.TRUST_PROXY,
    allowTestFaceAdapter: env.ALLOW_TEST_FACE_ADAPTER,
    allowDemoFaceAdapter: env.ALLOW_DEMO_FACE_ADAPTER,
    devLocationAccuracyMax: env.DEV_LOCATION_ACCURACY_MAX,
  });
}
