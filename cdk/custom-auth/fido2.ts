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
import {
  VerifyAuthChallengeResponseTriggerEvent,
  CreateAuthChallengeTriggerEvent,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes, JsonWebKey } from "crypto";
import { createVerify, createHash, createPublicKey } from "crypto";
import { logger, UserFacingError, determineUserHandle } from "./common.js";

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
interface StoredCredential {
  id: string;
  transports?: string[];
  jwk: JsonWebKey;
  signCount: number;
  flagBackupEligibility: 0 | 1;
}

let config = {
  fido2enabled: !!process.env.FIDO2_ENABLED,
  dynamoDbAuthenticatorsTableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",")
    .map((href) => new URL(href))
    .map((url) => url.href),
  allowedRelyingPartyIds: process.env.ALLOWED_RELYING_PARTY_IDS?.split(","),
  relyingPartyId: process.env.RELYING_PARTY_ID,
  userVerification: process.env
    .USER_VERIFICATION as UserVerificationRequirement,
  exposeUserCredentialIds: !!process.env.EXPOSE_USER_CREDENTIAL_IDS,
  challengeGenerator: () => randomBytes(64).toString("base64url"),
  timeout: 120000, // 2 minutes,
  enforceFido2IfAvailable: !!process.env.ENFORCE_FIDO2_IF_AVAILABLE,
  salt: process.env.STACK_ID,
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
  config = { ...config, ...update };
  return config;
}

export async function addChallengeToEvent(
  event: CreateAuthChallengeTriggerEvent
) {
  if (config.fido2enabled) {
    logger.info("Adding FIDO2 challenge to event ...");
    const fido2options = JSON.stringify(
      await createChallenge({
        userId: determineUserHandle({
          sub: event.request.userAttributes.sub,
          cognitoUsername: event.userName,
        }),
        relyingPartyId: config.relyingPartyId,
        userVerification: config.userVerification,
        exposeUserCredentialIds: config.exposeUserCredentialIds,
        userNotFound: event.request.userNotFound,
      })
    );
    event.response.privateChallengeParameters.fido2options = fido2options;
    event.response.publicChallengeParameters.fido2options = fido2options;
  }
}

export async function createChallenge({
  userId,
  relyingPartyId,
  exposeUserCredentialIds = config.exposeUserCredentialIds,
  challengeGenerator = config.challengeGenerator,
  userVerification = config.userVerification,
  credentialGetter = getCredentialsForUser,
  timeout = config.timeout,
  userNotFound = false,
}: {
  userId?: string;
  relyingPartyId?: string;
  exposeUserCredentialIds?: boolean;
  challengeGenerator?: () => Promise<string> | string;
  userVerification?: UserVerificationRequirement;
  credentialGetter?: typeof getCredentialsForUser;
  timeout?: number;
  userNotFound?: boolean;
}) {
  let credentials:
    | Awaited<ReturnType<typeof getCredentialsForUser>>
    | undefined = undefined;
  if (exposeUserCredentialIds) {
    if (!userId) {
      throw new Error(
        "userId param is mandatory when exposeUserCredentialIds is true"
      );
    }
    credentials = await credentialGetter({
      userId,
    });
    const salt = requireConfig("salt");
    if (userNotFound) {
      logger.info("User not found");
      credentials = [
        {
          id: createHash("sha256")
            .update(salt)
            .update(userId)
            .digest("base64url"),
          transports: ["internal"],
        },
      ];
    }
  }
  return {
    relyingPartyId,
    challenge: await challengeGenerator(),
    credentials,
    timeout,
    userVerification,
  };
}

export async function addChallengeVerificationResultToEvent(
  event: VerifyAuthChallengeResponseTriggerEvent
) {
  logger.info("Verifying FIDO2 Challenge Response ...");
  if (event.request.userNotFound) {
    logger.info("User not found");
  }
  if (!config.fido2enabled)
    throw new UserFacingError("Sign-in with FIDO2 (Face/Touch) not supported");
  try {
    const authenticatorAssertion: unknown = JSON.parse(
      event.request.challengeAnswer
    );
    assertIsAuthenticatorAssertion(authenticatorAssertion);
    await verifyChallenge({
      userId: determineUserHandle({
        sub: event.request.userAttributes.sub,
        cognitoUsername: event.userName,
      }),
      fido2options: JSON.parse(
        event.request.privateChallengeParameters.fido2options
      ) as Parameters<typeof verifyChallenge>[0]["fido2options"],
      authenticatorAssertion,
    });
    event.response.answerCorrect = true;
  } catch (err) {
    logger.error(err);
    event.response.answerCorrect = false;
  }
}

interface SerializedAuthenticatorAssertion {
  credentialIdB64: string;
  authenticatorDataB64: string;
  clientDataJSON_B64: string;
  signatureB64: string;
  userHandleB64?: string;
}

function assertIsAuthenticatorAssertion(
  a: unknown
): asserts a is SerializedAuthenticatorAssertion {
  if (
    !a ||
    typeof a !== "object" ||
    !("credentialIdB64" in a) ||
    typeof a.credentialIdB64 !== "string" ||
    !("authenticatorDataB64" in a) ||
    typeof a.authenticatorDataB64 !== "string" ||
    !("clientDataJSON_B64" in a) ||
    typeof a.clientDataJSON_B64 !== "string" ||
    !("signatureB64" in a) ||
    typeof a.signatureB64 !== "string" ||
    ("userHandleB64" in a &&
      a.userHandleB64 != undefined &&
      typeof a.userHandleB64 !== "string")
  ) {
    throw new Error("Invalid authenticator assertion");
  }
}

export async function verifyChallenge({
  userId,
  fido2options,
  authenticatorAssertion: {
    credentialIdB64,
    authenticatorDataB64,
    clientDataJSON_B64,
    signatureB64,
    userHandleB64,
  },
  credentialGetter = getCredentialForUser,
  credentialUpdater = updateCredential,
}: {
  userId: string;
  fido2options: {
    challenge: string;
    credentials?: StoredCredential[];
    userVerification: UserVerificationRequirement;
  };
  authenticatorAssertion: SerializedAuthenticatorAssertion;
  credentialGetter?: typeof getCredentialForUser;
  credentialUpdater?: typeof updateCredential;
}) {
  // Verify user ID
  const userHandle =
    userHandleB64 && Buffer.from(userHandleB64, "base64url").toString();
  if (userHandle && userHandle !== userId) {
    throw new Error(
      `User handle mismatch, got ${userHandle} but expected ${userId}`
    );
  }

  // Verify Credential ID is known
  const credentialId = credentialIdB64
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=?=?$/, "");
  if (
    fido2options.credentials &&
    !fido2options.credentials.map((cred) => cred.id).includes(credentialId)
  ) {
    throw new Error(`Unknown credential ID: ${credentialId}`);
  }
  const storedCredential = await credentialGetter({ userId, credentialId });
  if (!storedCredential) {
    throw new Error(`Unknown credential ID: ${credentialId}`);
  }

  // Verify Client Data
  const cData = Buffer.from(clientDataJSON_B64, "base64url");
  const clientData: unknown = JSON.parse(cData.toString());
  assertIsClientData(clientData);
  if (clientData.type !== "webauthn.get") {
    throw new Error(`Invalid clientData type: ${clientData.type}`);
  }
  if (
    !Buffer.from(clientData.challenge, "base64url").equals(
      Buffer.from(fido2options.challenge, "base64url")
    )
  ) {
    throw new Error(
      `Challenge mismatch, got ${clientData.challenge} but expected ${fido2options.challenge}`
    );
  }
  if (
    !requireConfig("allowedOrigins").includes(new URL(clientData.origin).href)
  ) {
    throw new Error(`Invalid clientData origin: ${clientData.origin}`);
  }

  const authenticatorData = Buffer.from(authenticatorDataB64, "base64url");
  const {
    rpIdHash,
    flagUserPresent,
    flagUserVerified,
    signCount,
    flagBackupEligibility,
    flagBackupState,
  } = parseAuthenticatorData(authenticatorData);

  const allowedRelyingPartyIdHashes = requireConfig(
    "allowedRelyingPartyIds"
  ).map((relyingPartyId) =>
    createHash("sha256").update(relyingPartyId).digest("base64url")
  );
  // Verify RP ID HASH
  if (!allowedRelyingPartyIdHashes.includes(rpIdHash)) {
    throw new Error(
      `Wrong rpIdHash: ${rpIdHash}, expected one of: ${allowedRelyingPartyIdHashes.join(
        ", "
      )}`
    );
  }

  // Verify User Present Flag
  if (!flagUserPresent) {
    throw new Error("User is not present");
  }

  // Verify User Verified
  if (
    (!fido2options.userVerification ||
      fido2options.userVerification === "required") &&
    !flagUserVerified
  ) {
    throw new Error("User is not verified");
  }

  // Verify flagBackupEligibility is unchanged
  if (flagBackupEligibility !== storedCredential.flagBackupEligibility) {
    throw new Error("Credential backup eligibility changed");
  }

  if (!flagBackupEligibility && flagBackupState) {
    throw new Error("Credential is not eligible for backup");
  }

  // Verify signature
  const hash = createHash("sha256").update(cData).digest();
  const valid = createVerify("sha256")
    .update(Buffer.concat([authenticatorData, hash]))
    .verify(
      createPublicKey({
        key: storedCredential.jwk,
        format: "jwk",
      }),
      signatureB64,
      "base64url"
    );
  if (!valid) {
    throw new Error("Signature not valid");
  }

  // Verify signCount
  const storedSignCount = storedCredential.signCount;
  if (storedSignCount !== 0 || signCount !== 0) {
    if (signCount <= storedSignCount) {
      throw new Error(
        `Sign count mismatch, got ${signCount} but expected a number greater than ${storedSignCount}`
      );
    }
  }
  // Update credential signCount
  // (even if 0 perpetually, this call updates the lastSignIn field too)
  await credentialUpdater({
    userId,
    credentialId,
    signCount,
    flagBackupState,
  });
}

function assertIsClientData(cd: unknown): asserts cd is {
  type: string;
  challenge: string;
  origin: string;
} {
  if (
    !cd ||
    typeof cd !== "object" ||
    !("type" in cd) ||
    typeof cd.type !== "string" ||
    !("challenge" in cd) ||
    typeof cd.challenge !== "string" ||
    !("origin" in cd) ||
    typeof cd.origin !== "string"
  ) {
    throw new Error("Invalid client data");
  }
}

function parseAuthenticatorData(authData: Buffer) {
  const rpIdHash = authData.subarray(0, 32).toString("base64url");
  const flags = authData.subarray(32, 33)[0];
  const flagUserPresent = flags & 0b1;
  const flagReservedFutureUse1 = (flags >>> 1) & 0b1;
  const flagUserVerified = (flags >>> 2) & 0b1;
  const flagBackupEligibility = ((flags >>> 3) & 0b1) as 0 | 1;
  const flagBackupState = ((flags >>> 4) & 0b1) as 0 | 1;
  const flagReservedFutureUse2 = ((flags >>> 5) & 0b1) as 0 | 1;
  const flagAttestedCredentialData = (flags >>> 6) & 0b1;
  const flagExtensionDataIncluded = (flags >>> 7) & 0b1;
  const signCount = authData.subarray(33, 37).readUInt32BE(0);

  return {
    rpIdHash,
    flagUserPresent,
    flagReservedFutureUse1,
    flagUserVerified,
    flagBackupEligibility,
    flagBackupState,
    flagReservedFutureUse2,
    flagAttestedCredentialData,
    flagExtensionDataIncluded,
    signCount,
  };
}

async function getCredentialsForUser({
  userId,
  limit,
}: {
  userId: string;
  limit?: number;
}) {
  const credentials: Omit<
    StoredCredential,
    "jwk" | "signCount" | "flagBackupEligibility"
  >[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  do {
    {
      const { Items, LastEvaluatedKey } = await ddbDocClient.send(
        new QueryCommand({
          TableName: requireConfig("dynamoDbAuthenticatorsTableName"),
          KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "CREDENTIAL#",
          },
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk": "sk",
          },
          ExclusiveStartKey: exclusiveStartKey,
          ProjectionExpression: "credentialId, transports",
          Limit: limit,
        })
      );
      Items?.forEach((item) => {
        credentials.push({
          id: Buffer.from(item.credentialId as number[]).toString("base64url"),
          transports: item.transports as string[],
        });
      });
      exclusiveStartKey = LastEvaluatedKey as Record<string, unknown>;
    }
  } while (exclusiveStartKey);
  return credentials;
}

async function getCredentialForUser({
  userId,
  credentialId,
}: {
  userId: string;
  credentialId: string;
}) {
  const { Item: storedCredential } = await ddbDocClient.send(
    new GetCommand({
      TableName: requireConfig("dynamoDbAuthenticatorsTableName"),
      Key: {
        pk: `USER#${userId}`,
        sk: `CREDENTIAL#${credentialId}`,
      },
      ProjectionExpression:
        "credentialId, transports, jwk, signCount, flagBackupEligibility",
    })
  );
  return (
    storedCredential &&
    ({
      ...storedCredential,
      id: Buffer.from(storedCredential.credentialId as number[]).toString(
        "base64url"
      ),
    } as StoredCredential)
  );
}

async function updateCredential({
  userId,
  credentialId,
  signCount,
  flagBackupState,
}: {
  userId: string;
  credentialId: string;
  signCount: number;
  flagBackupState: 0 | 1;
}) {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: requireConfig("dynamoDbAuthenticatorsTableName"),
      Key: {
        pk: `USER#${userId}`,
        sk: `CREDENTIAL#${credentialId}`,
      },
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
      UpdateExpression:
        "set #lastSignIn = :lastSignIn, #signCount = :signCount, #flagBackupState = :flagBackupState",
      ExpressionAttributeNames: {
        "#lastSignIn": "lastSignIn",
        "#signCount": "signCount",
        "#flagBackupState": "flagBackupState",
      },
      ExpressionAttributeValues: {
        ":lastSignIn": new Date().toISOString(),
        ":signCount": signCount,
        ":flagBackupState": flagBackupState,
      },
    })
  );
}

export async function assertFido2SignInOptional(
  event: VerifyAuthChallengeResponseTriggerEvent
) {
  if (!config.fido2enabled) return;
  if (!config.enforceFido2IfAvailable) return;
  const userId = determineUserHandle({
    sub: event.request.userAttributes.sub,
    cognitoUsername: event.userName,
  });
  const credentials = await getCredentialsForUser({
    userId,
    limit: 1,
  });
  if (credentials.length) {
    logger.info(
      "Denying non-FIDO2 sign-in as at least 1 existing FIDO2 credential is available to user:",
      userId
    );
    throw new UserFacingError(
      "You must sign-in with FIDO2 (e.g. Face or Touch)"
    );
  }
}
