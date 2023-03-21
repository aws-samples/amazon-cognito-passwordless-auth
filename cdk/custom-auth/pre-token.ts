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

import { PreTokenGenerationTriggerHandler } from "aws-lambda";
import { logger, UserFacingError } from "./common.js";

const CLIENT_METADATA_PERSISTED_KEYS =
  process.env.CLIENT_METADATA_PERSISTED_KEYS?.split(",").map((key) =>
    key.trim()
  ) ?? [];

export const handler: PreTokenGenerationTriggerHandler = async (event) => {
  logger.debug(JSON.stringify(event, null, 2));
  logger.info("PreToken Generation for trigger:", event.triggerSource);
  if (event.triggerSource === "TokenGeneration_Authentication") {
    const clientMetadataToPersist =
      event.request.clientMetadata &&
      Object.entries(event.request.clientMetadata).filter(([key]) =>
        CLIENT_METADATA_PERSISTED_KEYS.includes(key)
      );
    if (clientMetadataToPersist) {
      logger.info(
        "There is client metadata to persist:",
        clientMetadataToPersist.map(([key]) => key).join(", ")
      );
      event.response.claimsOverrideDetails = {
        claimsToAddOrOverride: {},
      };
      clientMetadataToPersist.forEach(([key, value]) => {
        const stringValue = value.toString();
        if (stringValue.length > 256) {
          throw new UserFacingError(`Value for "${key}" too long`);
        }
        event.response.claimsOverrideDetails.claimsToAddOrOverride![
          snakeCase(key)
        ] = stringValue;
      });
    }
  }
  logger.debug(JSON.stringify(event, null, 2));
  return event;
};

function snakeCase(s: string) {
  return s.replace(/[A-Z]{1}/g, (matched) => `_${matched.toLowerCase()}`);
}
