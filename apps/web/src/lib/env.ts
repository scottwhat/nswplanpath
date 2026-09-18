import { z } from 'zod'

/**
 * Fail loudly at boot rather than rendering a blank map. Validated at the
 * boundary like every other input (see CLAUDE.md §Conventions).
 *
 * Names match `.env.local` exactly — do not rename one without the other.
 */
const envSchema = z.object({
  VITE_MAPBOX_ACCESS_TOKEN: z.string().startsWith('pk.', 'Must be a Mapbox public token'),

  // Chat backend. All three are optional as a group: with none of them the
  // chat falls back to the local stub, with all of them it talks to the
  // deployed handler. A partial set is a misconfiguration and throws below.
  VITE_CHAT_API_URL: z.url().optional(),
  VITE_CHAT_IDENTITY_POOL_ID: z
    .string()
    .regex(/^[a-z0-9-]+:[0-9a-f-]{36}$/, 'Must look like <region>:<uuid>')
    .optional(),
  VITE_AWS_REGION: z.string().min(1).optional(),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  throw new Error(
    `Invalid environment:\n${z.prettifyError(parsed.error)}\n` +
      'Check apps/web/.env.local.',
  )
}

export const env = parsed.data

const chatVars = [
  env.VITE_CHAT_API_URL,
  env.VITE_CHAT_IDENTITY_POOL_ID,
  env.VITE_AWS_REGION,
]

if (chatVars.some(Boolean) && !chatVars.every(Boolean)) {
  throw new Error(
    'Invalid environment: VITE_CHAT_API_URL, VITE_CHAT_IDENTITY_POOL_ID and ' +
      'VITE_AWS_REGION must be set together (or all left blank to use the stub).\n' +
      'Check apps/web/.env.local.',
  )
}

/**
 * True once the chat can actually reach the backend. The client signs its
 * `POST /chat` with Cognito unauthenticated credentials, so the identity pool
 * id is as load-bearing as the URL — hence the all-or-nothing check above.
 */
export const agentConfigured = chatVars.every(Boolean)

/** Narrowed config for `agent.ts`, so it does not re-check the optionals. */
export const chatConfig = agentConfigured
  ? {
      apiUrl: env.VITE_CHAT_API_URL!,
      identityPoolId: env.VITE_CHAT_IDENTITY_POOL_ID!,
      region: env.VITE_AWS_REGION!,
    }
  : null
