import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import type { Construct } from 'constructs'
import { existsSync } from 'fs'

export interface SiteStackProps extends cdk.StackProps {
  /** Apex domain with an existing Route 53 hosted zone, e.g. `nswplanpath.com`. */
  domainName: string
  /** Built Vite output — `apps/web/dist`. */
  distDir: string
}

/**
 * Static hosting for `apps/web`: private S3 bucket behind CloudFront (OAC), an
 * ACM cert for the apex and `www`, and Route 53 aliases for both.
 *
 * Deployed to us-east-1 because CloudFront only accepts certificates from
 * there; keeping the whole stack in one region avoids cross-region references.
 * The chat API stays in ap-southeast-2.
 *
 * `www` 301s to the apex so there is one canonical origin for CORS.
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props)

    const { domainName } = props
    const wwwDomain = `www.${domainName}`

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName })

    const certificate = new acm.Certificate(this, 'SiteCert', {
      domainName,
      subjectAlternativeNames: [wwwDomain],
      validation: acm.CertificateValidation.fromDns(zone),
    })

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Pure build output — redeploying recreates it.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const wwwRedirect = new cloudfront.Function(this, 'WwwRedirect', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  if (req.headers.host && req.headers.host.value === '${wwwDomain}') {
    var qs = Object.keys(req.querystring).map(function (k) {
      return k + '=' + req.querystring[k].value;
    }).join('&');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${domainName}' + req.uri + (qs ? '?' + qs : '') } },
    };
  }
  return req;
}`),
    })

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      domainNames: [domainName, wwwDomain],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
        functionAssociations: [
          { function: wwwRedirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // SPA fallback: TanStack Router owns paths like /site/$propertyId, which
      // don't exist as objects. With OAC a missing key comes back as 403.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.seconds(0),
      })),
    })

    for (const recordName of [domainName, wwwDomain]) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
      const suffix = recordName === domainName ? 'Apex' : 'Www'
      new route53.ARecord(this, `Alias${suffix}A`, { zone, recordName, target })
      new route53.AaaaRecord(this, `Alias${suffix}Aaaa`, { zone, recordName, target })
    }

    // Every synth builds all stacks, so a missing dist must not break
    // `cdk deploy PlanPathChatStack`. `pnpm deploy:site` builds first.
    if (existsSync(props.distDir)) {
      // Hashed assets are immutable; index.html must always revalidate or a
      // deploy leaves users on a page pointing at deleted chunks.
      const assets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
        sources: [s3deploy.Source.asset(props.distDir, { exclude: ['index.html'] })],
        destinationBucket: bucket,
        cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
        prune: false,
        memoryLimit: 512,
      })
      const html = new s3deploy.BucketDeployment(this, 'DeployIndex', {
        sources: [s3deploy.Source.asset(props.distDir, { exclude: ['*', '!index.html'] })],
        destinationBucket: bucket,
        cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
        prune: false,
        distribution,
        distributionPaths: ['/*'],
      })
      html.node.addDependency(assets)
    } else {
      cdk.Annotations.of(this).addWarning(
        `${props.distDir} not found — site files will not be uploaded. Run pnpm deploy:site.`,
      )
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${domainName}` })
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName })
  }
}
