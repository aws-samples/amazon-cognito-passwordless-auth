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
  APIGatewayProxyWithCognitoAuthorizerHandler,
  APIGatewayProxyHandler,
} from "aws-lambda";
import { createHash, randomBytes } from "crypto";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { decodeFirstSync } from "cbor";
import {
  determineUserHandle,
  logger,
  handleConditionalCheckFailedException,
  UserFacingError,
  withCommonHeaders,
  isValidOrigin,
} from "./common.js";
import { NotificationPayload } from "./fido2-notification.js";

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const lambdaClient = new LambdaClient({});
const allowedRelyingPartyIds = (
  process.env.ALLOWED_RELYING_PARTY_IDS ?? ""
).split(",");
const allowedRelyingPartyIdHashes = allowedRelyingPartyIds.map(
  (relyingPartyId) =>
    createHash("sha256").update(relyingPartyId).digest("base64url")
);
const relyingPartyName = process.env.RELYING_PARTY_NAME!;
const allowedApplicationOrigins =
  process.env.ALLOWED_APPLICATION_ORIGINS?.split(",") ?? [];
const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((href) => new URL(href))
    .map((url) => url.origin) ?? [];
if (!allowedOrigins.length)
  throw new Error("Environment variable ALLOWED_ORIGINS is not set");
const authenticatorRegistrationTimeout = Number(
  process.env.AUTHENTICATOR_REGISTRATION_TIMEOUT ?? "300000"
);
const notificationsEnabled = !!process.env.FIDO2_NOTIFICATION_LAMBDA_ARN;
const allowedKty: Record<number, string> = { 2: "EC", 3: "RSA" };
const allowedAlg: Record<number, string> = { "-7": "ES256", "-257": "RS256" };
const headers = {
  "Strict-Transport-Security": "max-age=31536000; includeSubdomains; preload",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const _handler: APIGatewayProxyWithCognitoAuthorizerHandler = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));
  logger.info("FIDO2 credentials API invocation:", event.path);
  if (event.requestContext.authorizer?.claims.token_use !== "id") {
    logger.info("ERROR: This API must be accessed using the ID Token");
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Use your ID token to access this API" }),
      headers,
    };
  }
  try {
    const {
      sub,
      email,
      phone_number: phoneNumber,
      name,
      "cognito:username": cognitoUsername,
    } = event.requestContext.authorizer.claims;
    const userHandle = determineUserHandle({ sub, cognitoUsername });
    const userName = email ?? phoneNumber ?? name ?? cognitoUsername;
    const displayName = name ?? email;
    if (event.path === "/register-authenticator/start") {
      logger.info("Starting a new authenticator registration ...");
      if (!userName) {
        throw new Error("Unable to determine name for user");
      }
      if (!displayName) {
        throw new Error("Unable to determine display name for user");
      }
      const rpId = event.queryStringParameters?.rpId;
      if (!rpId) {
        throw new UserFacingError("Missing RP ID");
      }
      if (!allowedRelyingPartyIds.includes(rpId)) {
        throw new UserFacingError("Unrecognized RP ID");
      }
      const options = await requestCredentialsChallenge({
        userId: userHandle,
        name: userName,
        displayName,
        rpId,
      });
      logger.debug("Options:", JSON.stringify(options));
      return {
        statusCode: 200,
        body: JSON.stringify(options),
        headers,
      };
    } else if (event.path === "/register-authenticator/complete") {
      logger.info("Completing the new authenticator registration ...");
      const storedCredential = await handleCredentialsResponse(
        userHandle,
        parseBody(event)
      );
      if (notificationsEnabled) {
        await enqueueFido2Notification({
          cognitoUsername,
          eventType: "FIDO2_CREDENTIAL_CREATED",
          friendlyName: storedCredential.friendlyName,
        });
      }
      return {
        statusCode: 200,
        body: JSON.stringify(storedCredential),
        headers,
      };
    } else if (event.path === "/authenticators/list") {
      logger.info("Listing authenticators ...");
      const rpId = event.queryStringParameters?.rpId;
      if (!rpId) {
        throw new UserFacingError("Missing RP ID");
      }
      if (!allowedRelyingPartyIds.includes(rpId)) {
        throw new UserFacingError("Unrecognized RP ID");
      }
      const authenticators = await getExistingCredentialsForUser({
        userId: userHandle,
        rpId,
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          authenticators,
        }),
        headers,
      };
    } else if (event.path === "/authenticators/delete") {
      logger.info("Deleting authenticator ...");
      const parsed = parseBody(event);
      assertBodyIsObject(parsed);
      logger.debug("CredentialId:", parsed.credentialId);
      const deletedCredential = await deleteCredential({
        userId: userHandle,
        credentialId: parsed.credentialId,
      });
      if (deletedCredential && notificationsEnabled) {
        await enqueueFido2Notification({
          cognitoUsername,
          eventType: "FIDO2_CREDENTIAL_DELETED",
          friendlyName: deletedCredential.friendlyName,
        });
      }
      return { statusCode: 204, body: "", headers };
    } else if (event.path === "/authenticators/update") {
      const parsed = parseBody(event);
      assertBodyIsObject(parsed);
      await updateCredential({
        userId: userHandle,
        credentialId: parsed.credentialId,
        friendlyName: parsed.friendlyName,
      });
      return { statusCode: 200, body: "", headers };
    }
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Not found" }),
      headers,
    };
  } catch (err) {
    logger.error(err);
    if (err instanceof UserFacingError)
      return {
        statusCode: 400,
        body: JSON.stringify({ message: err.message }),
        headers,
      };
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
      headers,
    };
  }
};
export const handler = withCommonHeaders(_handler as APIGatewayProxyHandler);

interface UserDetails {
  id: string;
  name: string;
  displayName: string;
}

type RpPublicKeyCredentialCreationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials"
> & {
  challenge: string;
  user: UserDetails;
  excludeCredentials: RpPublicKeyCredentialDescriptor[];
  timeout: number;
};

type RpPublicKeyCredentialDescriptor = Omit<
  PublicKeyCredentialDescriptor,
  "id"
> & { id: string };

interface StoredCredential {
  credentialId: Buffer;
  friendlyName: string;
  createdAt: string;
  flagUserVerified: 0 | 1;
  aaguid: Buffer;
  transports?: Transport[];
  lastSignIn?: string;
  signCount: number;
  rpId: string;
}

interface Credential {
  credentialId: string;
  friendlyName: string;
  createdAt: Date;
  flagUserVerified: 0 | 1;
  flagBackupEligibility: 0 | 1;
  flagBackupState: 0 | 1;
  aaguid: string;
  transports?: Transport[];
  lastSignIn?: Date;
  signCount: number;
  rpId: string;
}

async function getExistingCredentialsForUser({
  userId,
  rpId,
}: {
  userId: string;
  rpId: string;
}) {
  const credentials: StoredCredential[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  do {
    {
      const { Items, LastEvaluatedKey } = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
          KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
          ProjectionExpression:
            "createdAt,credentialId,friendlyName,lastSignIn,signCount,transports,aaguid,rpId",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "CREDENTIAL#",
            ":rpId": rpId,
          },
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk": "sk",
            "#rpId": "rpId",
          },
          ExclusiveStartKey: exclusiveStartKey,
          FilterExpression: "#rpId = :rpId",
        })
      );
      Items?.forEach((item) => {
        credentials.push({
          ...item,
          credentialId: Buffer.from(item.credentialId as number[]),
          aaguid: Buffer.from(item.aaguid as number[]),
        } as StoredCredential);
      });
      exclusiveStartKey = LastEvaluatedKey as Record<string, unknown>;
    }
  } while (exclusiveStartKey);
  return credentials.map(
    (credential) =>
      ({
        ...credential,
        credentialId: credential.credentialId.toString("base64url"),
        aaguid: credential.aaguid.toString("base64url"),
        rpId,
        createdAt: new Date(credential.createdAt),
        lastSignIn: credential.lastSignIn && new Date(credential.lastSignIn),
      }) as Credential
  );
}

async function deleteCredential({
  userId,
  credentialId,
}: {
  userId: string;
  credentialId: unknown;
}) {
  if (typeof credentialId !== "string") {
    throw new UserFacingError(
      `credentialId should be a string, received ${typeof credentialId}`
    );
  }
  const { Attributes: credential } = await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
      Key: {
        pk: `USER#${userId}`,
        sk: `CREDENTIAL#${credentialId}`,
      },
      ReturnValues: "ALL_OLD",
    })
  );
  return credential as StoredCredential;
}

async function updateCredential({
  userId,
  credentialId,
  friendlyName,
}: {
  userId: string;
  credentialId: unknown;
  friendlyName: unknown;
}) {
  if (typeof credentialId !== "string") {
    throw new UserFacingError(
      `credentialId should be a string, received ${typeof credentialId}`
    );
  }
  if (typeof friendlyName !== "string") {
    throw new UserFacingError(
      `friendlyName should be a string, received ${typeof credentialId}`
    );
  }
  await ddbDocClient
    .send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
        Key: {
          pk: `USER#${userId}`,
          sk: `CREDENTIAL#${credentialId}`,
        },
        UpdateExpression: "set #friendlyName = :friendlyName",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ExpressionAttributeNames: {
          "#friendlyName": "friendlyName",
        },
        ExpressionAttributeValues: {
          ":friendlyName": friendlyName,
        },
      })
    )
    .catch(handleConditionalCheckFailedException("Unknown credential"));
}

async function storeAuthenticatorChallenge(
  options: RpPublicKeyCredentialCreationOptions
) {
  await ddbDocClient
    .send(
      new PutCommand({
        TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
        Item: {
          pk: `USER#${options.user.id}`,
          sk: `CHALLENGE#${options.challenge}`,
          options: options,
          exp: Math.floor((Date.now() + options.timeout) / 1000),
        },
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    )
    .catch(handleConditionalCheckFailedException("Duplicate challenge"));
}

async function requestCredentialsChallenge({
  userId,
  name,
  displayName,
  rpId,
}: {
  userId: string;
  name: string;
  displayName: string;
  rpId: string;
}) {
  logger.info("Requesting credential challenge ...");
  const existingCredentials = await getExistingCredentialsForUser({
    userId,
    rpId,
  });
  const options: RpPublicKeyCredentialCreationOptions = {
    challenge: randomBytes(64).toString("base64url"),
    attestation:
      (process.env.ATTESTATION as AttestationConveyancePreference) ?? "none",
    rp: {
      name: relyingPartyName,
      id: rpId,
    },
    user: {
      id: userId,
      name,
      displayName,
    },
    pubKeyCredParams: Object.keys(allowedAlg).map((alg) => ({
      type: "public-key",
      alg: Number(alg),
    })),
    authenticatorSelection: {
      userVerification: process.env
        .USER_VERIFICATION as UserVerificationRequirement,
      authenticatorAttachment:
        (process.env.AUTHENTICATOR_ATTACHMENT as AuthenticatorAttachment) ||
        undefined,
      residentKey:
        (process.env.REQUIRE_RESIDENT_KEY as ResidentKeyRequirement) ||
        undefined,
      requireResidentKey:
        (process.env.REQUIRE_RESIDENT_KEY &&
          process.env.REQUIRE_RESIDENT_KEY === "required") ||
        undefined,
    },
    timeout: authenticatorRegistrationTimeout, // 6 minutes
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      type: "public-key",
    })),
  };
  await storeAuthenticatorChallenge(options);
  return options;
}

interface CompleteCreateCredentialResponse {
  attestationObjectB64: string;
  clientDataJSON_B64: string;
  friendlyName: string;
  transports?: Transport[];
}

function assertBodyIsObject(
  body: unknown
): asserts body is Record<string | number, unknown> {
  if (body === null || typeof body !== "object") {
    throw new UserFacingError(
      `Expected body to be an object, but got ${typeof body}`
    );
  }
}

function assertBodyIsCredentialsResponse(
  body: unknown
): asserts body is CompleteCreateCredentialResponse {
  assertBodyIsObject(body);
  ["attestationObjectB64", "clientDataJSON_B64", "friendlyName"].forEach(
    (key) => {
      // eslint-disable-next-line security/detect-object-injection
      if (!body[key] || typeof body[key] !== "string") {
        throw new UserFacingError(
          // eslint-disable-next-line security/detect-object-injection
          `Expected ${key} to be a string, but got ${typeof body[key]}`
        );
      }
    }
  );
  if (body.transports) {
    if (!Array.isArray(body.transports)) {
      throw new UserFacingError(
        `Expected transports to be a string array, but got ${typeof body.transports}`
      );
    }
    body.transports.forEach((transport) => {
      if (typeof transport !== "string") {
        throw new UserFacingError(
          `Expected transport to be a string, but got ${typeof transport}`
        );
      }
      if (!["usb", "nfc", "ble", "internal", "hybrid"].includes(transport)) {
        throw new UserFacingError(
          `Expected transport to be one of "usb", "nfc", "ble", "internal", "hybrid", but got: ${transport}`
        );
      }
    });
  }
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
    throw new UserFacingError("Invalid client data");
  }
}

async function handleCredentialsResponse(
  userId: string,
  body: unknown
): Promise<Credential> {
  assertBodyIsCredentialsResponse(body);
  const clientData: unknown = JSON.parse(
    Buffer.from(body.clientDataJSON_B64, "base64url").toString()
  );
  logger.debug("clientData:", JSON.stringify(clientData));
  assertIsClientData(clientData);
  if (typeof clientData !== "object") {
    throw new UserFacingError(
      `clientData is not an object: ${JSON.stringify(clientData)}`
    );
  }
  if (clientData.type !== "webauthn.create") {
    throw new UserFacingError(
      `Invalid clientData type: ${JSON.stringify(clientData)}`
    );
  }

  const { Attributes: storedChallenge } = await ddbDocClient
    .send(
      new DeleteCommand({
        TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
        Key: {
          pk: `USER#${userId}`,
          sk: `CHALLENGE#${clientData.challenge}`,
        },
        ReturnValues: "ALL_OLD",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
      })
    )
    .catch(handleConditionalCheckFailedException("Challenge not found"));
  if (!storedChallenge || (storedChallenge.exp as number) * 1000 < Date.now()) {
    throw new UserFacingError("Challenge not found");
  }
  logger.debug("Challenge found:", JSON.stringify(storedChallenge));
  if (
    !isValidOrigin(clientData.origin, allowedOrigins, allowedApplicationOrigins)
  ) {
    throw new UserFacingError(
      `Invalid clientData origin: ${clientData.origin}`
    );
  }
  const attestation = cborDecode(
    Buffer.from(body.attestationObjectB64, "base64url"),
    "attestation object"
  );
  logger.debug("CBOR attestation object:", attestation);
  assertIsAttestation(attestation);
  logger.debug("authDataB64:", attestation.authData.toString("base64url"));
  const authData = parseAttestationObjectAuthData(attestation.authData);
  logger.debug("Parsed authData:", JSON.stringify(authData));
  const rpIdIndex = allowedRelyingPartyIdHashes.indexOf(
    authData.rpIdHash.toString("base64url")
  );
  if (rpIdIndex === -1) {
    throw new UserFacingError("Unrecognized rpIdHash");
  }
  const rpId = allowedRelyingPartyIds.at(rpIdIndex)!;
  if (!authData.flagUserPresent) {
    throw new UserFacingError("User is not present");
  }
  // Verify User Verified
  const userVerificationRequirement = process.env
    .USER_VERIFICATION as UserVerificationRequirement;
  if (
    (!userVerificationRequirement ||
      userVerificationRequirement === "required") &&
    !authData.flagUserVerified
  ) {
    throw new UserFacingError("User is not verified");
  }
  if (
    !(
      storedChallenge as { options: { pubKeyCredParams: { alg: number }[] } }
    ).options.pubKeyCredParams.find(
      (param) => allowedAlg[param.alg] === authData.credentialPublicKey.alg
    )
  ) {
    throw new UserFacingError("Unsupported public key alg");
  }
  if (authData.credentialId.length > 1023) {
    throw new UserFacingError(
      `Credential ID longer than 1023 bytes: ${authData.credentialId.length} bytes`
    );
  }
  await assertCredentialIsNew(authData.credentialId);
  const createdAt = new Date();
  await storeUserCredential({
    userId,
    credentialId: authData.credentialId,
    jwk: authData.credentialPublicKey,
    signCount: authData.signCount,
    friendlyName: body.friendlyName,
    flagUserVerified: authData.flagUserVerified,
    flagBackupEligibility: authData.flagBackupEligibility,
    flagBackupState: authData.flagBackupState,
    transports: body.transports,
    aaguid: authData.aaguid,
    rpId,
    createdAt,
  });
  return {
    credentialId: authData.credentialId.toString("base64url"),
    signCount: authData.signCount,
    friendlyName: body.friendlyName,
    flagUserVerified: authData.flagUserVerified,
    flagBackupEligibility: authData.flagBackupEligibility,
    flagBackupState: authData.flagBackupState,
    transports: body.transports,
    aaguid: authData.aaguid.toString("base64url"),
    rpId,
    createdAt,
  };
}

function assertIsAttestation(a: unknown): asserts a is { authData: Buffer } {
  if (
    !a ||
    typeof a !== "object" ||
    !("authData" in a) ||
    !Buffer.isBuffer(a.authData)
  ) {
    throw new UserFacingError("Invalid attestation");
  }
}

async function assertCredentialIsNew(credentialId: Buffer) {
  const { Items: items } = await ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
      IndexName: "credentialId",
      KeyConditionExpression: "#credentialId = :credentialId",
      ExpressionAttributeNames: {
        "#credentialId": "credentialId",
      },
      ExpressionAttributeValues: {
        ":credentialId": credentialId,
      },
      ProjectionExpression: "credentialId",
      Limit: 1,
    })
  );
  if (items && items.length) {
    throw new UserFacingError(
      `Credential already registered: ${credentialId.toString("base64url")}`
    );
  }
}

type Transport = "usb" | "nfc" | "ble" | "internal" | "hybrid";

async function storeUserCredential({
  userId,
  credentialId,
  jwk,
  signCount,
  friendlyName,
  flagUserVerified,
  flagBackupEligibility,
  flagBackupState,
  aaguid,
  transports,
  rpId,
  createdAt,
}: {
  userId: string;
  credentialId: Buffer;
  jwk: Record<string, unknown>;
  signCount: number;
  friendlyName: string;
  flagUserVerified: 0 | 1;
  flagBackupEligibility: 0 | 1;
  flagBackupState: 0 | 1;
  aaguid: Buffer;
  transports?: Transport[];
  rpId: string;
  createdAt: Date;
}) {
  await ddbDocClient
    .send(
      new PutCommand({
        TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
        Item: {
          pk: `USER#${userId}`,
          sk: `CREDENTIAL#${credentialId.toString("base64url")}`,
          userId,
          credentialId,
          jwk,
          signCount,
          friendlyName,
          flagUserVerified,
          flagBackupEligibility,
          flagBackupState,
          aaguid,
          transports,
          rpId,
          createdAt: createdAt.toISOString(),
        },
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    )
    .catch(handleConditionalCheckFailedException("Duplicate credential"));
}

function parseAttestationObjectAuthData(authData: Buffer) {
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData.subarray(32, 33)[0];
  const flagUserPresent = (flags & 0b1) as 0 | 1;
  const flagReservedFutureUse1 = ((flags >>> 1) & 0b1) as 0 | 1;
  const flagUserVerified = ((flags >>> 2) & 0b1) as 0 | 1;
  const flagBackupEligibility = ((flags >>> 3) & 0b1) as 0 | 1;
  const flagBackupState = ((flags >>> 4) & 0b1) as 0 | 1;
  const flagReservedFutureUse2 = ((flags >>> 5) & 0b1) as 0 | 1;
  const flagAttestedCredentialData = ((flags >>> 6) & 0b1) as 0 | 1;
  const flagExtensionDataIncluded = ((flags >>> 7) & 0b1) as 0 | 1;
  const signCount = authData.subarray(33, 37).readUInt32BE(0);
  const aaguid = authData.subarray(37, 53);
  const credentialIdLength = authData.subarray(53, 55).readUInt16BE(0);
  const credentialId = authData.subarray(55, 55 + credentialIdLength);
  const credentialPublicKey = authData.subarray(55 + credentialIdLength);

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
    aaguid,
    credentialId,
    credentialPublicKey: decodeCredentialPublicKey(credentialPublicKey),
  };
}

function decodeCredentialPublicKey(credentialPublicKey: Buffer) {
  const decoded = cborDecode(credentialPublicKey, "public key");
  logger.debug("CBOR decoded credential public key:", decoded);
  try {
    if (!(decoded instanceof Map)) {
      throw new UserFacingError("Invalid public key");
    }
    const typedMap = new TypedMap(decoded);
    const kty = typedMap.getNumber(1);
    // eslint-disable-next-line security/detect-object-injection
    const ktyName = allowedKty[kty];
    const kid = typedMap.getOptionalString(2);
    const alg = typedMap.getNumber(3);
    // eslint-disable-next-line security/detect-object-injection
    const algName = allowedAlg[alg];
    if (kty === 2) {
      // EC2
      const crv = typedMap.getNumber(-1);
      // eslint-disable-next-line security/detect-object-injection
      const crvName = { 1: "P-256" }[crv];
      const x = typedMap.getBuffer(-2);
      const y = typedMap.getBuffer(-3);
      const jwk = {
        alg: algName,
        crv: crvName,
        kid,
        kty: ktyName,
        x: x.toString("base64url"),
        y: y.toString("base64url"),
      };
      return jwk;
    } else if (kty === 3) {
      // RSA
      const n = typedMap.getBuffer(-1);
      const e = typedMap.getBuffer(-2);
      const jwk = {
        alg: algName,
        kid,
        kty: ktyName,
        n: n.toString("base64url"),
        e: e.toString("base64url"),
      };
      return jwk;
    } else {
      throw new Error(`Unsupported public key kty: ${kty}`);
    }
  } catch (err) {
    logger.error(err);
    throw new UserFacingError("Invalid public key");
  }
}

class TypedMap extends Map<unknown, unknown> {
  constructor(m: Map<unknown, unknown>) {
    super(m);
  }
  private ensureValue(key: string | number) {
    const value = super.get(key);
    if (value === undefined) {
      throw new Error(`Missing value for key ${key}`);
    }
    return value;
  }
  getOptionalString(key: string | number) {
    const value = this.get(key);
    if (value !== undefined && typeof value !== "string") {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Invalid value for key ${key}: ${value}`);
    }
    return value;
  }
  getNumber(key: string | number) {
    const value = this.ensureValue(key);
    if (typeof value !== "number") {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Invalid value for key ${key}: ${value}`);
    }
    return value;
  }
  getBuffer(key: string | number) {
    const value = this.ensureValue(key);
    if (typeof value !== "object" || !Buffer.isBuffer(value)) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Invalid value for key ${key}: ${value}`);
    }
    return value;
  }
}

function parseBody(event: { body?: string | null; isBase64Encoded: boolean }) {
  try {
    return event.body
      ? (JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, "base64url").toString()
            : event.body
        ) as unknown)
      : {};
  } catch (err) {
    logger.error(err);
    throw new UserFacingError("Invalid body");
  }
}

function cborDecode(b: Buffer, name: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return decodeFirstSync(b) as unknown;
  } catch (err) {
    logger.error(err);
    throw new UserFacingError(`Invalid ${name}`);
  }
}

async function enqueueFido2Notification(payload: NotificationPayload) {
  try {
    const command = new InvokeCommand({
      FunctionName: process.env.FIDO2_NOTIFICATION_LAMBDA_ARN!,
      InvocationType: "Event",
      Payload: JSON.stringify(payload),
    });
    await lambdaClient.send(command);
    logger.info("Successfully enqueued notification to user");
  } catch (error) {
    // Since the notification is best effort, we'll log but otherwise swallow the error
    logger.error("Failed to enqueue notification to user:", error);
  }
}
