#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ChatStack } from '../lib/chat-stack'

/**
 * The AgentCore console shows a harness's ARN endpoint-qualified:
 *
 *   arn:aws:bedrock-agentcore:us-east-1:<acct>:harness/<name>/harness-endpoint/DEFAULT
 *
 * `InvokeHarnessCommand` rejects that with "ValidationException: Invalid
 * harness ARN format" — it wants the bare harness ARN, with the endpoint given
 * separately via `qualifier` when it isn't DEFAULT. Strip it here so the
 * console's copy button produces a working config.
 */
function bareHarnessArn(arn: string): string {
  return arn.replace(/\/harness-endpoint\/[^/]+$/, '')
}

const app = new cdk.App()

const DOMAIN = 'nswplanpath.com'

new ChatStack(app, 'PlanPathChatStack', {
  // CLAUDE.md §Stack pins this project to ap-southeast-2. The harness itself
  // lives in us-east-1 — see harnessRegion below.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-southeast-2' },

  // The handler echoes back whichever of these the request came from. A dev
  // server on any other port is blocked by CORS — Vite's default is 5173 and
  // it falls through to 5174 when that is taken. www 301s to the apex, so it
  // never calls the API itself.
  allowedOrigins: [`https://${DOMAIN}`, 'http://localhost:5173', 'http://localhost:5174'],

  harnessArn: bareHarnessArn(
    'arn:aws:bedrock-agentcore:us-east-1:403903769495:harness/nswplanningpathways-qQEuV1iR6r/harness-endpoint/DEFAULT',
  ),
  harnessRegion: 'us-east-1',

  userDailyQuota: 3,
  globalDailyQuota: 200,
})

// The frontend is hosted on AWS Amplify (see amplify.yml at the repo root), not
// in CDK. lib/site-stack.ts is the retired S3 + CloudFront alternative; don't
// instantiate it alongside Amplify — both would claim the same DNS records.
