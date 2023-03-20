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
export interface TokensFromSignIn {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expireAt: Date;
  username: string;
}
export interface TokensFromRefresh {
  accessToken: string;
  idToken: string;
  expireAt: Date;
  username: string;
}

export const busyState = [
  "CHECKING_FOR_SIGNIN_LINK",
  "REQUESTING_SIGNIN_LINK",
  "SIGNING_IN_WITH_LINK",
  "STARTING_SIGN_IN_WITH_FIDO2",
  "COMPLETING_SIGN_IN_WITH_FIDO2",
  "SIGNING_IN_WITH_PASSWORD",
  "SIGNING_IN_WITH_OTP",
  "SIGNING_OUT",
] as const;
export type BusyState = (typeof busyState)[number];
const idleState = [
  "NO_SIGNIN_LINK",
  "SIGNIN_LINK_REQUEST_FAILED",
  "SIGNIN_LINK_REQUESTED",
  "SIGNIN_LINK_EXPIRED",
  "INVALID_SIGNIN_LINK",
  "SIGNED_OUT",
  "SIGNED_IN_WITH_LINK",
  "SIGNED_IN_WITH_FIDO2",
  "SIGNED_IN_WITH_PASSWORD",
  "SIGNED_IN_WITH_OTP",
  "FIDO2_SIGNIN_FAILED",
  "SIGNIN_WITH_OTP_FAILED",
  "PASSWORD_SIGNIN_FAILED",
] as const;
export type IdleState = (typeof idleState)[number];
