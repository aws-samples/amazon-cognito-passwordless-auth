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
import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { logger, withCommonHeaders } from "./common.js";
import { randomBytes } from "crypto";

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const signInTimeout = Number(process.env.SIGN_IN_TIMEOUT ?? "120000");
const headers = {
  "Strict-Transport-Security": "max-age=31536000; includeSubdomains; preload",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const _handler: APIGatewayProxyHandler = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));
  logger.info("FIDO2 challenge API invocation:", event.path);
  try {
    if (event.path === "/sign-in-challenge") {
      const challenge = randomBytes(64).toString("base64url");
      await ddbDocClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_AUTHENTICATORS_TABLE!,
          Item: {
            pk: `CHALLENGE#${challenge}`,
            sk: `USERNAMELESS_SIGN_IN`,
            exp: Math.floor((Date.now() + signInTimeout) / 1000),
          },
        })
      );
      return {
        statusCode: 200,
        headers,
        /** Remember, only return things we want unauthenticated users to see */
        body: JSON.stringify({
          challenge,
          timeout: signInTimeout,
          userVerification: process.env.USER_VERIFICATION,
        }),
      };
    }
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "Not found" }),
      headers,
    };
  } catch (err) {
    logger.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
      headers,
    };
  }
};

export const handler = withCommonHeaders(_handler);
