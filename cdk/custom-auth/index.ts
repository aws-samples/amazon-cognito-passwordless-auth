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
export * as fido2 from "./fido2.js";
export * as magicLink from "./magic-link.js";
export * as smsOtpStepUp from "./sms-otp-stepup.js";
export { handler as createAuthChallengeHandler } from "./create-auth-challenge.js";
export { handler as defineAuthChallengeHandler } from "./define-auth-challenge.js";
export { handler as verifyAuthChallengeResponseHandler } from "./verify-auth-challenge-response.js";
export { handler as preTokenHandler } from "./pre-token.js";
export { handler as preSignUpHandler } from "./pre-signup.js";
export * as fido2credentialsApi from "./fido2-credentials-api.js";
export {
  logger,
  Logger,
  LogLevel,
  UserFacingError,
  determineUserHandle,
} from "./common.js";
