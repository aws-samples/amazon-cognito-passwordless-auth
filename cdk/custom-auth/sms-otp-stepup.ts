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
  CreateAuthChallengeTriggerEvent,
  VerifyAuthChallengeResponseTriggerEvent,
} from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { randomInt } from "crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { logger, UserFacingError } from "./common.js";

let config = {
  /** Should SMS OTP step-up sign-in be enabled? If set to false, clients cannot sign-in with SMS OTP step-up (an error is shown instead when they request a OTP sms) */
  smsOtpStepUpEnabled: !!process.env.SMS_OTP_STEP_UP_ENABLED,
  /** The length of the OTP */
  secretCodeLength: process.env.OTP_LENGTH ? Number(process.env.OTP_LENGTH) : 6,
  /** Amazon SNS origination number to use for sending SMS messages */
  originationNumber: process.env.ORIGINATION_NUMBER || undefined,
  /** Amazon SNS sender ID to use for sending SMS messages */
  senderId: process.env.SENDER_ID || undefined,
  /** The Amazon SNS region, override e.g. to set a region where you are out of the SES sandbox */
  snsRegion: process.env.SNS_REGION || process.env.AWS_REGION,
  /** Function to mask the phone nr that will be visible in the public challenge parameters */
  phoneNrMasker: maskPhoneNumber,
  /** Function to create the content of the OTP sms-es, override to e.g. use a custom sms template */
  contentCreator: createSmsContent,
  /** The function to verify JWTs with, override to e.g. verify custom claims */
  jwtVerifier: verifyJwt,
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
  config = { ...config, ...update };
  return config;
}

export async function addChallengeToEvent(
  event: CreateAuthChallengeTriggerEvent
) {
  if (!config.smsOtpStepUpEnabled)
    throw new UserFacingError(
      "Step-up authentication with SMS OTP not supported"
    );

  logger.info("Adding SMS OTP Step up challenge to event ...");
  const { phoneNumber, secretCode } = await createChallenge(event);

  // This is sent back to the client app
  event.response.publicChallengeParameters = {
    phoneNumber: config.phoneNrMasker(phoneNumber),
  };

  // Add the secret login code to the private challenge parameters
  // so it can be verified by the "Verify Auth Challenge Response" trigger
  event.response.privateChallengeParameters = { secretCode, phoneNumber };

  // Add the secret login code to the session so it is available
  // in a next invocation of the "Create Auth Challenge" trigger
  event.response.challengeMetadata = `SMS-OTP-STEPUP-CODE-${secretCode}`;
}

async function createChallenge(event: CreateAuthChallengeTriggerEvent) {
  logger.info("Creating SMS OTP step-up challenge ...");
  let phoneNumber = event.request.userAttributes.phone_number_verified
    ? event.request.userAttributes.phone_number
    : undefined;
  if (event.request.userNotFound) {
    logger.info("User not found");
    phoneNumber = `+${[...Buffer.from(event.userName)].join("").slice(0, 10)}`;
  }
  if (!phoneNumber) {
    throw new UserFacingError("User has no (verified) phone number");
  }

  // If we already sent a secret code in this auth flow instance, re-use it.
  // This allows the user to make a mistake when keying in the code and to then retry,
  // rather then needing to send the user an all new code again.
  const previousChallenge = event.request.session.slice(-1)[0];
  const previousSecretCode = previousChallenge.challengeMetadata?.match(
    /SMS-OTP-STEPUP-CODE-(\d+)/
  )?.[1];

  let secretCode: string;
  if (!previousSecretCode) {
    logger.info(
      "SMS Code has not been sent yet, generating and sending one ..."
    );
    secretCode = [...new Array<unknown>(requireConfig("secretCodeLength"))]
      .map(() => randomInt(0, 9))
      .join("");
    const attributes: PublishCommand["input"]["MessageAttributes"] = {};
    if (config.senderId) {
      attributes["AWS.SNS.SMS.SenderID"] = {
        DataType: "String",
        StringValue: config.senderId,
      };
    }
    if (config.originationNumber) {
      attributes["AWS.MM.SMS.OriginationNumber"] = {
        DataType: "String",
        StringValue: config.originationNumber,
      };
    }
    if (!event.request.userNotFound) {
      await new SNSClient({ region: config.snsRegion }).send(
        new PublishCommand({
          Message: await config.contentCreator.call(undefined, {
            secretCode,
            event,
          }),
          PhoneNumber: phoneNumber,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": {
              StringValue: "Transactional",
              DataType: "String",
            },
            ...attributes,
          },
        })
      );
    }
  } else {
    logger.info("Will re-use prior OTP code (user made a typo?)");
    secretCode = previousSecretCode;
  }
  return {
    phoneNumber,
    secretCode,
  };
}

async function createSmsContent({
  secretCode,
}: {
  secretCode: string;
  event: CreateAuthChallengeTriggerEvent;
}) {
  return `Your verification code is: ${secretCode}`;
}

export async function addChallengeVerificationResultToEvent(
  event: VerifyAuthChallengeResponseTriggerEvent
) {
  logger.info("Verifying SMS OTP StepUp Challenge Response ...");
  if (event.request.userNotFound) {
    logger.info("User not found");
  }
  if (!config.smsOtpStepUpEnabled)
    throw new UserFacingError(
      "Step-up authentication with SMS OTP not supported"
    );
  if (
    event.request.privateChallengeParameters.challenge ===
    "PROVIDE_AUTH_PARAMETERS"
  )
    return;
  let parsedAnswer: unknown;
  try {
    parsedAnswer = JSON.parse(event.request.challengeAnswer);
    assertIsAnswer(parsedAnswer);
  } catch (err) {
    logger.error("Invalid challengeAnswer:", err);
    event.response.answerCorrect = false;
    return;
  }
  const secretCodeValid =
    !!event.request.privateChallengeParameters.secretCode &&
    event.request.privateChallengeParameters.secretCode ===
      parsedAnswer.secretCode;
  const jwtValid = await config.jwtVerifier.call(undefined, {
    userPoolId: event.userPoolId,
    clientId: event.callerContext.clientId,
    sub: event.request.userAttributes.sub,
    jwt: parsedAnswer.jwt,
  });
  event.response.answerCorrect = secretCodeValid && jwtValid;
}

function assertIsAnswer(
  answer: unknown
): asserts answer is { secretCode: string; jwt: string } {
  if (
    !answer ||
    typeof answer !== "object" ||
    !("secretCode" in answer) ||
    typeof answer.secretCode !== "string" ||
    !("jwt" in answer) ||
    typeof answer.jwt !== "string"
  ) {
    throw new Error("Invalid answer");
  }
}

const jwksCache = new SimpleJwksCache();
async function verifyJwt({
  userPoolId,
  clientId,
  jwt,
  sub,
}: {
  userPoolId: string;
  clientId: string;
  jwt: string;
  sub: string;
}) {
  return CognitoJwtVerifier.create(
    {
      userPoolId,
      tokenUse: "access",
      clientId,
      customJwtCheck: ({ payload }) => {
        if (payload.sub !== sub) {
          throw new Error("Wrong sub");
        }
      },
    },
    { jwksCache }
  )
    .verify(jwt)
    .then(() => true)
    .catch((err) => {
      logger.error(err);
      return false;
    });
}

function maskPhoneNumber(phoneNumber: string) {
  const show = phoneNumber.length < 8 ? 2 : 4;
  return `+${new Array(11 - show).fill("*").join("")}${phoneNumber.slice(
    -show
  )}`;
}
