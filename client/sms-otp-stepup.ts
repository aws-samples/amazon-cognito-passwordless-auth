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
import { configure } from "./config.js";
import { IdleState, BusyState, TokensFromSignIn, busyState } from "./model.js";
import {
  assertIsChallengeResponse,
  assertIsAuthenticatedResponse,
  isChallengeResponse,
  initiateAuth,
  respondToAuthChallenge,
} from "./cognito-api.js";
import { defaultTokensCb } from "./common.js";
import { parseJwtPayload } from "./util.js";
import { CognitoIdTokenPayload } from "./jwt-model.js";
import { retrieveTokens } from "./storage.js";

export function stepUpAuthenticationWithSmsOtp({
  username,
  smsMfaCode,
  tokensCb,
  statusCb,
  currentStatus,
  clientMetadata,
  accessToken,
}: {
  /**
   * Username, or alias (e-mail, phone number)
   */
  username: string;
  smsMfaCode: (phoneNumber: string, attempt: number) => Promise<string>;
  tokensCb?: (tokens: TokensFromSignIn) => void | Promise<void>;
  statusCb?: (status: BusyState | IdleState) => void;
  currentStatus?: BusyState | IdleState;
  clientMetadata?: Record<string, string>;
  accessToken?: string;
}) {
  if (currentStatus && busyState.includes(currentStatus as BusyState)) {
    throw new Error(`Can't sign in while in status ${currentStatus}`);
  }
  const abort = new AbortController();
  const signedIn = (async () => {
    const { debug } = configure();
    statusCb?.("SIGNING_IN_WITH_OTP");
    try {
      const token = accessToken ?? (await retrieveTokens())?.accessToken;
      if (!token) {
        throw new Error(
          "Missing access token. You must be signed-in already for step-up auth"
        );
      }
      let session: string;
      debug?.(`Invoking initiateAuth ...`);
      const initAuthResponse = await initiateAuth({
        authflow: "CUSTOM_AUTH",
        authParameters: {
          USERNAME: username,
        },
        abort: abort.signal,
      });
      debug?.(`Response from initiateAuth:`, initAuthResponse);
      assertIsChallengeResponse(initAuthResponse);
      session = initAuthResponse.Session;
      let phoneNumberWithOtp: string;
      let authResult: Awaited<ReturnType<typeof respondToAuthChallenge>>;
      if (
        initAuthResponse.ChallengeParameters.challenge ===
        "PROVIDE_AUTH_PARAMETERS"
      ) {
        debug?.(`Invoking respondToAuthChallenge ...`);
        authResult = await respondToAuthChallenge({
          challengeName: "CUSTOM_CHALLENGE",
          challengeResponses: {
            ANSWER: "__dummy__",
            USERNAME: username,
          },
          clientMetadata: {
            ...clientMetadata,
            signInMethod: "SMS_OTP_STEPUP",
          },
          session: session,
          abort: abort.signal,
        });
        assertIsChallengeResponse(authResult);
        debug?.(`Response from respondToAuthChallenge:`, authResult);
        session = authResult.Session;
        phoneNumberWithOtp = authResult.ChallengeParameters.phoneNumber;
      } else {
        phoneNumberWithOtp = initAuthResponse.ChallengeParameters.phoneNumber;
      }
      let attempt = 1;
      for (;;) {
        const secretCode = await smsMfaCode(phoneNumberWithOtp, attempt);
        debug?.(`Invoking respondToAuthChallenge ...`);
        authResult = await respondToAuthChallenge({
          challengeName: "CUSTOM_CHALLENGE",
          challengeResponses: {
            ANSWER: JSON.stringify({
              jwt: token,
              secretCode,
            }),
            USERNAME: username,
          },
          clientMetadata: {
            ...clientMetadata,
            signInMethod: "SMS_OTP_STEPUP",
          },
          session: session,
          abort: abort.signal,
        });
        debug?.(`Response from respondToAuthChallenge:`, authResult);
        if (!isChallengeResponse(authResult)) {
          break;
        }
        session = authResult.Session;
        attempt++;
      }
      assertIsAuthenticatedResponse(authResult);
      debug?.(`Response from respondToAuthChallenge:`, authResult);
      const tokens = {
        accessToken: authResult.AuthenticationResult.AccessToken,
        idToken: authResult.AuthenticationResult.IdToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken,
        expireAt: new Date(
          Date.now() + authResult.AuthenticationResult.ExpiresIn * 1000
        ),
        username: parseJwtPayload<CognitoIdTokenPayload>(
          authResult.AuthenticationResult.IdToken
        )["cognito:username"],
      };
      tokensCb
        ? await tokensCb(tokens)
        : await defaultTokensCb({ tokens, abort: abort.signal });
      statusCb?.("SIGNED_IN_WITH_OTP");
      return tokens;
    } catch (err) {
      statusCb?.("SIGNIN_WITH_OTP_FAILED");
      throw err;
    }
  })();
  return {
    signedIn,
    abort: () => abort.abort(),
  };
}
