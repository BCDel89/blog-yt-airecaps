import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AiRecapsBlogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Hosted Zone ---
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z0952735J1WRPSDNC5O6',
      zoneName: 'airecaps.com',
    });

    // --- ACM Certificate ---
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: 'airecaps.com',
      subjectAlternativeNames: ['www.airecaps.com'],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // --- S3 Bucket: airecaps-blog ---
    const blogBucket = new s3.Bucket(this, 'BlogBucket', {
      bucketName: 'airecaps-blog',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- CloudFront Function: blog-url-rewrite ---
    const urlRewriteFunction = new cloudfront.Function(this, 'BlogUrlRewriteFunction', {
      functionName: 'blog-url-rewrite',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Skip asset files
  if (uri.match(/\\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|xml|txt)$/)) {
    return request;
  }

  // Add trailing slash if missing
  if (!uri.endsWith('/')) {
    uri += '/';
  }

  // Append index.html
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  }

  return request;
}
      `.trim()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // --- S3 Blog Origin with OAC ---
    const blogOrigin = origins.S3BucketOrigin.withOriginAccessControl(blogBucket);

    // --- Amplify Default Origin ---
    const amplifyOrigin = new origins.HttpOrigin('d1ks49aoxclqfs.amplifyapp.com', {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      httpsPort: 443,
    });

    // --- CloudFront Distribution ---
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: ['airecaps.com', 'www.airecaps.com'],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      // Default behavior → Amplify
      defaultBehavior: {
        origin: amplifyOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: true,
      },

      // /blog/* behavior → S3
      additionalBehaviors: {
        '/blog/*': {
          origin: blogOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          functionAssociations: [
            {
              function: urlRewriteFunction,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
    });

    // --- Route53 A Records ---
    new route53.ARecord(this, 'ARecord', {
      zone: hostedZone,
      recordName: 'airecaps.com',
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    new route53.ARecord(this, 'WwwARecord', {
      zone: hostedZone,
      recordName: 'www.airecaps.com',
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    // --- IAM Deploy Role for GitHub Actions OIDC ---
    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidcProvider',
      `arn:aws:iam::273500459613:oidc-provider/token.actions.githubusercontent.com`
    );

    const deployRole = new iam.Role(this, 'BlogDeployRole', {
      roleName: 'airecaps-blog-deploy-role',
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub':
            'repo:BCDel89/blog-yt-airecaps:ref:refs/heads/main',
        },
      }),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [blogBucket.bucketArn, `${blogBucket.bucketArn}/*`],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::273500459613:distribution/${distribution.distributionId}`,
        ],
      })
    );

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Domain Name',
    });

    new cdk.CfnOutput(this, 'BlogBucketName', {
      value: blogBucket.bucketName,
      description: 'S3 Blog Bucket Name',
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'IAM Deploy Role ARN for GitHub Actions',
    });
  }
}
