import { z } from 'zod';
import { USER_ROLES } from './domainTypes';

export const authResponseSchema = z.object({
  valid: z.boolean().optional(), success: z.boolean().optional(), csrfToken: z.string().min(1).optional(),
  user: z.object({ role: z.enum(USER_ROLES), partnerId: z.string().uuid().nullish().transform(value => value ?? undefined), clientId: z.string().uuid().nullish().transform(value => value ?? undefined) }).optional(),
  error: z.string().optional(), message: z.string().optional(), locked_until: z.string().optional(), attempts_remaining: z.number().int().optional(),
}).passthrough().refine(data => !(data.valid || (data.success && data.csrfToken)) || Boolean(data.user && data.csrfToken), 'Incomplete authenticated session');
export type AuthResponse = z.infer<typeof authResponseSchema>;
