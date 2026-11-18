import { z } from 'zod';

const workspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only');

export const loginSchema = z.object({
  workspaceSlug: workspaceSlugSchema,
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(256),
});

export const registerOrganizationSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  workspaceSlug: workspaceSlugSchema,
  adminName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(256),
});

export const invitationTokenParamsSchema = z.object({
  token: z.string().trim().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(10).max(256),
  biometricConsent: z.literal(true, { error: 'Biometric attendance consent is required' }),
});
