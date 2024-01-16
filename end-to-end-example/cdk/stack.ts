/**
 * Copyright Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Passwordless } from "amazon-cognito-passwordless-auth/cdk";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import * as fs from "fs";
import * as path from "path";

/** Get custom config from env var file */
const { sesFromAddress, stackName } = readEnvFile();

class End2EndExampleStack extends cdk.Stack {
  passwordless: Passwordless;
  constructor(scope?: Construct, id?: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const spa = cloudfrontServedEmptySpaBucket(this, "ExampleSpa");
    this.passwordless = new Passwordless(this, "Passwordless", {
      allowedOrigins: [
        "http://localhost:5173",
        `https://${spa.distribution.distributionDomainName}`,
      ],
      clientMetadataTokenKeys: ["consent_id"],
      magicLink: {
        sesFromAddress,
        secretsTableProps: {
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        },
      },
      userPoolProps: {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
      fido2: {
        authenticatorsTableProps: {
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        },
        relyingPartyName: "Passwordless Fido2 Example",
        allowedRelyingPartyIds: [
          "localhost",
          spa.distribution.distributionDomainName,
        ],
        attestation: "none",
        userVerification: "required",
        updatedCredentialsNotification: {
          sesFromAddress,
        },
      },
      smsOtpStepUp: {},
      userPoolClientProps: {
        // perrty short so you see token refreshes in action often:
        idTokenValidity: cdk.Duration.minutes(5),
        accessTokenValidity: cdk.Duration.minutes(5),
        refreshTokenValidity: cdk.Duration.hours(1),
        // while testing/experimenting it's best to set this to false,
        // so that when you try to sign in with a user that doesn't exist,
        // Cognito will tell you that––and you don't wait for a magic link
        // that will never arrive in your inbox:
        preventUserExistenceErrors: false,
      },
      // while testing/experimenting it's heplful to see e.g. full request details in logs:
      logLevel: "DEBUG",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.passwordless.userPool.userPoolId,
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.passwordless.userPoolClients!.at(0)!.userPoolClientId,
    });
    new cdk.CfnOutput(this, "Fido2Url", {
      value: this.passwordless.fido2Api!.url,
    });
    new cdk.CfnOutput(this, "SpaUrl", {
      value: `https://${spa.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "SpaBucket", {
      value: spa.bucket.bucketName,
    });
  }
}

const app = new cdk.App();
const stack = new End2EndExampleStack(app, stackName);

NagSuppressions.addStackSuppressions(stack, [
  {
    id: "AwsSolutions-IAM4",
    reason: "Allow curated list of Managed Policies",
    appliesTo: [
      "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs",
    ],
  },
  {
    id: "AwsSolutions-IAM5",
    reason: "Allow query table indexes",
    appliesTo: [
      `Resource::<${stack.getLogicalId(
        stack.passwordless.authenticatorsTable!.node
          .defaultChild as cdk.CfnElement
      )}.Arn>/index/*`,
    ],
  },
  {
    id: "AwsSolutions-IAM5",
    reason: "Allow signing with *any* key via its alias",
    appliesTo: [
      "Resource::arn:<AWS::Partition>:kms:<AWS::Region>:<AWS::AccountId>:key/*",
    ],
  },
]);
NagSuppressions.addResourceSuppressions(
  stack.passwordless.createAuthChallengeFn,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "Allow ses:sendMail to *",
      appliesTo: [
        "Resource::arn:<AWS::Partition>:ses:<AWS::Region>:<AWS::AccountId>:identity/*",
      ],
    },
  ],
  true
);
if (stack.passwordless.fido2NotificationFn) {
  NagSuppressions.addResourceSuppressions(
    stack.passwordless.fido2NotificationFn,
    [
      {
        id: "AwsSolutions-IAM5",
        reason: "Allow ses:sendMail to *",
        appliesTo: [
          "Resource::arn:<AWS::Partition>:ses:<AWS::Region>:<AWS::AccountId>:identity/*",
        ],
      },
    ],
    true
  );
}
NagSuppressions.addResourceSuppressions(
  stack.passwordless.userPool,
  [
    { id: "AwsSolutions-COG2", reason: "Don't require Cognito MFA" },
    {
      id: "AwsSolutions-COG3",
      reason: "Don't require Cognito Advanced Security",
    },
  ],
  true
);
NagSuppressions.addResourceSuppressions(
  stack.passwordless.secretsTable!,
  [
    {
      id: "AwsSolutions-DDB3",
      reason: "Don't need recovery for temporary hashes",
    },
  ],
  true
);
NagSuppressions.addResourceSuppressionsByPath(
  stack,
  [
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/sign-in-challenge/OPTIONS/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/sign-in-challenge/POST/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/register-authenticator/start/OPTIONS/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/register-authenticator/complete/OPTIONS/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/authenticators/list/OPTIONS/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/authenticators/delete/OPTIONS/Resource`,
    `/${stack.node.id}/Passwordless/RestApiPasswordless/Default/authenticators/update/OPTIONS/Resource`,
  ],
  [
    {
      id: "AwsSolutions-APIG4",
      reason: "These are public methods by intention",
    },
    {
      id: "AwsSolutions-COG4",
      reason: "These are public methods by intention",
    },
  ]
);
[
  stack.passwordless.fido2Fn,
  stack.passwordless.fido2challengeFn,
  stack.passwordless.fido2NotificationFn,
  stack.passwordless.preSignUpFn,
  stack.passwordless.preTokenGenerationFn,
  stack.passwordless.defineAuthChallengeResponseFn,
  stack.passwordless.createAuthChallengeFn,
  stack.passwordless.verifyAuthChallengeResponseFn,
].forEach(
  (fn) =>
    fn &&
    NagSuppressions.addResourceSuppressions(fn, [
      {
        id: "AwsSolutions-L1",
        reason:
          "These functions use NODEJS_LATEST runtime pointer, which may lag slightly behind the actual latest runtime.",
      },
    ])
);

cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

export function cloudfrontServedEmptySpaBucket(
  scope: Construct,
  id: string,
  props?: {
    bucketName?: string;
    domainNames?: string[];
    certificate?: cdk.aws_certificatemanager.ICertificate;
    webAclId?: string;
  }
) {
  const bucket = new cdk.aws_s3.Bucket(scope, `${id}Bucket`, {
    bucketName: props?.bucketName,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
    encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
    autoDeleteObjects: true,
    versioned: true,
  });
  bucket.addToResourcePolicy(
    new cdk.aws_iam.PolicyStatement({
      sid: "EnforceTLS",
      effect: cdk.aws_iam.Effect.DENY,
      principals: [new cdk.aws_iam.AnyPrincipal()],
      actions: ["s3:*"],
      resources: [bucket.bucketArn, bucket.bucketArn + "/*"],
      conditions: { Bool: { "aws:SecureTransport": "false" } },
    })
  );
  NagSuppressions.addResourceSuppressions(
    [bucket],
    [
      {
        id: "AwsSolutions-S1",
        reason:
          "The S3 Bucket has server access logs disabled––Not a concern for example stack",
      },
    ]
  );
  const originAccessIdentity = new cdk.aws_cloudfront.OriginAccessIdentity(
    scope,
    `${id}OAI`
  );
  const distribution = new cdk.aws_cloudfront.Distribution(
    scope,
    `${id}Distribution`,
    {
      defaultBehavior: {
        origin: new cdk.aws_cloudfront_origins.S3Origin(bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy:
          cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: new cdk.aws_cloudfront.ResponseHeadersPolicy(
          scope,
          `Headers${id}`,
          {
            securityHeadersBehavior: {
              contentSecurityPolicy: {
                contentSecurityPolicy:
                  "default-src 'self'; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com; img-src *;",
                override: true,
              },
              contentTypeOptions: {
                override: true,
              },
              frameOptions: {
                frameOption: cdk.aws_cloudfront.HeadersFrameOption.DENY,
                override: true,
              },
              referrerPolicy: {
                referrerPolicy:
                  cdk.aws_cloudfront.HeadersReferrerPolicy.SAME_ORIGIN,
                override: true,
              },
              strictTransportSecurity: {
                includeSubdomains: true,
                override: true,
                preload: true,
                accessControlMaxAge: cdk.Duration.days(365),
              },
              xssProtection: {
                override: true,
                protection: true,
                modeBlock: true,
              },
            },
          }
        ),
      },
      defaultRootObject: "index.html",
      errorResponses: [{ httpStatus: 403, responsePagePath: "/index.html" }],
      domainNames: props?.domainNames,
      certificate: props?.certificate,
      webAclId: props?.webAclId,
    }
  );
  NagSuppressions.addResourceSuppressions(
    [distribution],
    [
      {
        id: "AwsSolutions-CFR1",
        reason:
          "The CloudFront distribution may require Geo restrictions.––No concern for example stack",
      },
      {
        id: "AwsSolutions-CFR2",
        reason:
          "The CloudFront distribution may require integration with AWS WAF.––No concern for example stack",
      },
      {
        id: "AwsSolutions-CFR3",
        reason:
          "The CloudFront distribution does not have access logging enabled.––No concern for example stack",
      },
      {
        id: "AwsSolutions-CFR4",
        reason:
          "The CloudFront distribution allows for SSLv3 or TLSv1 for HTTPS viewer connections.––No concern for example stack",
      },
    ]
  );
  return { bucket, distribution };
}

function readEnvFile() {
  function tryReadEntry(fname: string, key: string) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return fs
        .readFileSync(path.join(__dirname, fname), "utf8")
        .split("\n")
        .filter((l) => !!l && l.startsWith(key))
        .at(0)
        ?.replace(`${key}=`, "");
    } catch {
      return;
    }
  }
  const sesFromAddress =
    tryReadEntry(".env.local", "CDK_STACK_SES_FROM_ADDRESS") ??
    tryReadEntry(".env", "CDK_STACK_SES_FROM_ADDRESS");
  if (!sesFromAddress) {
    throw new Error(
      "Failed to read CDK_STACK_SES_FROM_ADDRESS config from .env file"
    );
  }
  const stackName =
    tryReadEntry(".env.local", "CDK_STACK_NAME") ??
    tryReadEntry(".env", "CDK_STACK_NAME");
  if (!stackName) {
    throw new Error("Failed to read CDK_STACK_NAME config from .env file");
  }

  return { sesFromAddress, stackName };
}
