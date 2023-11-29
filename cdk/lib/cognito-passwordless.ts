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
import { join } from "path";

type TableProps = Omit<cdk.aws_dynamodb.TableProps, "partitionKey" | "sortKey">;

export class Passwordless extends Construct {
  userPool: cdk.aws_cognito.UserPool;
  userPoolClients?: cdk.aws_cognito.UserPoolClient[];
  secretsTable?: cdk.aws_dynamodb.Table;
  authenticatorsTable?: cdk.aws_dynamodb.Table;
  kmsKey?: cdk.aws_kms.IKey;
  createAuthChallengeFn: cdk.aws_lambda.IFunction;
  verifyAuthChallengeResponseFn: cdk.aws_lambda.IFunction;
  defineAuthChallengeResponseFn: cdk.aws_lambda.IFunction;
  preSignUpFn?: cdk.aws_lambda.IFunction;
  preTokenGenerationFn?: cdk.aws_lambda.IFunction;
  fido2Fn?: cdk.aws_lambda.IFunction;
  fido2challengeFn?: cdk.aws_lambda.IFunction;
  fido2Api?: cdk.aws_apigateway.RestApi;
  fido2ApiWebACL?: cdk.aws_wafv2.CfnWebACL;
  fido2NotificationFn?: cdk.aws_lambda.IFunction;
  constructor(
    scope: Construct,
    id: string,
    props: {
      /** Your existing User Pool, if you have one already. This User Pool will then be equipped for Passwordless: Lambda triggers will be added. If you don't provide an existing User Pool, one will be created for you */
      userPool?: cdk.aws_cognito.UserPool;
      /** Your existing User Pool Clients, if you have them already. If you don't provide an existing User Pool Client, one will be created for you */
      userPoolClients?: cdk.aws_cognito.UserPoolClient[];
      /** If you don't provide an existing User Pool, one will be created for you. Pass any properties you want for it, these will be merged with properties from this solution */
      userPoolProps?: Partial<cdk.aws_cognito.UserPoolProps>;
      /** If you don't provide an existing User Pool Client, one will be created for you. Pass any properties you want for it, these will be merged with properties from this solution */
      userPoolClientProps?: Partial<cdk.aws_cognito.UserPoolClientOptions>;
      /**
       * The origins where you will be hosting your Web app on: scheme, hostname, and optionally port.
       * Do not include path as it will be ignored. The wildcard (*) is not supported.
       *
       * Example value: https://subdomain.example.org
       *
       * This property is required when using FIDO2 or Magic Links:
       * - For FIDO2 it is validated that the clientData.origin matches one of the allowedOrigins. Also, allowedOrigins is used as CORS origin setting on the FIDO2 credentials API.
       * - For Magic Links it is validated that the redirectUri (without path) in each Magic Link matches one of the allowedOrigins.
       */
      allowedOrigins?: string[];
      /**
       * The non web-app origins that will be allowed to authenticate via FIDO2. These may include origins which are not URLs.
       */
      allowedApplicationOrigins?: string[];
      /**
       * Enable sign-in with FIDO2 by providing this config object.
       */
      fido2?: {
        relyingPartyName?: string;
        allowedRelyingPartyIds: string[];
        attestation?: "direct" | "enterprise" | "indirect" | "none";
        userVerification?: "discouraged" | "preferred" | "required";
        authenticatorAttachment?: "cross-platform" | "platform";
        residentKey?: "discouraged" | "preferred" | "required";
        /** Timeouts (in milliseconds) */
        timeouts?: {
          credentialRegistration?: number;
          signIn?: number;
        };
        authenticatorsTableProps?: TableProps;
        exposeUserCredentialIDs?: boolean;
        /**
         * Should users who previously registered FIDO2 credentials be forced to sign in with FIDO2?
         * FIDO2 is a phishing resistant signInMethod. As long as other signInMethods are still available,
         * there is a risk of phishing to the user, e.g. an attacker might trick the user into revealing the magic link.
         * Set to `true` to disallow other custom signInMethods if the user has one or more FIDO2 credentials.
         * @default false
         */
        enforceFido2IfAvailable?: boolean;
        api?: {
          /**
           * The throttling burst limit for the deployment stage: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html
           *
           * @default 1000
           */
          throttlingBurstLimit?: number;
          /**
           * The throttling rate limit for the deployment stage: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html
           *
           * @default 2000
           */
          throttlingRateLimit?: number;
          /**
           * Create a log role for API Gateway and add this to API Gateway account settings?
           * Set to false if you have already set this up in your account and region,
           * otherwise that config will be overwritten.
           *
           * @default true
           */
          addCloudWatchLogsRoleAndAccountSetting?: boolean;
          /**
           * Add a WAF Web ACL with rate limit rule to the API deployment stage? The included Web ACL will have 1 rule:
           * rate limit incoming requests to max 100 per 5 minutes per IP address (based on X-Forwarded-For header).
           * If you want to customize the Web ACL, set addWaf to false and add your own Web ACL instead.
           *
           * @default true
           */
          addWaf?: boolean;
          /**
           * The rate limit per unique IP (using X-Forwarded-For header) that AWS WAF will apply: https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html
           *
           * @default 100
           */
          wafRateLimitPerIp?: number;
          /**
           * Pass any properties you want for the AWS Lambda Rest Api created, these will be merged with properties from this solution
           */
          restApiProps?: Partial<cdk.aws_apigateway.RestApiProps>;
        };
        /**
         * Send an informational notification to users when a FIDO2 credential was created or deleted for them?
         */
        updatedCredentialsNotification?: {
          /** The e-mail address you want to use as the FROM address of the notification e-mails */
          sesFromAddress: string;
          /** The AWS region you want to use Amazon SES from. Use this to specify a different region where you're no longer in the SES sandbox */
          sesRegion?: string;
        };
      };
      /**
       * Enable sign-in with Magic Links by providing this config object
       * Make sure you've moved out of the SES sandbox, otherwise you can only send few e-mails,
       * and only from and to verified e-mail addresses: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
       */
      magicLink?: {
        /** The e-mail address you want to use as the FROM address of the magic link e-mails */
        sesFromAddress: string;
        /** The AWS region you want to use Amazon SES from. Use this to specify a different region where you're no longer in the SES sandbox */
        sesRegion?: string;
        kmsKey?: cdk.aws_kms.IKey;
        kmsKeyProps?: cdk.aws_kms.KeyProps;
        rotatedKmsKey?: cdk.aws_kms.IKey;
        secretsTableProps?: TableProps;
        secondsUntilExpiry?: cdk.Duration;
        minimumSecondsBetween?: cdk.Duration;
        autoConfirmUsers?: boolean;
      };
      /**
       * Enable SMS OTP Step Up authentication by providing this config object.
       * Make sure you've moved out of the SNS sandbox, otherwise you can only send few SMS messages,
       * and only to verified phone numbers: https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html
       */
      smsOtpStepUp?: {
        /** The nr of digits in the OTP. Default: 6 */
        otpLength?: number;
        originationNumber?: string;
        senderId?: string;
        snsRegion?: string;
      };
      /** Pass any properties you want for the AWS Lambda functions created, these will be merged with properties from this solution */
      functionProps?: {
        createAuthChallenge?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        defineAuthChallenge?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        verifyAuthChallengeResponse?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        preSignUp?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        preTokenGeneration?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        fido2?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        fido2challenge?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
        fido2notification?: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps>;
      };
      /** Any keys in the clientMetadata that you specify here, will be persisted as claims in the ID-token, via the Amazon Cognito PreToken-generation trigger */
      clientMetadataTokenKeys?: string[];
      /**
       * Specify to enable logging in all lambda functions.
       * Note that log level DEBUG will log sensitive data, only use while developing!
       *
       * @default "INFO"
       */
      logLevel?: "DEBUG" | "INFO" | "ERROR";
    }
  ) {
    super(scope, id);

    if (props.magicLink) {
      if (props.magicLink.kmsKey) {
        this.kmsKey = props.magicLink.kmsKey;
      } else {
        const key = new cdk.aws_kms.Key(this, `KmsKeyRsa${id}`, {
          ...props.magicLink.kmsKeyProps,
          keySpec: cdk.aws_kms.KeySpec.RSA_2048,
          keyUsage: cdk.aws_kms.KeyUsage.SIGN_VERIFY,
          policy: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                notActions: ["kms:Sign"],
                resources: ["*"],
                principals: [new cdk.aws_iam.AccountRootPrincipal()],
              }),
            ],
          }),
        });
        this.kmsKey = key.addAlias(`${id}-${cdk.Stack.of(scope).stackName}`);
      }

      this.secretsTable = new cdk.aws_dynamodb.Table(
        scope,
        `SecretsTable${id}`,
        {
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          ...props.magicLink.secretsTableProps,
          partitionKey: {
            name: "userNameHash",
            type: cdk.aws_dynamodb.AttributeType.BINARY,
          },
          timeToLiveAttribute: "exp",
        }
      );
      const autoConfirmUsers = props.magicLink.autoConfirmUsers ?? true;
      if (autoConfirmUsers) {
        this.preSignUpFn = new cdk.aws_lambda_nodejs.NodejsFunction(
          this,
          `PreSignup${id}`,
          {
            entry: join(__dirname, "..", "custom-auth", "pre-signup.js"),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            architecture: cdk.aws_lambda.Architecture.ARM_64,
            bundling: {
              format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
            },
            ...props.functionProps?.preSignUp,
            environment: {
              LOG_LEVEL: props.logLevel ?? "INFO",
              ...props.functionProps?.preSignUp?.environment,
            },
          }
        );
      }
    }

    if (props.fido2) {
      this.authenticatorsTable = new cdk.aws_dynamodb.Table(
        scope,
        `Fido2AuthenticatorsTable${id}`,
        {
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          pointInTimeRecovery: true,
          ...props.fido2.authenticatorsTableProps,
          partitionKey: {
            name: "pk",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: "sk",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          timeToLiveAttribute: "exp",
        }
      );
      this.authenticatorsTable.addGlobalSecondaryIndex({
        indexName: "credentialId",
        partitionKey: {
          name: "credentialId",
          type: cdk.aws_dynamodb.AttributeType.BINARY,
        },
        projectionType: cdk.aws_dynamodb.ProjectionType.KEYS_ONLY,
      });
    }

    const createAuthChallengeEnvironment: Record<string, string> = {
      ALLOWED_ORIGINS: props.allowedOrigins?.join(",") ?? "",
      ALLOWED_APPLICATION_ORIGINS:
        props.allowedApplicationOrigins?.join(",") ?? "",
      LOG_LEVEL: props.logLevel ?? "INFO",
    };
    if (props.magicLink) {
      Object.assign(createAuthChallengeEnvironment, {
        MAGIC_LINK_ENABLED: "TRUE",
        SES_FROM_ADDRESS: props.magicLink.sesFromAddress,
        SES_REGION: props.magicLink.sesRegion ?? "",
        KMS_KEY_ID:
          this.kmsKey instanceof cdk.aws_kms.Alias
            ? this.kmsKey.aliasName
            : this.kmsKey!.keyId,
        DYNAMODB_SECRETS_TABLE: this.secretsTable!.tableName,
        SECONDS_UNTIL_EXPIRY:
          props.magicLink.secondsUntilExpiry?.toSeconds().toString() ?? "900",
        MIN_SECONDS_BETWEEN:
          props.magicLink.minimumSecondsBetween?.toSeconds().toString() ?? "60",
        STACK_ID: cdk.Stack.of(scope).stackId,
      });
    }
    if (props.fido2) {
      Object.assign(createAuthChallengeEnvironment, {
        FIDO2_ENABLED: "TRUE",
        DYNAMODB_AUTHENTICATORS_TABLE:
          this.authenticatorsTable?.tableName ?? "",
        USER_VERIFICATION: props.fido2.userVerification ?? "required",
        EXPOSE_USER_CREDENTIAL_IDS:
          props.fido2.exposeUserCredentialIDs === false ? "" : "TRUE",
        STACK_ID: cdk.Stack.of(scope).stackId,
        SIGN_IN_TIMEOUT: props.fido2.timeouts?.signIn?.toString() ?? "120000",
      });
    }
    if (props.smsOtpStepUp) {
      Object.assign(createAuthChallengeEnvironment, {
        SMS_OTP_STEP_UP_ENABLED: "TRUE",
        OTP_LENGTH: props.smsOtpStepUp.otpLength
          ? props.smsOtpStepUp.otpLength.toString()
          : "",
        ORIGINATION_NUMBER: props.smsOtpStepUp.originationNumber ?? "",
        SENDER_ID: props.smsOtpStepUp.senderId ?? "",
        SNS_REGION: props.smsOtpStepUp.snsRegion ?? "",
      });
    }
    this.createAuthChallengeFn = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      `CreateAuthChallenge${id}`,
      {
        entry: join(__dirname, "..", "custom-auth", "create-auth-challenge.js"),
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        bundling: {
          format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        },
        timeout: cdk.Duration.seconds(5),
        ...props.functionProps?.createAuthChallenge,
        environment: {
          ...createAuthChallengeEnvironment,
          ...props.functionProps?.createAuthChallenge?.environment,
        },
      }
    );
    this.secretsTable?.grantReadWriteData(this.createAuthChallengeFn);
    this.authenticatorsTable?.grantReadData(this.createAuthChallengeFn);
    if (props.magicLink) {
      this.createAuthChallengeFn.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          resources: [
            `arn:${cdk.Aws.PARTITION}:ses:${
              props.magicLink.sesRegion ?? cdk.Aws.REGION
            }:${cdk.Aws.ACCOUNT_ID}:identity/*`,
          ],
          actions: ["ses:SendEmail"],
        })
      );
    }
    this.createAuthChallengeFn.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["SNS:Publish"],
        notResources: ["arn:aws:sns:*:*:*"], // Only allow SMS sending, not publishing to topics
      })
    );
    [this.kmsKey, props.magicLink?.rotatedKmsKey].forEach((key) => {
      if (!key) return;
      if ((key as cdk.aws_kms.IAlias).aliasName) {
        const permissions = {
          effect: cdk.aws_iam.Effect.ALLOW,
          resources: [
            `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:key/*`,
          ],
          actions: ["kms:Sign"],
          conditions: {
            StringLike: {
              "kms:RequestAlias": (
                key.node.defaultChild as cdk.aws_kms.CfnAlias
              ).aliasName, // have to get the raw string like this to prevent a circulair dependency
            },
          },
        };
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            ...permissions,
            principals: [this.createAuthChallengeFn.role!.grantPrincipal],
          })
        );
        this.createAuthChallengeFn.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement(permissions)
        );
      } else {
        const permissions = {
          effect: cdk.aws_iam.Effect.ALLOW,
          resources: [key.keyArn],
          actions: ["kms:Sign"],
        };
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            ...permissions,
            principals: [this.createAuthChallengeFn.role!.grantPrincipal],
          })
        );
        this.createAuthChallengeFn.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement(permissions)
        );
      }
    });
    const verifyAuthChallengeResponseEnvironment: Record<string, string> = {
      ALLOWED_ORIGINS: props.allowedOrigins?.join(",") ?? "",
      ALLOWED_APPLICATION_ORIGINS:
        props.allowedApplicationOrigins?.join(",") ?? "",
      LOG_LEVEL: props.logLevel ?? "INFO",
    };
    if (props.magicLink) {
      Object.assign(verifyAuthChallengeResponseEnvironment, {
        MAGIC_LINK_ENABLED: "TRUE",
        DYNAMODB_SECRETS_TABLE: this.secretsTable!.tableName,
        STACK_ID: cdk.Stack.of(scope).stackId,
      });
    }
    if (props.fido2) {
      Object.assign(verifyAuthChallengeResponseEnvironment, {
        FIDO2_ENABLED: "TRUE",
        DYNAMODB_AUTHENTICATORS_TABLE: this.authenticatorsTable!.tableName,
        ALLOWED_RELYING_PARTY_IDS:
          props.fido2.allowedRelyingPartyIds.join(",") ?? "",
        ENFORCE_FIDO2_IF_AVAILABLE: props.fido2?.enforceFido2IfAvailable
          ? "TRUE"
          : "",
        USER_VERIFICATION: props.fido2.userVerification ?? "required",
        STACK_ID: cdk.Stack.of(scope).stackId,
      });
    }
    if (props.smsOtpStepUp) {
      Object.assign(verifyAuthChallengeResponseEnvironment, {
        SMS_OTP_STEP_UP_ENABLED: "TRUE",
      });
    }
    this.verifyAuthChallengeResponseFn =
      new cdk.aws_lambda_nodejs.NodejsFunction(
        this,
        `VerifyAuthChallengeResponse${id}`,
        {
          entry: join(
            __dirname,
            "..",
            "custom-auth",
            "verify-auth-challenge-response.js"
          ),
          runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
          architecture: cdk.aws_lambda.Architecture.ARM_64,
          bundling: {
            format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          },
          timeout: cdk.Duration.seconds(5),
          ...props.functionProps?.verifyAuthChallengeResponse,
          environment: {
            ...verifyAuthChallengeResponseEnvironment,
            ...props.functionProps?.verifyAuthChallengeResponse?.environment,
          },
        }
      );
    this.secretsTable?.grantReadWriteData(this.verifyAuthChallengeResponseFn);
    this.authenticatorsTable?.grantReadWriteData(
      this.verifyAuthChallengeResponseFn
    );
    [this.kmsKey, props.magicLink?.rotatedKmsKey]
      .filter(Boolean)
      .forEach((key) => {
        if (!key) return;
        if ((key as cdk.aws_kms.IAlias).aliasName) {
          this.verifyAuthChallengeResponseFn.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [
                `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:key/*`,
              ],
              actions: ["kms:GetPublicKey"],
              conditions: {
                StringLike: {
                  "kms:RequestAlias": (key as cdk.aws_kms.IAlias).aliasName,
                },
              },
            })
          );
        } else {
          this.verifyAuthChallengeResponseFn.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [key.keyArn],
              actions: ["kms:GetPublicKey"],
            })
          );
        }
      });

    this.defineAuthChallengeResponseFn =
      new cdk.aws_lambda_nodejs.NodejsFunction(
        this,
        `DefineAuthChallenge${id}`,
        {
          entry: join(
            __dirname,
            "..",
            "custom-auth",
            "define-auth-challenge.js"
          ),
          runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
          architecture: cdk.aws_lambda.Architecture.ARM_64,
          bundling: {
            format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          },
          timeout: cdk.Duration.seconds(5),
          ...props.functionProps?.defineAuthChallenge,
          environment: {
            LOG_LEVEL: props.logLevel ?? "INFO",
            ...props.functionProps?.defineAuthChallenge?.environment,
          },
        }
      );

    if (props.clientMetadataTokenKeys) {
      this.preTokenGenerationFn = new cdk.aws_lambda_nodejs.NodejsFunction(
        this,
        `PreToken${id}`,
        {
          entry: join(__dirname, "..", "custom-auth", "pre-token.js"),
          runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
          architecture: cdk.aws_lambda.Architecture.ARM_64,
          bundling: {
            format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          },
          ...props.functionProps?.preTokenGeneration,
          environment: {
            LOG_LEVEL: props.logLevel ?? "INFO",
            CLIENT_METADATA_PERSISTED_KEYS: [
              "signInMethod",
              ...(props.clientMetadataTokenKeys ?? []),
            ].join(","),
            ...props.functionProps?.preTokenGeneration?.environment,
          },
        }
      );
    }

    if (!props.userPool) {
      const mergedProps: cdk.aws_cognito.UserPoolProps = {
        passwordPolicy: {
          minLength: 8,
          requireDigits: true,
          requireUppercase: true,
          requireLowercase: true,
          requireSymbols: true,
        },
        signInAliases: {
          username: false,
          phone: false,
          preferredUsername: false,
          email: true,
        },
        ...props.userPoolProps,
        lambdaTriggers: {
          ...props.userPoolProps?.lambdaTriggers,
          defineAuthChallenge: this.defineAuthChallengeResponseFn,
          createAuthChallenge: this.createAuthChallengeFn,
          verifyAuthChallengeResponse: this.verifyAuthChallengeResponseFn,
          preSignUp: this.preSignUpFn,
          preTokenGeneration: this.preTokenGenerationFn,
        },
      };
      this.userPool = new cdk.aws_cognito.UserPool(
        scope,
        `UserPool${id}`,
        mergedProps
      );
    } else {
      props.userPool.addTrigger(
        cdk.aws_cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE,
        this.createAuthChallengeFn
      );
      props.userPool.addTrigger(
        cdk.aws_cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE,
        this.defineAuthChallengeResponseFn
      );
      props.userPool.addTrigger(
        cdk.aws_cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
        this.verifyAuthChallengeResponseFn
      );
      if (this.preSignUpFn) {
        props.userPool.addTrigger(
          cdk.aws_cognito.UserPoolOperation.PRE_SIGN_UP,
          this.preSignUpFn
        );
      }
      if (this.preTokenGenerationFn) {
        props.userPool.addTrigger(
          cdk.aws_cognito.UserPoolOperation.PRE_TOKEN_GENERATION,
          this.preTokenGenerationFn
        );
      }
      this.userPool = props.userPool;
    }
    if (props.fido2) {
      const defaultCorsOptionsWithoutAuth = {
        allowHeaders: ["Content-Type"],
        allowMethods: ["POST"],
        allowOrigins: props.allowedOrigins ?? [],
        maxAge: cdk.Duration.days(1),
      };
      const defaultCorsOptionsWithAuth = {
        ...defaultCorsOptionsWithoutAuth,
        allowHeaders: defaultCorsOptionsWithoutAuth.allowHeaders.concat([
          "Authorization",
        ]),
      };
      if (props.fido2.updatedCredentialsNotification) {
        this.fido2NotificationFn = new cdk.aws_lambda_nodejs.NodejsFunction(
          this,
          `Fido2Notification${id}`,
          {
            entry: join(
              __dirname,
              "..",
              "custom-auth",
              "fido2-notification.js"
            ),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            architecture: cdk.aws_lambda.Architecture.ARM_64,
            bundling: {
              format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
            },
            timeout: cdk.Duration.seconds(30),
            ...props.functionProps?.fido2notification,
            environment: {
              LOG_LEVEL: props.logLevel ?? "INFO",
              SES_FROM_ADDRESS:
                props.fido2.updatedCredentialsNotification.sesFromAddress,
              SES_REGION:
                props.fido2.updatedCredentialsNotification.sesRegion ?? "",
              USER_POOL_ID: this.userPool.userPoolId,
              ...props.functionProps?.fido2notification?.environment,
            },
          }
        );
        this.fido2NotificationFn.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: [
              `arn:${cdk.Aws.PARTITION}:ses:${
                props.fido2.updatedCredentialsNotification.sesRegion ??
                cdk.Aws.REGION
              }:${cdk.Aws.ACCOUNT_ID}:identity/*`,
            ],
            actions: ["ses:SendEmail"],
          })
        );
        this.userPool.grant(
          this.fido2NotificationFn,
          "cognito-idp:AdminGetUser"
        );
      }

      this.fido2Fn = new cdk.aws_lambda_nodejs.NodejsFunction(
        this,
        `Fido2${id}`,
        {
          entry: join(
            __dirname,
            "..",
            "custom-auth",
            "fido2-credentials-api.js"
          ),
          runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
          architecture: cdk.aws_lambda.Architecture.ARM_64,
          bundling: {
            format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
            banner:
              "import{createRequire}from 'module';const require=createRequire(import.meta.url);", // needed for cbor dependency, https://github.com/evanw/esbuild/issues/1921
          },
          timeout: cdk.Duration.seconds(30),
          ...props.functionProps?.fido2,
          environment: {
            LOG_LEVEL: props.logLevel ?? "INFO",
            DYNAMODB_AUTHENTICATORS_TABLE: this.authenticatorsTable!.tableName,
            COGNITO_USER_POOL_ID: this.userPool.userPoolId,
            RELYING_PARTY_NAME: props.fido2.relyingPartyName ?? "",
            ALLOWED_RELYING_PARTY_IDS:
              props.fido2.allowedRelyingPartyIds.join(",") ?? "",
            ALLOWED_ORIGINS: props.allowedOrigins?.join(",") ?? "",
            ALLOWED_APPLICATION_ORIGINS:
              props.allowedApplicationOrigins?.join(",") ?? "",
            ATTESTATION: props.fido2.attestation ?? "none",
            USER_VERIFICATION: props.fido2.userVerification ?? "required",
            AUTHENTICATOR_ATTACHMENT: props.fido2.authenticatorAttachment ?? "",
            REQUIRE_RESIDENT_KEY: props.fido2.residentKey ?? "",
            AUTHENTICATOR_REGISTRATION_TIMEOUT:
              props.fido2.timeouts?.credentialRegistration?.toString() ??
              "300000",
            CORS_ALLOWED_ORIGINS:
              defaultCorsOptionsWithAuth.allowOrigins.join(","),
            CORS_ALLOWED_HEADERS:
              defaultCorsOptionsWithAuth.allowHeaders.join(","),
            CORS_ALLOWED_METHODS:
              defaultCorsOptionsWithAuth.allowMethods.join(","),
            CORS_MAX_AGE: defaultCorsOptionsWithAuth.maxAge
              .toSeconds()
              .toString(),
            FIDO2_NOTIFICATION_LAMBDA_ARN:
              this.fido2NotificationFn?.latestVersion.functionArn ?? "",
            ...props.functionProps?.fido2?.environment,
          },
        }
      );
      this.fido2NotificationFn?.latestVersion.grantInvoke(this.fido2Fn);
      this.authenticatorsTable!.grantReadWriteData(this.fido2Fn);

      this.fido2challengeFn = new cdk.aws_lambda_nodejs.NodejsFunction(
        this,
        `Fido2Challenge${id}`,
        {
          entry: join(__dirname, "..", "custom-auth", "fido2-challenge-api.js"),
          runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
          architecture: cdk.aws_lambda.Architecture.ARM_64,
          bundling: {
            format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          },
          timeout: cdk.Duration.seconds(30),
          ...props.functionProps?.fido2challenge,
          environment: {
            LOG_LEVEL: props.logLevel ?? "INFO",
            DYNAMODB_AUTHENTICATORS_TABLE: this.authenticatorsTable!.tableName,
            SIGN_IN_TIMEOUT:
              props.fido2.timeouts?.signIn?.toString() ?? "120000",
            USER_VERIFICATION: props.fido2.userVerification ?? "required",
            CORS_ALLOWED_ORIGINS:
              defaultCorsOptionsWithoutAuth.allowOrigins.join(","),
            CORS_ALLOWED_HEADERS:
              defaultCorsOptionsWithoutAuth.allowHeaders.join(","),
            CORS_ALLOWED_METHODS:
              defaultCorsOptionsWithoutAuth.allowMethods.join(","),
            CORS_MAX_AGE: defaultCorsOptionsWithoutAuth.maxAge
              .toSeconds()
              .toString(),
            ...props.functionProps?.fido2challenge?.environment,
          },
        }
      );
      this.fido2challengeFn.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ["dynamodb:PutItem"],
          resources: [this.authenticatorsTable!.tableArn],
          conditions: {
            "ForAllValues:StringEquals": {
              "dynamodb:Attributes": ["pk", "sk", "exp"],
            },
          },
        })
      );

      const accessLogs = new cdk.aws_logs.LogGroup(
        this,
        `ApigwAccessLogs${id}`,
        {
          retention: cdk.aws_logs.RetentionDays.INFINITE,
        }
      );
      const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(
        scope,
        `CognitoAuthorizer${id}`,
        {
          cognitoUserPools: [this.userPool],
          resultsCacheTtl: cdk.Duration.minutes(1),
        }
      );
      this.fido2Api = new cdk.aws_apigateway.LambdaRestApi(
        this,
        `RestApi${id}`,
        {
          proxy: false,
          handler: this.fido2Fn,
          ...props.fido2.api?.restApiProps,
          deployOptions: {
            loggingLevel: cdk.aws_apigateway.MethodLoggingLevel.ERROR,
            metricsEnabled: true,
            stageName: "v1",
            throttlingBurstLimit: props.fido2.api?.throttlingBurstLimit ?? 1000,
            throttlingRateLimit: props.fido2.api?.throttlingRateLimit ?? 2000,
            accessLogDestination: new cdk.aws_apigateway.LogGroupLogDestination(
              accessLogs
            ),
            accessLogFormat: cdk.aws_apigateway.AccessLogFormat.custom(
              JSON.stringify({
                requestId: cdk.aws_apigateway.AccessLogField.contextRequestId(),
                jwtSub:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "sub"
                  ),
                jwtIat:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "iat"
                  ),
                jwtEventId:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "event_id"
                  ),
                jwtJti:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "jti"
                  ),
                jwtOriginJti:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "origin_jti"
                  ),
                jwtSignInMethod:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerClaims(
                    "sign_in_method"
                  ),
                userAgent:
                  cdk.aws_apigateway.AccessLogField.contextIdentityUserAgent(),
                sourceIp:
                  cdk.aws_apigateway.AccessLogField.contextIdentitySourceIp(),
                requestTime:
                  cdk.aws_apigateway.AccessLogField.contextRequestTime(),
                requestTimeEpoch:
                  cdk.aws_apigateway.AccessLogField.contextRequestTimeEpoch(),
                httpMethod:
                  cdk.aws_apigateway.AccessLogField.contextHttpMethod(),
                path: cdk.aws_apigateway.AccessLogField.contextPath(),
                status: cdk.aws_apigateway.AccessLogField.contextStatus(),
                authorizerError:
                  cdk.aws_apigateway.AccessLogField.contextAuthorizerError(),
                apiError:
                  cdk.aws_apigateway.AccessLogField.contextErrorMessage(),
                protocol: cdk.aws_apigateway.AccessLogField.contextProtocol(),
                responseLength:
                  cdk.aws_apigateway.AccessLogField.contextResponseLength(),
                responseLatency:
                  cdk.aws_apigateway.AccessLogField.contextResponseLatency(),
                domainName:
                  cdk.aws_apigateway.AccessLogField.contextDomainName(),
              })
            ),
            ...props.fido2.api?.restApiProps?.deployOptions,
          },
        }
      );
      if (props.fido2.api?.addCloudWatchLogsRoleAndAccountSetting !== false) {
        const logRole = new cdk.aws_iam.Role(
          scope,
          "ApiGatewayCloudWatchLogsRole",
          {
            assumedBy: new cdk.aws_iam.ServicePrincipal(
              "apigateway.amazonaws.com"
            ),
            managedPolicies: [
              cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
              ),
            ],
          }
        );
        const accountSetting = new cdk.aws_apigateway.CfnAccount(
          scope,
          "ApiGatewayAccountSetting",
          {
            cloudWatchRoleArn: logRole.roleArn,
          }
        );
        this.fido2Api.node.addDependency(accountSetting);
      }
      if (!props.userPoolClients) {
        this.userPoolClients = [
          this.userPool.addClient(`UserPoolClient${id}`, {
            generateSecret: false,
            authFlows: {
              adminUserPassword: false,
              userPassword: false,
              userSrp: false,
              custom: true,
            },
            preventUserExistenceErrors: true,
            ...props.userPoolClientProps,
          }),
        ];
      } else {
        this.userPoolClients = props.userPoolClients;
      }

      // Create resource structure
      const registerAuthenticatorResource = this.fido2Api.root.addResource(
        "register-authenticator"
      );
      const startResource = registerAuthenticatorResource.addResource("start");
      const completeResource =
        registerAuthenticatorResource.addResource("complete");
      const authenticatorsResource =
        this.fido2Api.root.addResource("authenticators");
      const listResource = authenticatorsResource.addResource("list");
      const deleteResource = authenticatorsResource.addResource("delete");
      const updateResource = authenticatorsResource.addResource("update");

      const requestValidator = new cdk.aws_apigateway.RequestValidator(
        scope,
        "ReqValidator",
        {
          restApi: this.fido2Api,
          requestValidatorName: "req-validator",
          validateRequestBody: true,
          validateRequestParameters: true,
        }
      );

      // register-authenticator/start
      startResource.addCorsPreflight(defaultCorsOptionsWithAuth);
      startResource.addMethod("POST", undefined, {
        authorizer: authorizer,
        requestParameters: {
          "method.request.querystring.rpId": true,
        },
        requestValidator,
      });

      // register-authenticator/complete
      const completeRegistrationModel = new cdk.aws_apigateway.Model(
        scope,
        `CompleteRegistrationModel${id}`,
        {
          restApi: this.fido2Api,
          contentType: "application/json",
          description: "Create FIDO2 credential request body",
          modelName: "registerAuthenticatorComplete",
          schema: {
            type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
            required: [
              "clientDataJSON_B64",
              "attestationObjectB64",
              "friendlyName",
            ],
            properties: {
              clientDataJSON_B64: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
              },
              attestationObjectB64: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
              },
              friendlyName: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
                maxLength: 256,
              },
              transports: {
                type: cdk.aws_apigateway.JsonSchemaType.ARRAY,
                items: {
                  type: cdk.aws_apigateway.JsonSchemaType.STRING,
                  enum: ["usb", "nfc", "ble", "internal", "hybrid"],
                },
              },
            },
          },
        }
      );
      completeResource.addCorsPreflight(defaultCorsOptionsWithAuth);
      completeResource.addMethod("POST", undefined, {
        authorizer: authorizer,
        requestValidator,
        requestModels: {
          "application/json": completeRegistrationModel,
        },
      });

      // authenticators/list
      listResource.addCorsPreflight(defaultCorsOptionsWithAuth);
      listResource.addMethod("POST", undefined, {
        authorizer: authorizer,
        requestParameters: {
          "method.request.querystring.rpId": true,
        },
        requestValidator,
      });

      // authenticators/delete
      const deleteCredentialsModel = new cdk.aws_apigateway.Model(
        scope,
        `DeleteCredentialModel${id}`,
        {
          restApi: this.fido2Api,
          contentType: "application/json",
          description: "Delete FIDO2 credential request body",
          modelName: "credentialDelete",
          schema: {
            type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
            required: ["credentialId"],
            properties: {
              credentialId: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
              },
            },
          },
        }
      );
      deleteResource.addCorsPreflight(defaultCorsOptionsWithAuth);
      deleteResource.addMethod("POST", undefined, {
        authorizer: authorizer,
        requestValidator,
        requestModels: {
          "application/json": deleteCredentialsModel,
        },
      });

      // register-authenticator/update
      const updateCredentialsModel = new cdk.aws_apigateway.Model(
        scope,
        `UpdateCredentialModel${id}`,
        {
          restApi: this.fido2Api,
          contentType: "application/json",
          description: "Update FIDO2 credential request body",
          modelName: "credentialUpdate",
          schema: {
            type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
            required: ["credentialId", "friendlyName"],
            properties: {
              credentialId: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
              },
              friendlyName: {
                type: cdk.aws_apigateway.JsonSchemaType.STRING,
                minLength: 1,
                maxLength: 256,
              },
            },
          },
        }
      );
      updateResource.addCorsPreflight(defaultCorsOptionsWithAuth);
      updateResource.addMethod("POST", undefined, {
        authorizer: authorizer,
        requestValidator,
        requestModels: {
          "application/json": updateCredentialsModel,
        },
      });

      // sign-in-challenge
      const signInChallenge =
        this.fido2Api.root.addResource("sign-in-challenge");
      signInChallenge.addCorsPreflight(defaultCorsOptionsWithoutAuth);
      signInChallenge.addMethod(
        "POST",
        new cdk.aws_apigateway.LambdaIntegration(this.fido2challengeFn),
        {
          authorizer: undefined, // public API
        }
      );

      if (props.fido2.api?.addWaf !== false) {
        this.fido2ApiWebACL = new cdk.aws_wafv2.CfnWebACL(
          scope,
          `Fido2ApiWebACL${id}`,
          {
            defaultAction: {
              allow: {},
            },
            scope: "REGIONAL",
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `Fido2ApiWebACL${id}`,
              sampledRequestsEnabled: true,
            },
            rules: [
              {
                name: "RateLimitPerIP",
                priority: 1,
                action: {
                  block: {},
                },
                visibilityConfig: {
                  sampledRequestsEnabled: true,
                  cloudWatchMetricsEnabled: true,
                  metricName: "RateLimitPerIP",
                },
                statement: {
                  rateBasedStatement: {
                    limit: props.fido2.api?.wafRateLimitPerIp ?? 100, // max 100 requests per 5 minutes per IP address
                    aggregateKeyType: "FORWARDED_IP",
                    forwardedIpConfig: {
                      headerName: "X-Forwarded-For",
                      fallbackBehavior: "MATCH",
                    },
                  },
                },
              },
            ],
          }
        );
        new cdk.aws_wafv2.CfnWebACLAssociation(scope, `WafAssociation${id}`, {
          resourceArn: this.fido2Api.deploymentStage.stageArn,
          webAclArn: this.fido2ApiWebACL.attrArn,
        });
      }
    }
  }
}
