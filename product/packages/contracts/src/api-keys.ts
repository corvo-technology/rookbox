import * as z from "zod";

export const API_KEY_NAME_MAX_LENGTH = 48;

/** Every key starts with this, so a leaked one is easy to recognise in logs and scanners. */
export const API_KEY_PREFIX = "rbx_";

export const ApiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH),
  /** The first characters of the secret, enough to tell keys apart. The secret is never stored. */
  hint: z.string().startsWith(API_KEY_PREFIX),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyInput = z.object({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH),
});

/** The only response that carries the secret. */
export const CreatedApiKeySchema = z.object({
  key: ApiKeySchema,
  secret: z.string().startsWith(API_KEY_PREFIX),
});
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;

export const RevokeApiKeyInput = z.object({ id: z.string().min(1) });
