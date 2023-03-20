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
type Json = null | string | number | boolean | Json[] | JsonObject;

/** JSON Object type */
type JsonObject = { [name: string]: Json };

interface CognitoJwtFields {
  token_use: "access" | "id";
  "cognito:groups"?: string[];
  sub: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  origin_jti: string;
}

interface CognitoIdTokenFields extends CognitoJwtFields {
  token_use: "id";
  aud: string;
  at_hash: string;
  "cognito:username": string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  identities?: {
    userId: string;
    providerName: string;
    providerType: string;
    issuer: null;
    primary: string;
    dateCreated: string;
  }[];
  "cognito:roles"?: string[];
  "cognito:preferred_role"?: string;
}

export type CognitoIdTokenPayload = CognitoIdTokenFields & JsonObject;

interface CognitoAccessTokenFields extends CognitoJwtFields {
  token_use: "access";
  client_id: string;
  version: number;
  username: string;
  scope: string;
}

export type CognitoAccessTokenPayload = CognitoAccessTokenFields & JsonObject;
