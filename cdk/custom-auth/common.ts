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
import { APIGatewayProxyHandler } from "aws-lambda";

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
  sub?: string; // maybe undefined if userNotFound is true
  cognitoUsername: string;
}) {
  if (!sub || isOpaqueIdentifier(cognitoUsername)) {
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

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
const allowedMethods = process.env.CORS_ALLOWED_METHODS;
const allowedHeaders = process.env.CORS_ALLOWED_HEADERS;
const maxAge = process.env.CORS_MAX_AGE;
const corsHeaderAvailable = !!(
  allowedOrigins &&
  allowedMethods &&
  allowedHeaders &&
  maxAge
);
export function withCommonHeaders<T extends APIGatewayProxyHandler>(
  handler: T
) {
  const wrapped: APIGatewayProxyHandler = (event, context, cb) => {
    return handler(event, context, () =>
      cb(
        new Error("Callback style response from wrapped handler not supported")
      )
    )?.then((response) => {
      const origin =
        event.headers &&
        Object.entries(event.headers).find(
          ([k, v]) => k.toLowerCase() === "origin" && v
        )?.[1];
      const headers = {
        "Strict-Transport-Security":
          "max-age=31536000; includeSubdomains; preload",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      };
      if (
        origin &&
        corsHeaderAvailable &&
        allowedOrigins.split(",").includes(origin)
      ) {
        Object.assign(headers, {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": allowedMethods,
          "Access-Control-Allow-Headers": allowedHeaders,
          "Access-Control-Max-Age": maxAge,
        });
      }
      response.headers = { ...response.headers, ...headers };
      return response;
    });
  };
  return wrapped as T;
}
