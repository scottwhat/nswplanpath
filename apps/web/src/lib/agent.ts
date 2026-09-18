import {
  BedrockAgentCoreClient,
  InvokeHarnessCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'
import {
  chatErrorSchema,
  chatSessionSchema,
  MAX_QUESTION_LENGTH,
  type ChatReply,
  type ChatRequest,
} from '@planpath/shared'
import { AwsClient } from 'aws4fetch'
import { chatConfig } from './env'

/**
 * Two hops, because that is how the deployed backend is shaped:
 *
 *   1. `POST /chat`, SigV4-signed with Cognito *unauthenticated* credentials.
 *      This is a broker: it checks the kill switch and the per-identity and
 *      global daily quotas, then returns 15-minute credentials scoped to one
 *      `bedrock-agentcore:InvokeHarness` action.
 *   2. `InvokeHarness` against the AgentCore harness in `us-east-1` (note: a
 *      different region to the API), streamed straight into the UI.
 *
 * The harness owns its own system prompt, model and Knowledge Base gateway, so
 * the client sends only the user's question. This is NOT the `POST /assess`
 * pipeline in SYSTEM_DESIGN.md §1 — the rules engine does not exist yet, so
 * nothing here is authoritative and every reply carries the disclaimer.
 */

const STUB_REPLY = [
  "I'm not connected to the assessment engine yet — this is the frontend shell.",
  '',
  'Once the site-resolution service and the assess Lambda are wired up, a question like this will come back with a pathway (exempt / CDC / DA), the criteria that decided it, and citations to the actual instrument text.',
  'Nothing here is a planning verdict, and I will not guess one.',
].join('\n')

/** Cognito hands out a guest identity per browser; the provider caches it. */
const credentials = chatConfig
  ? fromCognitoIdentityPool({
      identityPoolId: chatConfig.identityPoolId,
      clientConfig: { region: chatConfig.region },
    })
  : null

/**
 * The backend takes a single `question` string and nothing else, so the address
 * has to ride along in the text. Budget for the prefix first — truncating the
 * address would be worse than truncating the question, since a half-written
 * address could silently point the answer at the wrong lot.
 */
export function composeQuestion({ message, address }: ChatRequest): string {
  const question = message.trim()
  if (!address) return question.slice(0, MAX_QUESTION_LENGTH)

  const prefix = `Property: ${address}\n\n`
  if (prefix.length + question.length <= MAX_QUESTION_LENGTH) return prefix + question
  return question.slice(0, MAX_QUESTION_LENGTH)
}

/** Turns the handler's JSON errors into something worth showing a user. */
async function describeFailure(response: Response): Promise<string> {
  const parsed = chatErrorSchema.safeParse(await response.json().catch(() => null))
  if (parsed.success) return parsed.data.error
  if (response.status === 403) return 'The chat backend rejected this session.'
  return `Chat request failed: ${response.status} ${response.statusText}`
}

export interface AskAgentOptions {
  /** Called with each text delta so the panel can render as it streams. */
  onDelta?: (text: string) => void
  /** Called when text already streamed is discarded (see askAgent). */
  onReset?: () => void
  signal?: AbortSignal
}

export async function askAgent(
  request: ChatRequest,
  options: AskAgentOptions = {},
): Promise<ChatReply> {
  if (!chatConfig || !credentials) {
    // Small delay so the typing indicator is exercised in the real code path.
    await new Promise((resolve) => setTimeout(resolve, 600))
    return { reply: STUB_REPLY, stub: true }
  }

  const question = composeQuestion(request)

  const signer = new AwsClient({
    ...(await credentials()),
    service: 'execute-api',
    region: chatConfig.region,
    // The broker's 429 is a quota verdict, not a transient failure. aws4fetch
    // retries 429 ten times by default, which turns "you are out of questions"
    // into half a minute of a silent spinner.
    retries: 0,
  })

  const response = await signer.fetch(`${chatConfig.apiUrl}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: options.signal,
  })

  if (!response.ok) throw new Error(await describeFailure(response))

  const session = chatSessionSchema.parse(await response.json())

  const client = new BedrockAgentCoreClient({
    region: session.harnessRegion,
    credentials: {
      accessKeyId: session.credentials.accessKeyId,
      secretAccessKey: session.credentials.secretAccessKey,
      sessionToken: session.credentials.sessionToken,
      expiration: session.credentials.expiration
        ? new Date(session.credentials.expiration)
        : undefined,
    },
  })

  // A fresh session id per question: the backend meters one question at a
  // time, and the assess contract in SYSTEM_DESIGN.md §1 is stateless anyway.
  const { stream } = await client.send(
    new InvokeHarnessCommand({
      harnessArn: session.harnessArn,
      runtimeSessionId: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      messages: [{ role: 'user', content: [{ text: question }] }],
    }),
    { abortSignal: options.signal },
  )

  if (!stream) throw new Error('The assistant returned no response stream.')

  let reply = ''
  for await (const event of stream) {
    if (event.validationException) throw new Error(event.validationException.message)
    if (event.internalServerException)
      throw new Error(event.internalServerException.message ?? 'The assistant failed.')
    if (event.runtimeClientError)
      throw new Error(event.runtimeClientError.message ?? 'The assistant failed.')

    // Text written before a tool call is the model narrating its own process
    // ("let me search the knowledge base…"), which the prompt forbids but does
    // not reliably prevent. Only text after the last tool call is the answer.
    if (event.contentBlockStart?.start?.toolUse) {
      if (reply) options.onReset?.()
      reply = ''
      continue
    }

    const text = event.contentBlockDelta?.delta?.text
    if (text) {
      reply += text
      options.onDelta?.(text)
    }
  }

  if (!reply.trim()) throw new Error('The assistant returned an empty response.')

  return { reply, stub: false, remaining: session.remaining }
}
