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
import { IdleState, BusyState, TokensFromSignIn } from "./model.js";
import { initiateAuth, handleAuthResponse } from "./cognito-api.js";
import { defaultTokensCb } from "./common.js";

export function authenticateWithPlaintextPassword({
  username,
  password,
  smsMfaCode,
  newPassword,
  tokensCb,
  statusCb,
  clientMetadata,
}: {
  /**
   * Username, or alias (e-mail, phone number)
   */
  username: string;
  password: string;
  smsMfaCode?: () => Promise<string>;
  newPassword?: () => Promise<string>;
  tokensCb?: (tokens: TokensFromSignIn) => void | Promise<void>;
  statusCb?: (status: BusyState | IdleState) => void;
  currentStatus?: BusyState | IdleState;
  clientMetadata?: Record<string, string>;
}) {
  const { userPoolId, debug } = configure();
  if (!userPoolId) {
    throw new Error("UserPoolId must be configured");
  }
  const abort = new AbortController();
  const signedIn = (async () => {
    try {
      statusCb?.("SIGNING_IN_WITH_PASSWORD");
      debug?.(`Invoking initiateAuth ...`);
      const authResponse = await initiateAuth({
        authflow: "USER_PASSWORD_AUTH",
        authParameters: { USERNAME: username, PASSWORD: password },
        clientMetadata,
      });
      debug?.(`Response from initiateAuth:`, authResponse);
      const tokens = await handleAuthResponse({
        authResponse,
        username,
        smsMfaCode,
        newPassword,
        clientMetadata,
        abort: abort.signal,
      });
      tokensCb
        ? await tokensCb(tokens)
        : await defaultTokensCb({ tokens, abort: abort.signal });
      statusCb?.("SIGNED_IN_WITH_PASSWORD");
    } catch (err) {
      statusCb?.("PASSWORD_SIGNIN_FAILED");
      throw err;
    }
  })();
  return {
    signedIn: signedIn,
    abort: () => abort.abort(),
  };
}
