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
import {
  CreateAuthChallengeTriggerHandler,
  CreateAuthChallengeTriggerEvent,
} from "aws-lambda";
import * as fido2 from "./fido2.js";
import * as smsOtpStepUp from "./sms-otp-stepup.js";
import * as magicLink from "./magic-link.js";
import { logger, UserFacingError } from "./common.js";

export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));
  try {
    if (!event.request.session || !event.request.session.length) {
      // This is the first time Create Auth Challenge is called
      // Create a dummy challenge, allowing the user to send a challenge response
      // with client metadata, that can be used to to provide auth parameters:
      // - Redirect URL for magic link
      // - [OPTIONAL] Skip creation of new secret sign-in code (if client already has one)
      // - Sign-in method
      logger.info("Client has no session yet, starting one ...");
      await provideAuthParameters(event);
      // If enabled, fido2 challenge is attached to the event always, even if the client might want to use another signInMethod.
      // This is so that client can immediately respond with a FIDO2 signature
      await fido2.addChallengeToEvent(event);
    } else {
      const { signInMethod } = event.request.clientMetadata ?? {};
      logger.info(`Client has requested signInMethod: ${signInMethod}`);
      if (signInMethod === "MAGIC_LINK") {
        await magicLink.addChallengeToEvent(event);
      } else if (signInMethod === "SMS_OTP_STEPUP") {
        await smsOtpStepUp.addChallengeToEvent(event);
      } else {
        throw new Error(`Unrecognized signInMethod: ${signInMethod}`);
      }
    }
    logger.debug(JSON.stringify(event, null, 2));
    return event;
  } catch (err) {
    logger.error(err);
    if (err instanceof UserFacingError) throw err;
    throw new Error("Internal Server Error");
  }
};

async function provideAuthParameters(
  event: CreateAuthChallengeTriggerEvent
): Promise<void> {
  logger.info("Creating challenge: PROVIDE_AUTH_PARAMETERS");
  event.response.challengeMetadata = "PROVIDE_AUTH_PARAMETERS";
  const parameters: Record<string, string> = {
    challenge: "PROVIDE_AUTH_PARAMETERS",
  };
  event.response.privateChallengeParameters = parameters;
  event.response.publicChallengeParameters = parameters;
}
