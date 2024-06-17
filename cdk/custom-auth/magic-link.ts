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
import { createHash, createPublicKey, constants, createVerify } from "crypto";
import {
  CreateAuthChallengeTriggerEvent,
  VerifyAuthChallengeResponseTriggerEvent,
} from "aws-lambda";
import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SESClient,
  SendEmailCommand,
  MessageRejected,
} from "@aws-sdk/client-ses";
import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
} from "@aws-sdk/client-kms";
import {
  logger,
  UserFacingError,
  handleConditionalCheckFailedException,
} from "./common.js";

let config = {
  /** Should Magic Link sign-in be enabled? If set to false, clients cannot sign-in with magic links (an error is shown instead when they request a magic link) */
  magicLinkEnabled: !!process.env.MAGIC_LINK_ENABLED,
  /** Number of seconds a Magic Link should be valid */
  secondsUntilExpiry: Number(process.env.SECONDS_UNTIL_EXPIRY || 60 * 15),
  /** Number of seconds that must lapse between unused Magic Links (to prevent misuse) */
  minimumSecondsBetween: Number(process.env.MIN_SECONDS_BETWEEN || 60 * 1),
  /** The origins that are allowed to be used in the Magic Links */
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",")
    .map((href) => new URL(href))
    .map((url) => url.origin),
  /** The e-mail address that Magic Links will be sent from */
  sesFromAddress: process.env.SES_FROM_ADDRESS,
  /** The Amazon SES region, override e.g. to set a region where you are out of the SES sandbox */
  sesRegion: process.env.SES_REGION || process.env.AWS_REGION,
  /** KMS Key ID to use for generating Magic Links (signatures) */
  kmsKeyId: process.env.KMS_KEY_ID,
  /** The name of the DynamoDB table where (hashes of) Magic Links will be stored */
  dynamodbSecretsTableName: process.env.DYNAMODB_SECRETS_TABLE,
  /** Function that will send the actual Magic Link e-mails. Override this to e.g. use another e-mail provider instead of Amazon SES */
  emailSender: sendEmailWithLink,
  /** A salt to use for storing hashes of magic links in the DynamoDB table */
  salt: process.env.STACK_ID,
  /** Function to create the content of the Magic Link e-mails, override to e.g. use a custom e-mail template */
  contentCreator: createEmailContent,
  /** Error message that will be shown to the client, if the client requests a Magic Link but isn't allowed to yet */
  notNowMsg:
    "We can't send you a magic link right now, please try again in a minute",
};

function requireConfig<K extends keyof typeof config>(
  k: K
): NonNullable<(typeof config)[K]> {
  // eslint-disable-next-line security/detect-object-injection
  const value = config[k];
  if (value === undefined) throw new Error(`Missing configuration for: ${k}`);
  return value;
}

export function configure(update?: Partial<typeof config>) {
  const oldSesRegion = config.sesRegion;
  config = { ...config, ...update };
  if (update && update.sesRegion !== oldSesRegion) {
    ses = new SESClient({ region: config.sesRegion });
  }
  return config;
}

const publicKeys: Record<string, ReturnType<typeof createPublicKey>> = {};
const kms = new KMSClient({});
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
let ses = new SESClient({ region: config.sesRegion });

export async function addChallengeToEvent(
  event: CreateAuthChallengeTriggerEvent
): Promise<void> {
  if (!config.magicLinkEnabled)
    throw new UserFacingError("Sign-in with Magic Link not supported");
  event.response.challengeMetadata = "MAGIC_LINK";
  const alreadyHaveMagicLink =
    event.request.clientMetadata?.alreadyHaveMagicLink;
  if (alreadyHaveMagicLink === "yes") {
    // The client already has a sign-in code, we don't need to send a new one
    logger.info("Client will use already obtained sign-in link");
    return;
  }
  logger.info("Client needs sign-in link");
  // Determine the redirect URI for the magic link
  const redirectUri = event.request.clientMetadata?.redirectUri;
  if (
    !redirectUri ||
    !requireConfig("allowedOrigins").includes(new URL(redirectUri).origin)
  ) {
    throw new UserFacingError(`Invalid redirectUri: ${redirectUri}`);
  }
  // Send challenge with new secret login code
  await createAndSendMagicLink(event, {
    redirectUri,
  });
  const email = event.request.userAttributes.email;
  // The event.request.userNotFound is only present in the Lambda trigger if "Prevent user existence errors" is checked
  // in the Cognito app client. If it is *not* checked, the client receives the error, which potentially allows for
  // user enumeration. Additional guardrails are advisable.
  if (event.request.userNotFound) {
    logger.info("User not found");
  }
  // Current implementation has no use for publicChallengeParameters - feel free to provide them
  // if you want to use them in your front-end:
  // event.response.publicChallengeParameters = {};
  event.response.privateChallengeParameters = {
    email: email,
  };
}

async function createEmailContent({
  secretLoginLink,
}: {
  secretLoginLink: string;
}) {
  return {
    html: {
      data: `<html><body><p>Your secret sign-in link: <a href="${secretLoginLink}">sign in</a></p>This link is valid for ${Math.floor(
        config.secondsUntilExpiry / 60
      )} minutes<p></p></body></html>`,
      charSet: "UTF-8",
    },
    text: {
      data: `Your secret sign-in link: ${secretLoginLink}`,
      charSet: "UTF-8",
    },
    subject: {
      data: "Your secret sign-in link",
      charSet: "UTF-8",
    },
  };
}

async function sendEmailWithLink({
  emailAddress,
  content,
}: {
  emailAddress: string;
  content: {
    html: { charSet: string; data: string };
    text: { charSet: string; data: string };
    subject: { charSet: string; data: string };
  };
}) {
  await ses
    .send(
      new SendEmailCommand({
        Destination: { ToAddresses: [emailAddress] },
        Message: {
          Body: {
            Html: {
              Charset: content.html.charSet,
              Data: content.html.data,
            },
            Text: {
              Charset: content.text.charSet,
              Data: content.text.data,
            },
          },
          Subject: {
            Charset: content.subject.charSet,
            Data: content.subject.data,
          },
        },
        Source: requireConfig("sesFromAddress"),
      })
    )
    .catch((err) => {
      if (
        err instanceof MessageRejected &&
        err.message.includes("Email address is not verified")
      ) {
        logger.error(err);
        throw new UserFacingError(
          "E-mail address must still be verified in the e-mail service"
        );
      }
      throw err;
    });
}

async function createAndSendMagicLink(
  event: CreateAuthChallengeTriggerEvent,
  {
    redirectUri,
  }: {
    redirectUri: string;
  }
): Promise<void> {
  logger.debug("Creating new magic link ...");
  const exp = Math.floor(Date.now() / 1000 + config.secondsUntilExpiry);
  const iat = Math.floor(Date.now() / 1000);
  const message = Buffer.from(
    JSON.stringify({
      userName: event.userName,
      iat,
      exp,
    })
  );
  const messageContext = Buffer.from(
    JSON.stringify({
      userPoolId: event.userPoolId,
      clientId: event.callerContext.clientId,
    })
  );
  const kmsKeyId = requireConfig("kmsKeyId");
  const { Signature: signature } = await kms.send(
    new SignCommand({
      KeyId: kmsKeyId,
      Message: createHash("sha512")
        .end(Buffer.concat([message, messageContext]))
        .digest(),
      SigningAlgorithm: "RSASSA_PSS_SHA_512",
      MessageType: "DIGEST",
    })
  );
  if (!signature) {
    throw new Error("Failed to create signature with KMS");
  }
  logger.debug("Storing magic link hash in DynamoDB ...");
  const salt = requireConfig("salt");
  await ddbDocClient
    .send(
      new PutCommand({
        TableName: requireConfig("dynamodbSecretsTableName"),
        Item: {
          userNameHash: createHash("sha256")
            .update(salt)
            .end(event.userName)
            .digest(),
          signatureHash: createHash("sha256")
            .update(salt)
            .end(signature)
            .digest(),
          iat,
          exp,
          kmsKeyId: kmsKeyId,
        },
        // Throttle: fail if we've alreay sent a magic link less than SECONDS_BETWEEN seconds ago:
        ConditionExpression: "attribute_not_exists(#iat) or #iat < :iat",
        ExpressionAttributeNames: {
          "#iat": "iat",
        },
        ExpressionAttributeValues: {
          ":iat": Math.floor(Date.now() / 1000) - config.minimumSecondsBetween,
        },
      })
    )
    .catch(handleConditionalCheckFailedException(config.notNowMsg));
  const secretLoginLink = `${redirectUri}#${message.toString(
    "base64url"
  )}.${Buffer.from(signature).toString("base64url")}`;
  logger.debug("Sending magic link ...");
  // Toggle userNotFound error with "Prevent user existence errors" in the Cognito app client. (see above)
  if (event.request.userNotFound) {
    return;
  }
  await config.emailSender({
    emailAddress: event.request.userAttributes.email,
    content: await config.contentCreator.call(undefined, {
      secretLoginLink,
    }),
  });
  logger.debug("Magic link sent!");
}

export async function addChallengeVerificationResultToEvent(
  event: VerifyAuthChallengeResponseTriggerEvent
) {
  logger.info("Verifying MagicLink Challenge Response ...");
  // Toggle userNotFound error with "Prevent user existence errors" in the Cognito app client. (see above)
  if (event.request.userNotFound) {
    logger.info("User not found");
  }
  if (!config.magicLinkEnabled)
    throw new UserFacingError("Sign-in with Magic Link not supported");
  if (
    event.request.privateChallengeParameters.challenge ===
      "PROVIDE_AUTH_PARAMETERS" &&
    event.request.clientMetadata?.alreadyHaveMagicLink !== "yes"
  )
    return;
  event.response.answerCorrect = await verifyMagicLink(
    event.request.challengeAnswer,
    event.userName,
    {
      userPoolId: event.userPoolId,
      clientId: event.callerContext.clientId,
    }
  );
}

async function downloadPublicKey(kmsKeyId: string) {
  logger.debug("Downloading KMS public key");
  const { PublicKey: publicKey } = await kms.send(
    new GetPublicKeyCommand({
      KeyId: kmsKeyId,
    })
  );
  if (!publicKey) {
    throw new Error("Failed to download public key from KMS");
  }
  return createPublicKey({
    key: publicKey as Buffer,
    format: "der",
    type: "spki",
  });
}

async function verifyMagicLink(
  magicLinkFragmentIdentifier: string,
  userName: string,
  context: { userPoolId: string; clientId: string }
) {
  logger.debug(
    "Verifying magic link fragment identifier:",
    magicLinkFragmentIdentifier
  );
  const [messageB64, signatureB64] = magicLinkFragmentIdentifier.split(".");
  const signature = Buffer.from(signatureB64, "base64url");

  // Read and update item from DynamoDB. If the item has `uat` (used at)
  // attribute, no update is performed and no item is returned.
  let dbItem: Record<string, unknown> | undefined = undefined;
  try {
    const salt = requireConfig("salt");

    const userNameHash = createHash("sha256")
      .update(salt)
      .end(userName)
      .digest();
    const signatureHash = createHash("sha256")
      .update(salt)
      .end(signature)
      .digest();
    const uat = Math.floor(Date.now() / 1000);

    ({ Attributes: dbItem } = await ddbDocClient.send(
      new UpdateCommand({
        TableName: requireConfig("dynamodbSecretsTableName"),
        Key: {
          userNameHash,
        },
        ReturnValues: "ALL_OLD",
        UpdateExpression: "SET #uat = :uat",
        ConditionExpression:
          "attribute_exists(#userNameHash) AND attribute_exists(#signatureHash) AND #signatureHash = :signatureHash AND attribute_not_exists(#uat)",
        ExpressionAttributeNames: {
          "#userNameHash": "userNameHash",
          "#signatureHash": "signatureHash",
          "#uat": "uat",
        },
        ExpressionAttributeValues: {
          ":signatureHash": signatureHash,
          ":uat": uat,
        },
      })
    ));
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      logger.error(
        "Attempt to use invalid (potentially superseeded) magic link"
      );
      return false;
    }
    throw err;
  }
  if (!dbItem) {
    logger.error("Attempt to use invalid (potentially superseeded) magic link");
    return false;
  }
  assertIsMagicLinkRecord(dbItem);
  if (dbItem.exp < Date.now() / 1000) {
    logger.error("Magic link expired");
    return false;
  }
  publicKeys[dbItem.kmsKeyId] ??= await downloadPublicKey(dbItem.kmsKeyId);
  const verifier = createVerify("RSA-SHA512");
  const message = Buffer.from(messageB64, "base64url");
  verifier.update(message);
  const messageContext = Buffer.from(JSON.stringify(context));
  verifier.update(messageContext);
  const valid = verifier.verify(
    {
      key: publicKeys[dbItem.kmsKeyId],
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    signature
  );
  logger.debug(`Magic link signature is ${valid ? "" : "NOT "}valid`);
  if (!valid) return false;
  const parsed: unknown = JSON.parse(message.toString());
  assertIsMessage(parsed);
  logger.debug("Checking message:", parsed);
  if (parsed.userName !== userName) {
    logger.error("Username mismatch");
    return false;
  }
  if (parsed.exp !== dbItem.exp || parsed.iat !== dbItem.iat) {
    logger.error("State mismatch");
    return false;
  }
  return valid;
}

function assertIsMagicLinkRecord(msg: unknown): asserts msg is {
  userNameHash: string;
  signatureHash: string;
  exp: number;
  iat: number;
  kmsKeyId: string;
  uat?: number;
} {
  if (
    !msg ||
    typeof msg !== "object" ||
    !("userNameHash" in msg) ||
    !(msg.userNameHash instanceof Uint8Array) ||
    !("signatureHash" in msg) ||
    !(msg.signatureHash instanceof Uint8Array) ||
    !("exp" in msg) ||
    typeof msg.exp !== "number" ||
    !("iat" in msg) ||
    typeof msg.iat !== "number" ||
    !("kmsKeyId" in msg) ||
    typeof msg.kmsKeyId !== "string" ||
    ("uat" in msg && typeof msg.uat !== "number")
  ) {
    throw new Error("Invalid magic link record");
  }
}

function assertIsMessage(
  msg: unknown
): asserts msg is { userName: string; exp: number; iat: number } {
  if (
    !msg ||
    typeof msg !== "object" ||
    !("userName" in msg) ||
    typeof msg.userName !== "string" ||
    !("exp" in msg) ||
    typeof msg.exp !== "number" ||
    !("iat" in msg) ||
    typeof msg.iat !== "number"
  ) {
    throw new Error("Invalid magic link");
  }
}
