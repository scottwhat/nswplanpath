import { z } from 'zod'

/**
 * Contract for the conversational surface in front of the assess pipeline.
 * Shared by the web app and the deployed chat backend, so both sides validate
 * the same shape — see CLAUDE.md §Conventions.
 */

export const chatRoleSchema = z.enum(['user', 'assistant'])
export type ChatRole = z.infer<typeof chatRoleSchema>

/** The deployed `POST /chat` handler rejects anything longer. */
export const MAX_QUESTION_LENGTH = 500

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  /** Free text until the site-resolution service can return a propertyId. */
  address: z.string().nullable(),
})
export type ChatRequest = z.infer<typeof chatRequestSchema>

export const chatReplySchema = z.object({
  reply: z.string(),
  /** True when the response came from the local placeholder, not the engine. */
  stub: z.boolean().default(false),
  /** Questions left on today's per-user allowance, when the backend said. */
  remaining: z.number().int().nonnegative().optional(),
})
export type ChatReply = z.infer<typeof chatReplySchema>

/**
 * `POST /chat` is a credential broker, not a chat endpoint: it enforces the
 * daily quota and the kill switch, then hands back short-lived credentials
 * scoped to a single `bedrock-agentcore:InvokeHarness` call. The browser makes
 * that second call itself, which is why the token is in the response body.
 */
export const chatSessionSchema = z.object({
  remaining: z.number().int().nonnegative(),
  harnessArn: z.string().min(1),
  harnessRegion: z.string().min(1),
  kbGatewayArn: z.string().nullable().default(null),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().min(1),
    expiration: z.string().optional(),
  }),
})
export type ChatSession = z.infer<typeof chatSessionSchema>

/** Shape of the handler's error responses (quota, kill switch, bad request). */
export const chatErrorSchema = z.object({
  error: z.string(),
  remaining: z.number().int().nonnegative().optional(),
  scope: z.enum(['user', 'global']).optional(),
})
