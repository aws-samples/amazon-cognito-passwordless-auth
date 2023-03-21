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

import { VerifyAuthChallengeResponseTriggerHandler } from "aws-lambda";
import * as fido2 from "./fido2.js";
import * as smsOtpStepUp from "./sms-otp-stepup.js";
import * as magicLink from "./magic-link.js";
import { logger, UserFacingError } from "./common.js";

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (
  event
) => {
  logger.debug(JSON.stringify(event, null, 2));
  try {
    event.response.answerCorrect = false;

    // Enforce FIDO2?
    if (event.request.clientMetadata?.signInMethod !== "FIDO2") {
      await fido2.assertFido2SignInOptional(event);
    }

    // Verify challenge answer
    if (event.request.clientMetadata?.signInMethod === "MAGIC_LINK") {
      await magicLink.addChallengeVerificationResultToEvent(event);
    } else if (event.request.clientMetadata?.signInMethod === "FIDO2") {
      await fido2.addChallengeVerificationResultToEvent(event);
    } else if (
      event.request.clientMetadata?.signInMethod === "SMS_OTP_STEPUP"
    ) {
      await smsOtpStepUp.addChallengeVerificationResultToEvent(event);
    }

    // Return event
    logger.debug(JSON.stringify(event, null, 2));
    logger.info(
      "Verification result, answerCorrect:",
      event.response.answerCorrect
    );
    return event;
  } catch (err) {
    logger.error(err);
    if (err instanceof UserFacingError) throw err;
    throw new Error("Internal Server Error");
  }
};
