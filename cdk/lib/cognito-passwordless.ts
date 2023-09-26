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
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwInt from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as apigwAuth from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
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
  fido2Api?: apigw.HttpApi;
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
        /**
         * Set to true to enable users to sign in without requiring them to type in their username––instead, the user handle from the
         * user's existing FIDO2 credential will be used as username. This only works if the user has an existing discoverable credential (aka Passkey).
         *
         * You should then make sure you're using an opaque username (i.e. a UUID) for users, in which case the username can also be used as user handle.
         * Example: username b4ef439d-b3ef-457c-9a4a-0a3031c07e86 would be okay, username johndoe not.
         * This is because the user handle must be an opaque byte sequence as mandated by WebAuthn spec: https://www.w3.org/TR/webauthn-3/#user-handle
         *
         * To make this feature work, a public API is exposed that user agents can invoke to generate a FIDO2 challenge for sign-in.
         */
        enableUsernamelessAuthentication?: boolean;
      };
      /**
       * Enable sign-in with Magic Links by providing this config object
       * Make sure you've moved out of the SES sandbox, otherwise you can only send few e-mails,
       * and only from and to verified e-mail addresses: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
       */
      magicLink?: {
        /** The e-mail address you want to use as the FROM address of the magic link e-mails */
        sesFromAddress: string;
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
        USERNAMELESS_SIGN_IN_ENABLED: props.fido2
          .enableUsernamelessAuthentication
          ? "TRUE"
          : "",
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
            ATTESTATION: props.fido2.attestation ?? "none",
            USER_VERIFICATION: props.fido2.userVerification ?? "required",
            AUTHENTICATOR_ATTACHMENT: props.fido2.authenticatorAttachment ?? "",
            REQUIRE_RESIDENT_KEY: props.fido2.residentKey ?? "",
            AUTHENTICATOR_REGISTRATION_TIMEOUT:
              props.fido2.timeouts?.credentialRegistration?.toString() ??
              "300000",
            SIGN_IN_TIMEOUT:
              props.fido2.timeouts?.signIn?.toString() ?? "120000",
            ...props.functionProps?.fido2?.environment,
          },
        }
      );
      this.userPool.grant(this.fido2Fn, "cognito-idp:AdminGetUser");
      this.authenticatorsTable!.grantReadWriteData(this.fido2Fn);
      this.fido2Api = new apigw.HttpApi(this, `HttpApi${id}`, {
        corsPreflight: {
          allowHeaders: ["Content-Type", "Authorization"],
          allowMethods: [apigw.CorsHttpMethod.POST],
          allowOrigins: props.allowedOrigins,
          maxAge: cdk.Duration.days(1),
        },
      });
      const defaultStage = this.fido2Api.defaultStage?.node
        .defaultChild as cdk.aws_apigatewayv2.CfnStage;
      defaultStage.addPropertyOverride("DefaultRouteSettings", {
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 200,
      });
      const accessLogs = new cdk.aws_logs.LogGroup(
        this,
        `ApigwAccessLogs${id}`,
        {
          retention: cdk.aws_logs.RetentionDays.INFINITE,
        }
      );
      defaultStage.addPropertyOverride(
        "AccessLogSettings.DestinationArn",
        accessLogs.logGroupArn
      );
      defaultStage.addPropertyOverride(
        "AccessLogSettings.Format",
        JSON.stringify({
          requestId: "$context.requestId",
          jwtSub: "$context.authorizer.claims.sub",
          jwtIat: "$context.authorizer.claims.iat",
          jwtEventId: "$context.authorizer.claims.event_id",
          jwtJti: "$context.authorizer.claims.jti",
          jwtOriginJti: "$context.authorizer.claims.origin_jti",
          jwtSignInMethod: "$context.authorizer.claims.sign_in_method",
          userAgent: "$context.identity.userAgent",
          sourceIp: "$context.identity.sourceIp",
          requestTime: "$context.requestTime",
          requestTimeEpoch: "$context.requestTimeEpoch",
          httpMethod: "$context.httpMethod",
          path: "$context.path",
          status: "$context.status",
          authorizerError: "$context.authorizer.error",
          apiError: "$context.error.message",
          protocol: "$context.protocol",
          responseLength: "$context.responseLength",
          responseLatency: "$context.responseLatency",
          domainName: "$context.domainName",
        })
      );
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
      const authorizer = new apigwAuth.HttpUserPoolAuthorizer(
        `CognitoAuthorizer${id}`,
        this.userPool,
        {
          userPoolClients: this.userPoolClients,
        }
      );
      Object.entries({
        "/register-authenticator/start": authorizer,
        "/register-authenticator/complete": authorizer,
        "/authenticators/list": authorizer,
        "/authenticators/delete": authorizer,
        "/authenticators/update": authorizer,
        ...(props.fido2.enableUsernamelessAuthentication && {
          "/sign-in-challenge": undefined, // public API, should be protected by e.g. WAF rate limit rule, to prevent DOS and misuse
        }),
      }).forEach(
        ([path, authorizer]: [
          string,
          apigwAuth.HttpUserPoolAuthorizer | undefined
        ]) =>
          this.fido2Api!.addRoutes({
            path,
            methods: [apigw.HttpMethod.POST],
            integration: new apigwInt.HttpLambdaIntegration(
              `Fido2Integration${id}`,
              this.fido2Fn!
            ),
            authorizer,
          })
      );
    }
  }
}
