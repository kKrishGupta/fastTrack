import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.preprocess(
  (value) => value === true || value === 'true',
  z.boolean(),
);

const optionalAppPassword = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.replace(/\s+/g, '');
    return normalized || undefined;
  },
  z.string().length(16, 'GMAIL_APP_PASSWORD must be the 16-character Google App Password').optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
    AUTH_COOKIE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    EMPLOYEE_INVITE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    GMAIL_USER: z.string().trim().email().optional(),
    GMAIL_APP_PASSWORD: optionalAppPassword,
    CHALLENGE_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    TRUST_PROXY: booleanFromString.default(false),
    ALLOW_TEST_FACE_ADAPTER: booleanFromString.default(false),
    DEV_LOCATION_ACCURACY_MAX: z.coerce.number().int().min(80).max(500).default(150),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.CLIENT_ORIGIN.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['CLIENT_ORIGIN'],
        message: 'CLIENT_ORIGIN must use HTTPS in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.ALLOW_TEST_FACE_ADAPTER) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOW_TEST_FACE_ADAPTER'],
        message: 'The development face adapter cannot be enabled in production',
      });
    }
    if (Boolean(value.GMAIL_USER) !== Boolean(value.GMAIL_APP_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: value.GMAIL_USER ? ['GMAIL_APP_PASSWORD'] : ['GMAIL_USER'],
        message: 'GMAIL_USER and GMAIL_APP_PASSWORD must be configured together',
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
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    clientOrigin: env.CLIENT_ORIGIN,
    mongoUri: env.MONGODB_URI,
    jwtSecret: env.JWT_SECRET,
    authCookieHours: env.AUTH_COOKIE_HOURS,
    employeeInviteHours: env.EMPLOYEE_INVITE_HOURS,
    gmailUser: env.GMAIL_USER,
    gmailAppPassword: env.GMAIL_APP_PASSWORD,
    challengeMinutes: env.CHALLENGE_MINUTES,
    trustProxy: env.TRUST_PROXY,
    allowTestFaceAdapter: env.ALLOW_TEST_FACE_ADAPTER,
    devLocationAccuracyMax: env.DEV_LOCATION_ACCURACY_MAX,
  });
}
