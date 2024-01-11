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
  DefineAuthChallengeTriggerHandler,
  DefineAuthChallengeTriggerEvent,
} from "aws-lambda";
import { logger } from "./common.js";

export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));

  if (!event.request.session.length) {
    // The auth flow just started, send a custom challenge
    logger.info("No session yet, starting one ...");
    return customChallenge(event);
  }

  // We only accept custom challenges
  if (
    event.request.session.find(
      (attempt) => attempt.challengeName !== "CUSTOM_CHALLENGE"
    )
  ) {
    return deny(event, "Expected CUSTOM_CHALLENGE");
  }

  const { signInMethod } = event.request.clientMetadata ?? {};
  logger.info(
    `Requested signInMethod: ${signInMethod} (attempt: ${countAttempts(event)})`
  );

  if (signInMethod === "MAGIC_LINK") {
    return handleMagicLinkResponse(event);
  } else if (signInMethod === "SMS_OTP_STEPUP") {
    return handleSmsOtpStepUpResponse(event);
  } else if (signInMethod === "FIDO2") {
    return handleFido2Response(event);
  }

  return deny(event, `Unrecognized signInMethod: ${signInMethod}`);
};

function handleMagicLinkResponse(event: DefineAuthChallengeTriggerEvent) {
  logger.info("Checking Magic Link Auth ...");
  const { alreadyHaveMagicLink } = event.request.clientMetadata ?? {};
  const lastResponse = event.request.session.slice(-1)[0];
  if (lastResponse.challengeResult === true) {
    return allow(event);
  } else if (alreadyHaveMagicLink !== "yes" && countAttempts(event) === 0) {
    logger.info("No magic link yet, creating one");
    return customChallenge(event);
  }
  return deny(event, "Failed to authenticate with Magic Link");
}

function handleSmsOtpStepUpResponse(event: DefineAuthChallengeTriggerEvent) {
  logger.info("Checking SMS OTP Step Auth ...");
  const lastResponse = event.request.session.slice(-1)[0];
  const attemps = countAttempts(event);
  if (lastResponse.challengeResult === true) {
    return allow(event);
  } else if (attemps < 3) {
    logger.info(`Not successfull yet. Attempt number ${attemps + 1} of max 3`);
    return customChallenge(event);
  }
  return deny(event, "Failed to authenticate with SMS OTP Step-Up");
}

function handleFido2Response(event: DefineAuthChallengeTriggerEvent) {
  logger.info("Checking Fido2 Auth ...");
  const lastResponse = event.request.session.slice(-1)[0];
  if (lastResponse.challengeResult === true) {
    return allow(event);
  }
  return deny(event, "Failed to authenticate with FIDO2");
}

function deny(event: DefineAuthChallengeTriggerEvent, reason: string) {
  logger.info("Failing authentication because:", reason);
  event.response.issueTokens = false;
  event.response.failAuthentication = true;
  logger.debug(JSON.stringify(event, null, 2));
  return event;
}

function allow(event: DefineAuthChallengeTriggerEvent) {
  logger.info("Authentication successfull");
  event.response.issueTokens = true;
  event.response.failAuthentication = false;
  logger.debug(JSON.stringify(event, null, 2));
  return event;
}

function customChallenge(event: DefineAuthChallengeTriggerEvent) {
  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = "CUSTOM_CHALLENGE";
  logger.info("Next step: CUSTOM_CHALLENGE");
  logger.debug(JSON.stringify(event, null, 2));
  return event;
}

function countAttempts(
  event: DefineAuthChallengeTriggerEvent,
  excludeProvideAuthParameters = true
) {
  if (!excludeProvideAuthParameters) return event.request.session.length;
  return event.request.session.filter(
    (entry) => entry.challengeMetadata !== "PROVIDE_AUTH_PARAMETERS"
  ).length;
}
