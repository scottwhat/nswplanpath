// `POST /chat` — a credential broker, not a chat endpoint.
//
// This Lambda never calls Bedrock and never sees the answer. It does the part
// that has to stay server-side: check the kill switch, atomically consume the
// per-identity and site-wide daily quotas, then mint a short-lived STS
// credential scoped to `InvokeHarness` on one harness ARN and hand it to the
// browser, which makes the streaming call itself.
//
// The gate holds because a client never possesses a credential capable of
// invoking the harness until this handler issues one.
//
// Accepted trade-off: 900s is the STS minimum session duration, so one
// quota-cleared exchange could technically drive more than one harness call
// inside that window. Bounded, and every *new* session re-clears the gate.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type {
  APIGatewayProxyEventV2WithIAMAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'

/**
 * `@types/aws-lambda` declares `iam.cognitoIdentity` as `null`, which is only
 * true for callers signing with plain IAM credentials. A request signed with
 * credentials federated through a Cognito identity pool — which is every
 * request this route accepts — carries the identity block, and that identityId
 * is the per-user quota key. Narrow it back to what API Gateway actually
 * sends rather than casting at the use site.
 */
type ChatEvent = Omit<APIGatewayProxyEventV2WithIAMAuthorizer, 'requestContext'> & {
  requestContext: Omit<
    APIGatewayProxyEventV2WithIAMAuthorizer['requestContext'],
    'authorizer'
  > & {
    authorizer: {
      iam: { cognitoIdentity: { identityId: string; identityPoolId: string } | null }
    }
  }
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ssm = new SSMClient({})
const sts = new STSClient({})

const QUOTA_TABLE = process.env.QUOTA_TABLE!
const KILL_SWITCH_PARAM = process.env.KILL_SWITCH_PARAM!
const HARNESS_ARN = process.env.HARNESS_ARN!
const HARNESS_REGION = process.env.HARNESS_REGION ?? 'us-east-1'
const KB_GATEWAY_ARN = process.env.KB_GATEWAY_ARN
const CHAT_SESSION_ROLE_ARN = process.env.CHAT_SESSION_ROLE_ARN!

const USER_DAILY_QUOTA = parseInt(process.env.USER_DAILY_QUOTA ?? '3', 10)
const GLOBAL_DAILY_QUOTA = parseInt(process.env.GLOBAL_DAILY_QUOTA ?? '200', 10)
const GLOBAL_QUOTA_KEY = 'GLOBAL'

/** Two days, comfortably past the UTC-date rollover the keys are cut on. */
const QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60
/** The AWS minimum for AssumeRole; it cannot be issued shorter. */
const SESSION_DURATION_SECONDS = 900
/** Mirrors MAX_QUESTION_LENGTH in packages/shared/src/chat.ts. */
const MAX_QUESTION_LENGTH = 500

/** Comma-separated. API Gateway answers preflights itself; these headers cover
 * the actual POST, where the browser needs its own origin echoed back — a
 * single fixed origin would break every other allowed one. */
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
)

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'content-type,authorization,x-amz-date,x-amz-security-token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    Vary: 'Origin',
  }
}

function json(
  statusCode: number,
  body: unknown,
  origin: string | undefined,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    body: JSON.stringify(body),
  }
}

async function killSwitchEnabled(): Promise<boolean> {
  const res = await ssm.send(new GetParameterCommand({ Name: KILL_SWITCH_PARAM }))
  return res.Parameter?.Value === 'enabled'
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Check-and-increment in one conditional write, so two concurrent requests
 * can't both pass when the counter sits one below its limit. Same table for
 * both quotas — only the partition key and the limit differ.
 */
async function checkAndConsume(
  quotaKey: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const ttl = Math.floor(Date.now() / 1000) + QUOTA_TTL_SECONDS

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: QUOTA_TABLE,
        Key: { quotaKey },
        UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':limit': limit, ':ttl': ttl },
        ReturnValues: 'ALL_NEW',
      }),
    )
    const count = (res.Attributes?.count as number) ?? limit
    return { allowed: true, remaining: Math.max(0, limit - count) }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      return { allowed: false, remaining: 0 }
    }
    throw err
  }
}

async function issueHarnessSession(identityId: string) {
  // Cognito ids look like "ap-southeast-2:5e0a8a6b-…", but RoleSessionName
  // only accepts [\w+=,.@-]. Substitute rather than drop, so CloudTrail still
  // traces a session back to the identity that asked for it.
  const sessionName = identityId.replace(/[^\w+=,.@-]/g, '_').slice(0, 64)

  const res = await sts.send(
    new AssumeRoleCommand({
      RoleArn: CHAT_SESSION_ROLE_ARN,
      RoleSessionName: sessionName,
      DurationSeconds: SESSION_DURATION_SECONDS,
    }),
  )
  if (!res.Credentials) throw new Error('AssumeRole returned no credentials')
  return res.Credentials
}

export const handler = async (
  event: ChatEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const origin = event.headers.origin
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' }
  }

  const identityId = event.requestContext.authorizer.iam.cognitoIdentity?.identityId
  if (!identityId) return json(403, { error: 'Missing Cognito identity' }, origin)

  if (!(await killSwitchEnabled())) {
    return json(503, { error: 'The assistant is temporarily disabled.' }, origin)
  }

  let body: { question?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin)
  }

  const { question } = body
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return json(400, {
      error: `Request must include a "question" (max ${MAX_QUESTION_LENGTH} chars).`,
    }, origin)
  }

  // Site-wide cap first, so a globally throttled day doesn't burn one of this
  // user's own questions for an answer they were never going to get.
  const globalQuota = await checkAndConsume(`${GLOBAL_QUOTA_KEY}#${todayUtc()}`, GLOBAL_DAILY_QUOTA)
  if (!globalQuota.allowed) {
    return json(429, {
      error: 'Questions have been exhausted for today across all users. Try again tomorrow.',
      scope: 'global',
    }, origin)
  }

  const quota = await checkAndConsume(`${identityId}#${todayUtc()}`, USER_DAILY_QUOTA)
  if (!quota.allowed) {
    return json(429, {
      error: `Daily question limit reached (${USER_DAILY_QUOTA}/day). Try again tomorrow.`,
      remaining: 0,
      scope: 'user',
    }, origin)
  }

  try {
    const credentials = await issueHarnessSession(identityId)
    return json(200, {
      remaining: quota.remaining,
      harnessArn: HARNESS_ARN,
      harnessRegion: HARNESS_REGION,
      kbGatewayArn: KB_GATEWAY_ARN ?? null,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
        expiration: credentials.Expiration?.toISOString(),
      },
    }, origin)
  } catch (err) {
    console.error('Failed to issue harness session', err)
    return json(502, {
      error: 'The assistant is unavailable right now. Try again shortly.',
      remaining: quota.remaining,
    }, origin)
  }
}
