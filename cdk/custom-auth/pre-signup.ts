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

import { PreSignUpTriggerHandler } from "aws-lambda";
import { logger } from "./common.js";

export const handler: PreSignUpTriggerHandler = async (event) => {
  logger.info("Pre-signup: auto confirming user ...");
  logger.debug(JSON.stringify(event, null, 2));
  event.response.autoConfirmUser = true;
  logger.debug(JSON.stringify(event, null, 2));
  return event;
};
