import * as cdk from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import * as path from 'path'

export interface ChatStackProps extends cdk.StackProps {
  /** Origins allowed to call `POST /chat` — local dev plus any deployed site. */
  allowedOrigins: string[]
  /**
   * Bare harness ARN — `arn:aws:bedrock-agentcore:<region>:<account>:harness/<name>`.
   *
   * It must NOT carry the `/harness-endpoint/<name>` suffix the AgentCore console
   * shows. `InvokeHarnessCommand` rejects that form with
   * `ValidationException: Invalid harness ARN format` (verified against this
   * harness); `bin/infra.ts` strips it so either form can be pasted in.
   */
  harnessArn: string
  /** Region the harness lives in. AgentCore harnesses are region-scoped and this
   * stack's own region differs — the API is in ap-southeast-2, the harness in
   * us-east-1. */
  harnessRegion: string
  /** Optional AgentCore Gateway fronting the Knowledge Base, passed through to
   * the browser for display/debugging. The harness calls it itself. */
  kbGatewayArn?: string
  /** Questions per Cognito identity per UTC day. */
  userDailyQuota?: number
  /** Questions across all identities per UTC day — the real spend ceiling. */
  globalDailyQuota?: number
}

/**
 * The conversational surface in front of the (not yet built) assess pipeline.
 *
 * `POST /chat` is a credential broker, not a chat endpoint. The browser signs
 * it SigV4 with Cognito *unauthenticated* credentials; the handler checks the
 * kill switch, atomically consumes both quotas, then mints a 15-minute STS
 * credential that can do exactly one thing — invoke this one harness — and
 * returns it. The browser then calls `InvokeHarness` directly and streams the
 * answer.
 *
 * The harness call deliberately does not go through this API: API Gateway caps
 * an integration at 29 seconds, which a harness doing Knowledge Base retrieval
 * can exceed, and a Lambda proxy would have to buffer the stream anyway.
 *
 * This is NOT the `POST /assess` pipeline in SYSTEM_DESIGN.md §1. The rules
 * engine does not exist yet, so nothing this returns is authoritative and every
 * reply carries the disclaimer (CLAUDE.md rule 7).
 */
export class ChatStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ChatStackProps) {
    super(scope, id, props)

    const userDailyQuota = props.userDailyQuota ?? 3
    const globalDailyQuota = props.globalDailyQuota ?? 200

    if (/\/harness-endpoint\//.test(props.harnessArn)) {
      throw new Error(
        `harnessArn must be the bare harness ARN, not the endpoint-qualified form: ${props.harnessArn}`,
      )
    }

    // -- Quota counters --------------------------------------------------
    // One row per (identity, UTC date) and one per (GLOBAL, UTC date). Pure
    // counters with a TTL, so losing the table costs nothing but a reset.
    const quotaTable = new dynamodb.Table(this, 'ChatQuotaTable', {
      partitionKey: { name: 'quotaKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // -- Kill switch -----------------------------------------------------
    // 'enabled' | 'disabled'. Flip with `aws ssm put-parameter --overwrite`
    // for an immediate hard stop with no redeploy.
    const killSwitchParam = new ssm.StringParameter(this, 'ChatKillSwitch', {
      parameterName: '/planpath/chat/enabled',
      stringValue: 'enabled',
      description: "Set to 'disabled' to hard-stop the PlanPath chat endpoint without a redeploy.",
    })

    // -- Cognito unauthenticated identity pool ---------------------------
    // No login: the identity id exists only to key the per-user quota, and it
    // survives page reloads. API Gateway's IAM authorizer verifies the request
    // really came from that identity's credentials, so the quota can't be
    // bypassed by forging an id in the body.
    const identityPool = new cognito.CfnIdentityPool(this, 'ChatIdentityPool', {
      allowUnauthenticatedIdentities: true,
    })

    const unauthRole = new iam.Role(this, 'ChatUnauthRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    })

    new cognito.CfnIdentityPoolRoleAttachment(this, 'ChatIdentityPoolRoles', {
      identityPoolId: identityPool.ref,
      roles: { unauthenticated: unauthRole.roleArn },
    })

    // -- Broker Lambda ---------------------------------------------------
    // Touches DynamoDB, SSM and STS only — never Bedrock — so it stays fast
    // and well inside the 29s integration ceiling.
    const chatFn = new nodejs.NodejsFunction(this, 'ChatHandler', {
      entry: path.join(__dirname, '..', 'lambda', 'chat-handler.ts'),
      handler: 'handler',
      // CLAUDE.md §Stack says Node 20, but nodejs20.x was deprecated on 2026-04-30
      // and Lambda disables creation of new 20.x functions from 2027-02-01.
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        QUOTA_TABLE: quotaTable.tableName,
        KILL_SWITCH_PARAM: killSwitchParam.parameterName,
        HARNESS_ARN: props.harnessArn,
        HARNESS_REGION: props.harnessRegion,
        ...(props.kbGatewayArn ? { KB_GATEWAY_ARN: props.kbGatewayArn } : {}),
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
        USER_DAILY_QUOTA: userDailyQuota.toString(),
        GLOBAL_DAILY_QUOTA: globalDailyQuota.toString(),
        // CHAT_SESSION_ROLE_ARN is added below: the session role must trust
        // this function's own execution role, which only exists once the
        // function has been constructed. Setting it here would be circular.
      },
      bundling: { minify: true, sourceMap: false },
    })

    quotaTable.grantReadWriteData(chatFn)
    killSwitchParam.grantRead(chatFn)

    // -- Session role ----------------------------------------------------
    // Assumed per request by the broker, only after the quota and kill-switch
    // checks pass. Granting InvokeHarness here rather than on the Cognito
    // unauth role directly is what makes the quota gate mean anything: a
    // browser's own credentials can never reach the harness, only the token
    // the broker mints after metering the question.
    const chatSessionRole = new iam.Role(this, 'ChatSessionRole', {
      assumedBy: new iam.ArnPrincipal(chatFn.role!.roleArn),
    })

    // Both actions are required for a single InvokeHarnessCommand: harnesses
    // run on top of the agent-runtime API, so AgentCore authorizes against
    // InvokeAgentRuntime as well as InvokeHarness. Granting only one produces
    // an AccessDeniedException naming the other.
    chatSessionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:InvokeHarness'],
        resources: [props.harnessArn],
      }),
    )
    chatSessionRole.grantAssumeRole(chatFn.role!)
    chatFn.addEnvironment('CHAT_SESSION_ROLE_ARN', chatSessionRole.roleArn)

    // -- HTTP API --------------------------------------------------------
    const httpApi = new apigwv2.HttpApi(this, 'ChatApi', {
      corsPreflight: {
        allowOrigins: props.allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization', 'x-amz-date', 'x-amz-security-token'],
      },
    })

    httpApi.addRoutes({
      path: '/chat',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2Integrations.HttpLambdaIntegration('ChatIntegration', chatFn),
      authorizer: new apigwv2Authorizers.HttpIamAuthorizer(),
    })

    // The unauth role's entire permission set: invoke this one route.
    unauthRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.httpApiId}/*/POST/chat`,
        ],
      }),
    )

    // Values for apps/web/.env.local — VITE_CHAT_API_URL and
    // VITE_CHAT_IDENTITY_POOL_ID respectively.
    new cdk.CfnOutput(this, 'ChatApiUrl', { value: httpApi.apiEndpoint })
    new cdk.CfnOutput(this, 'ChatIdentityPoolId', { value: identityPool.ref })
    new cdk.CfnOutput(this, 'HarnessArn', { value: props.harnessArn })
    new cdk.CfnOutput(this, 'KillSwitchParam', { value: killSwitchParam.parameterName })
  }
}
