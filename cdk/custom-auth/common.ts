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

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
export class UserFacingError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UserFacingError";
  }
}

export function handleConditionalCheckFailedException(msg: string) {
  return (err: unknown) => {
    if (err instanceof ConditionalCheckFailedException) {
      throw new UserFacingError(msg);
    }
    throw err;
  };
}

export enum LogLevel {
  "none" = 0,
  "error" = 10,
  "info" = 20,
  "debug" = 30,
}

export class Logger {
  constructor(private logLevel: LogLevel) {}

  public error(...args: unknown[]) {
    if (this.logLevel >= LogLevel.error) {
      console.error(...args);
    }
  }
  public info(...args: unknown[]) {
    if (this.logLevel >= LogLevel.info) {
      console.log(...args);
    }
  }
  public debug(...args: unknown[]) {
    if (this.logLevel >= LogLevel.debug) {
      console.trace(...args);
    }
  }
}

export const logLevel =
  {
    ERROR: LogLevel.error,
    INFO: LogLevel.info,
    DEBUG: LogLevel.debug,
  }[process.env.LOG_LEVEL ?? "NONE"] ?? LogLevel.none;
// eslint-disable-next-line prefer-const
export let logger = new Logger(logLevel);

/**
 * Returns the cognitoUsername if it is opaque, i.e. if it looks like a UUID, or otherwise the sub
 */
export function determineUserHandle({
  sub,
  cognitoUsername,
}: {
  sub: string;
  cognitoUsername: string;
}) {
  if (isOpaqueIdentifier(cognitoUsername)) {
    return cognitoUsername;
  }
  return sub;
}

function isOpaqueIdentifier(cognitoUsername: string) {
  return isUuid(cognitoUsername);
}

function isUuid(cognitoUsername: string) {
  return !!cognitoUsername.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  );
}
