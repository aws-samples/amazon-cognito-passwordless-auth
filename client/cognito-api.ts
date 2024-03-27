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
import { parseJwtPayload, throwIfNot2xx, bufferToBase64 } from "./util.js";
import { configure, MinimalResponse } from "./config.js";
import { retrieveTokens } from "./storage.js";

const AWS_REGION_REGEXP = /^[a-z]{2}-[a-z]+-\d$/;

interface ErrorResponse {
  __type: string;
  message: string;
}

// Type alias for better readability below
export type Session = string;

type ChallengeName =
  | "CUSTOM_CHALLENGE"
  | "PASSWORD_VERIFIER"
  | "SMS_MFA"
  | "NEW_PASSWORD_REQUIRED";

interface ChallengeResponse {
  ChallengeName: ChallengeName;
  ChallengeParameters: Record<string, string>;
  Session: Session;
}

interface AuthenticatedResponse {
  AuthenticationResult: {
    AccessToken: string;
    IdToken: string;
    RefreshToken: string;
    ExpiresIn: number;
    TokenType: string;
  };
  ChallengeParameters: Record<string, string>;
}

interface RefreshResponse {
  AuthenticationResult: {
    AccessToken: string;
    IdToken: string;
    ExpiresIn: number;
    TokenType: string;
  };
  ChallengeParameters: Record<string, string>;
}

interface GetIdResponse {
  IdentityId: string;
}

interface GetCredentialsForIdentityResponse {
  Credentials: {
    AccessKeyId: string;
    Expiration: number;
    SecretKey: string;
    SessionToken: string;
  };
  IdentityId: string;
}

interface GetUserResponse {
  MFAOptions: {
    AttributeName: string;
    DeliveryMedium: string;
  }[];
  PreferredMfaSetting: string;
  UserAttributes: {
    Name: string;
    Value: string;
  }[];
  UserMFASettingList: string[];
  Username: string;
}

export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    !!obj && typeof obj === "object" && "__type" in obj && "message" in obj
  );
}

export function assertIsNotErrorResponse<T>(
  obj: T | ErrorResponse
): asserts obj is T {
  if (isErrorResponse(obj)) {
    const err = new Error();
    err.name = obj.__type;
    err.message = obj.message;
    throw err;
  }
}

export function assertIsNotChallengeResponse<T>(
  obj: T | ChallengeResponse
): asserts obj is T {
  if (isChallengeResponse(obj)) {
    throw new Error(`Unexpected challenge: ${obj.ChallengeName}`);
  }
}

export function assertIsNotAuthenticatedResponse<T>(
  obj: T | AuthenticatedResponse
): asserts obj is T {
  if (isAuthenticatedResponse(obj)) {
    throw new Error("Unexpected authentication response");
  }
}

export function isChallengeResponse(obj: unknown): obj is ChallengeResponse {
  return (
    !!obj &&
    typeof obj === "object" &&
    "ChallengeName" in obj &&
    "ChallengeParameters" in obj
  );
}

export function assertIsChallengeResponse(
  obj: unknown
): asserts obj is ChallengeResponse {
  assertIsNotErrorResponse(obj);
  assertIsNotAuthenticatedResponse(obj);
  if (!isChallengeResponse(obj)) {
    throw new Error("Expected challenge response");
  }
}

export function isAuthenticatedResponse(
  obj: unknown
): obj is AuthenticatedResponse {
  return !!obj && typeof obj === "object" && "AuthenticationResult" in obj;
}

export function assertIsAuthenticatedResponse(
  obj: unknown
): asserts obj is AuthenticatedResponse {
  assertIsNotErrorResponse(obj);
  assertIsNotChallengeResponse(obj);
  if (!isAuthenticatedResponse(obj)) {
    throw new Error("Expected authentication response");
  }
}

export function assertIsSignInResponse(
  obj: unknown
): asserts obj is AuthenticatedResponse | ChallengeResponse {
  assertIsNotErrorResponse(obj);
  if (!isAuthenticatedResponse(obj) && !isChallengeResponse(obj)) {
    throw new Error("Expected sign-in response");
  }
}

export async function initiateAuth<
  T extends
    | "CUSTOM_AUTH"
    | "REFRESH_TOKEN_AUTH"
    | "USER_SRP_AUTH"
    | "USER_PASSWORD_AUTH",
>({
  authflow,
  authParameters,
  clientMetadata,
  abort,
}: {
  authflow: T;
  authParameters: Record<string, string>;
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders, clientId, clientSecret } =
    configure();
  return fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      signal: abort,
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AuthFlow: authflow,
        ClientId: clientId,
        AuthParameters: {
          ...authParameters,
          ...(clientSecret && {
            SECRET_HASH: await calculateSecretHash(authParameters.USERNAME),
          }),
        },
        ClientMetadata: clientMetadata,
      }),
    }
  ).then(extractInitiateAuthResponse(authflow));
}

export async function respondToAuthChallenge({
  challengeName,
  challengeResponses,
  session,
  clientMetadata,
  abort,
}: {
  challengeName: ChallengeName;
  challengeResponses: Record<string, string>;
  session?: Session;
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders, clientId, clientSecret } =
    configure();
  return fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target":
          "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        ChallengeName: challengeName,
        ChallengeResponses: {
          ...challengeResponses,
          ...(clientSecret && {
            SECRET_HASH: await calculateSecretHash(challengeResponses.USERNAME),
          }),
        },
        ClientId: clientId,
        Session: session,
        ClientMetadata: clientMetadata,
      }),
      signal: abort,
    }
  ).then(extractChallengeResponse);
}

/**
 * Confirms the sign-up of a user in Amazon Cognito.
 *
 * @param params - The parameters for confirming the sign-up.
 * @param params.username - The username or alias (e-mail, phone number) of the user.
 * @param params.confirmationCode - The confirmation code received by the user.
 * @param [params.clientMetadata] - Additional metadata to be passed to the server.
 * @param [params.abort] - An optional AbortSignal object that can be used to abort the request.
 * @returns A promise that resolves to the response of the confirmation request.
 */
export async function confirmSignUp({
  username,
  confirmationCode,
  clientMetadata,
  abort,
}: {
  username: string;
  confirmationCode: string;
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders, clientId, clientSecret } =
    configure();
  return fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.ConfirmSignUp",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        Username: username,
        ConfirmationCode: confirmationCode,
        ClientId: clientId,
        ClientMetadata: clientMetadata,
        ...(clientSecret && {
          SecretHash: await calculateSecretHash(username),
        }),
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function revokeToken({
  refreshToken,
  abort,
}: {
  refreshToken: string;
  abort?: AbortSignal;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders, clientId } = configure();
  return fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.RevokeToken",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        Token: refreshToken,
        ClientId: clientId,
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function getId({
  identityPoolId,
  abort,
}: {
  identityPoolId: string;
  abort?: AbortSignal;
}) {
  const { fetch } = configure();
  const identityPoolRegion = identityPoolId.split(":")[0];
  const { idToken } = (await retrieveTokens()) ?? {};
  if (!idToken) {
    throw new Error("Missing ID token");
  }
  const iss = new URL(parseJwtPayload(idToken)["iss"]);
  return fetch(
    `https://cognito-identity.${identityPoolRegion}.amazonaws.com/`,
    {
      signal: abort,
      headers: {
        "x-amz-target": "AWSCognitoIdentityService.GetId",
        "content-type": "application/x-amz-json-1.1",
      },
      method: "POST",
      body: JSON.stringify({
        IdentityPoolId: identityPoolId,
        Logins: {
          [`${iss.hostname}${iss.pathname}`]: idToken,
        },
      }),
    }
  )
    .then(throwIfNot2xx)
    .then((res) => res.json() as Promise<GetIdResponse | ErrorResponse>);
}

/**
 * Retrieves the user attributes from the Cognito Identity Provider.
 *
 * @param abort - An optional `AbortSignal` object that can be used to abort the request.
 * @returns A promise that resolves to an array of user attributes, where each attribute is represented by an object with `Name` and `Value` properties.
 */
export async function getUser({
  abort,
  accessToken,
}: {
  abort?: AbortSignal;
  accessToken?: string;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders } = configure();
  const token = accessToken ?? (await retrieveTokens())?.accessToken;
  return await fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.GetUser",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AccessToken: token,
      }),
      signal: abort,
    }
  )
    .then(throwIfNot2xx)
    .then((res) => res.json() as Promise<GetUserResponse | ErrorResponse>);
}

export async function getCredentialsForIdentity({
  identityId,
  abort,
}: {
  identityId: string;
  abort?: AbortSignal;
}) {
  const { fetch } = configure();
  const identityPoolRegion = identityId.split(":")[0];
  const { idToken } = (await retrieveTokens()) ?? {};
  if (!idToken) {
    throw new Error("Missing ID token");
  }
  const iss = new URL(parseJwtPayload(idToken)["iss"]);
  return fetch(
    `https://cognito-identity.${identityPoolRegion}.amazonaws.com/`,
    {
      signal: abort,
      headers: {
        "x-amz-target": "AWSCognitoIdentityService.GetCredentialsForIdentity",
        "content-type": "application/x-amz-json-1.1",
      },
      method: "POST",
      body: JSON.stringify({
        IdentityId: identityId,
        Logins: {
          [`${iss.hostname}${iss.pathname}`]: idToken,
        },
      }),
    }
  )
    .then(throwIfNot2xx)
    .then(
      (res) =>
        res.json() as Promise<GetCredentialsForIdentityResponse | ErrorResponse>
    );
}

export async function signUp({
  username,
  password,
  userAttributes,
  clientMetadata,
  validationData,
  abort,
}: {
  /**
   * Username, or alias (e-mail, phone number)
   */
  username: string;
  password: string;
  userAttributes?: { name: string; value: string }[];
  clientMetadata?: Record<string, string>;
  validationData?: { name: string; value: string }[];
  abort?: AbortSignal;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders, clientId, clientSecret } =
    configure();
  return fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.SignUp",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        Username: username,
        Password: password,
        UserAttributes:
          userAttributes &&
          userAttributes.map(({ name, value }) => ({
            Name: name,
            Value: value,
          })),
        ValidationData:
          validationData &&
          validationData.map(({ name, value }) => ({
            Name: name,
            Value: value,
          })),
        ClientMetadata: clientMetadata,
        ClientId: clientId,
        ...(clientSecret && {
          SecretHash: await calculateSecretHash(username),
        }),
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function updateUserAttributes({
  clientMetadata,
  userAttributes,
  abort,
  accessToken,
}: {
  userAttributes: { name: string; value: string }[];
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
  accessToken?: string;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders } = configure();
  const token = accessToken ?? (await retrieveTokens())?.accessToken;
  await fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target":
          "AWSCognitoIdentityProviderService.UpdateUserAttributes",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AccessToken: token,
        ClientMetadata: clientMetadata,
        UserAttributes: userAttributes.map(({ name, value }) => ({
          Name: name,
          Value: value,
        })),
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function getUserAttributeVerificationCode({
  attributeName,
  clientMetadata,
  abort,
  accessToken,
}: {
  attributeName: string;
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
  accessToken?: string;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders } = configure();
  const token = accessToken ?? (await retrieveTokens())?.accessToken;
  await fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target":
          "AWSCognitoIdentityProviderService.GetUserAttributeVerificationCode",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AccessToken: token,
        ClientMetadata: clientMetadata,
        AttributeName: attributeName,
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function verifyUserAttribute({
  attributeName,
  code,
  abort,
  accessToken,
}: {
  attributeName: string;
  code: string;
  abort?: AbortSignal;
  accessToken?: string;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders } = configure();
  const token = accessToken ?? (await retrieveTokens())?.accessToken;
  await fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.VerifyUserAttribute",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AccessToken: token,
        AttributeName: attributeName,
        Code: code,
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function setUserMFAPreference({
  smsMfaSettings,
  softwareTokenMfaSettings,
  abort,
  accessToken,
}: {
  smsMfaSettings?: { enabled?: boolean; preferred?: boolean };
  softwareTokenMfaSettings?: { enabled?: boolean; preferred?: boolean };
  abort?: AbortSignal;
  accessToken?: string;
}) {
  const { fetch, cognitoIdpEndpoint, proxyApiHeaders } = configure();
  const token = accessToken ?? (await retrieveTokens())?.accessToken;
  await fetch(
    cognitoIdpEndpoint.match(AWS_REGION_REGEXP)
      ? `https://cognito-idp.${cognitoIdpEndpoint}.amazonaws.com/`
      : cognitoIdpEndpoint,
    {
      headers: {
        "x-amz-target":
          "AWSCognitoIdentityProviderService.SetUserMFAPreference",
        "content-type": "application/x-amz-json-1.1",
        ...proxyApiHeaders,
      },
      method: "POST",
      body: JSON.stringify({
        AccessToken: token,
        SMSMfaSettings: smsMfaSettings && {
          Enabled: smsMfaSettings.enabled,
          PreferredMfa: smsMfaSettings.preferred,
        },
        SoftwareTokenMfaSettings: softwareTokenMfaSettings && {
          Enabled: softwareTokenMfaSettings.enabled,
          PreferredMfa: softwareTokenMfaSettings.preferred,
        },
      }),
      signal: abort,
    }
  ).then(throwIfNot2xx);
}

export async function handleAuthResponse({
  authResponse,
  username,
  smsMfaCode,
  newPassword,
  customChallengeAnswer,
  clientMetadata,
  abort,
}: {
  authResponse: ChallengeResponse | AuthenticatedResponse;
  /**
   * Username (not alias)
   */
  username: string;
  smsMfaCode?: () => Promise<string>;
  newPassword?: () => Promise<string>;
  customChallengeAnswer?: () => Promise<string>;
  clientMetadata?: Record<string, string>;
  abort?: AbortSignal;
}) {
  const { debug } = configure();
  for (;;) {
    if (isAuthenticatedResponse(authResponse)) {
      return {
        idToken: authResponse.AuthenticationResult.IdToken,
        accessToken: authResponse.AuthenticationResult.AccessToken,
        expireAt: new Date(
          Date.now() + authResponse.AuthenticationResult.ExpiresIn * 1000
        ),
        refreshToken: authResponse.AuthenticationResult.RefreshToken,
        username,
      };
    }
    const responseParameters: Record<string, string> = {};
    if (authResponse.ChallengeName === "SMS_MFA") {
      if (!smsMfaCode) throw new Error("Missing MFA Code");
      responseParameters.SMS_MFA_CODE = await smsMfaCode();
    } else if (authResponse.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      if (!newPassword) throw new Error("Missing new password");
      responseParameters.NEW_PASSWORD = await newPassword();
    } else if (authResponse.ChallengeName === "CUSTOM_CHALLENGE") {
      if (!customChallengeAnswer)
        throw new Error("Missing custom challenge answer");
      responseParameters.ANSWER = await customChallengeAnswer();
    } else {
      throw new Error(`Unsupported challenge: ${authResponse.ChallengeName}`);
    }
    debug?.(`Invoking respondToAuthChallenge ...`);
    const nextAuthResult = await respondToAuthChallenge({
      challengeName: authResponse.ChallengeName,
      challengeResponses: {
        USERNAME: username,
        ...responseParameters,
      },
      clientMetadata,
      session: authResponse.Session,
      abort,
    });
    debug?.(`Response from respondToAuthChallenge:`, nextAuthResult);
    authResponse = nextAuthResult;
  }
}

function extractInitiateAuthResponse<
  T extends
    | "CUSTOM_AUTH"
    | "REFRESH_TOKEN_AUTH"
    | "USER_SRP_AUTH"
    | "USER_PASSWORD_AUTH",
>(authflow: T) {
  return async (res: MinimalResponse) => {
    await throwIfNot2xx(res);
    const body = await res.json();
    if (authflow === "REFRESH_TOKEN_AUTH") {
      assertIsAuthenticatedResponse(body);
    } else {
      assertIsSignInResponse(body);
    }
    return body as T extends "REFRESH_TOKEN_AUTH"
      ? RefreshResponse
      : AuthenticatedResponse | ChallengeResponse;
  };
}

async function extractChallengeResponse(res: MinimalResponse) {
  await throwIfNot2xx(res);
  const body = await res.json();
  assertIsSignInResponse(body);
  return body;
}

async function calculateSecretHash(username?: string) {
  const { crypto, clientId, clientSecret } = configure();
  username ??= (await retrieveTokens())?.username;
  if (!username) {
    throw new Error("Failed to determine username for calculating secret hash");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${username}${clientId}`)
  );
  return bufferToBase64(signature);
}
