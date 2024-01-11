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
import { Handler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  MessageRejected,
} from "@aws-sdk/client-ses";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { logger, UserFacingError } from "./common.js";

let ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

let config = {
  /** The User Pool ID */
  userPoolId: process.env.USER_POOL_ID,
  /** The e-mail address that notifications will be sent from */
  sesFromAddress: process.env.SES_FROM_ADDRESS,
  /** The Amazon SES region, override e.g. to set a region where you are out of the SES sandbox */
  sesRegion: process.env.SES_REGION || process.env.AWS_REGION,
  /** Function that will send the actual notification e-mails. Override this to e.g. use another e-mail provider instead of Amazon SES */
  emailSender: sendEmail,
  /** Function to create the content of the notification e-mails, override to e.g. use a custom e-mail template */
  contentCreator: createEmailContent,
};

function requireConfig<K extends keyof typeof config>(
  k: K
): NonNullable<(typeof config)[K]> {
  // eslint-disable-next-line security/detect-object-injection
  const value = config[k];
  if (value === undefined) throw new Error(`Missing configuration for: ${k}`);
  return value;
}

export function configure(update?: Partial<typeof config>) {
  const oldSesRegion = config.sesRegion;
  config = { ...config, ...update };
  if (update && update.sesRegion !== oldSesRegion) {
    ses = new SESClient({ region: config.sesRegion });
  }
  return config;
}

export interface NotificationPayload {
  cognitoUsername: string;
  friendlyName: string;
  eventType: "FIDO2_CREDENTIAL_CREATED" | "FIDO2_CREDENTIAL_DELETED";
}

export const handler: Handler<NotificationPayload> = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));
  const emailAddress = await getUserEmail(event.cognitoUsername);
  if (!emailAddress) {
    logger.info(
      "Failed to determine e-mail address, therefore skipping sending of notification for event:",
      event.eventType
    );
    return;
  }
  const content = await config.contentCreator(event);
  await config.emailSender({
    content,
    emailAddress,
  });
  logger.info("Sent notification for event:", event.eventType);
};

async function createEmailContent({
  friendlyName,
  eventType,
}: {
  friendlyName: string;
  eventType: "FIDO2_CREDENTIAL_CREATED" | "FIDO2_CREDENTIAL_DELETED";
}) {
  return {
    html: {
      data:
        eventType === "FIDO2_CREDENTIAL_CREATED"
          ? `<html><body><p>This passkey has been added to your account: ${friendlyName}</p></body></html>`
          : `<html><body><p>This passkey has been removed from your account: ${friendlyName}</p></body></html>`,
      charSet: "UTF-8",
    },
    text: {
      data:
        eventType === "FIDO2_CREDENTIAL_CREATED"
          ? `This passkey has been added to your account: ${friendlyName}`
          : `This passkey has been removed from your account: ${friendlyName}`,
      charSet: "UTF-8",
    },
    subject: {
      data:
        eventType === "FIDO2_CREDENTIAL_CREATED"
          ? "A passkey has been added to your account"
          : "A passkey has been removed from your account",
      charSet: "UTF-8",
    },
  };
}

async function sendEmail({
  emailAddress,
  content,
}: {
  emailAddress: string;
  content: {
    html: { charSet: string; data: string };
    text: { charSet: string; data: string };
    subject: { charSet: string; data: string };
  };
}) {
  await ses
    .send(
      new SendEmailCommand({
        Destination: { ToAddresses: [emailAddress] },
        Message: {
          Body: {
            Html: {
              Charset: content.html.charSet,
              Data: content.html.data,
            },
            Text: {
              Charset: content.text.charSet,
              Data: content.text.data,
            },
          },
          Subject: {
            Charset: content.subject.charSet,
            Data: content.subject.data,
          },
        },
        Source: requireConfig("sesFromAddress"),
      })
    )
    .catch((err) => {
      if (
        err instanceof MessageRejected &&
        err.message.includes("Email address is not verified")
      ) {
        logger.error(err);
        throw new UserFacingError(
          "E-mail address must still be verified in the e-mail service"
        );
      }
      throw err;
    });
}

async function getUserEmail(username: string) {
  const { UserAttributes } = await cognito.send(
    new AdminGetUserCommand({
      UserPoolId: requireConfig("userPoolId"),
      Username: username,
    })
  );
  if (!UserAttributes) {
    logger.debug(`User ${username} doesn't exist`);
    return;
  }
  const email = UserAttributes?.find((a) => a.Name === "email")?.Value;
  if (!email) {
    logger.debug(`User ${username} doesn't have an e-mail address`);
    return;
  }
  const emailVerified = UserAttributes?.find(
    (a) => a.Name === "email_verified"
  )?.Value;
  if (!emailVerified) {
    logger.debug(
      `User with ${username} doesn't have a verified e-mail address`
    );
    return;
  }
  return email;
}
