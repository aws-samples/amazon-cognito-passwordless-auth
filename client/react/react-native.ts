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
import { Passkey } from "react-native-passkey";
import {
  fido2StartCreateCredential,
  fido2CompleteCreateCredential,
  fido2ListCredentials,
  fido2UpdateCredential,
  fido2DeleteCredential,
  authenticateWithFido2,
} from "../fido2.js";
import { configure as _configure, Config } from "../config.js";

import { retrieveTokens } from "../storage.js";
export {
  fido2ListCredentials,
  fido2UpdateCredential,
  fido2DeleteCredential,
  retrieveTokens,
};

// The following dependencies should not be imported here and directly use
// amazon-cognito-passwordless-auth/cognito-api but React Native's Metro compiler
// does not support "exports" in package.json just yet
// Ref: https://github.com/facebook/metro/issues/670
export {
  initiateAuth,
  signUp,
  respondToAuthChallenge,
  updateUserAttributes,
  verifyUserAttribute,
  getUserAttributeVerificationCode,
} from "../cognito-api.js";
export { authenticateWithPlaintextPassword } from "../plaintext.js";
import { parseJwtPayload } from "../util.js";
import {
  usePasswordless as _usePasswordless,
  PasswordlessContextProvider,
} from "./hooks.js";

export { PasswordlessContextProvider };

export function usePasswordless() {
  return {
    ..._usePasswordless(),
    authenticateWithFido2: loginWithFido2,
    fido2CreateCredential,
  };
}

interface PasskeyConfig {
  fido2?: {
    passkeyDomain: string;
    passkeyAppName: string;
  };
}

function configure(config?: Config & PasskeyConfig) {
  return _configure(config) as ReturnType<typeof _configure> & PasskeyConfig;
}

export const Passwordless = { configure };

export const toBase64String = (base64Url: string) =>
  base64Url.replace(/-/g, "+").replace(/_/g, "/") + "==";

export async function fido2CreateCredential({
  username,
  friendlyName,
}: {
  /**
   * Display name for the user
   */
  username: string;
  friendlyName: string;
}) {
  const config = configure();
  const response = await fido2StartCreateCredential();
  if (!config.fido2) throw new Error("FIDO2 not configured");
  const passkey = new Passkey(config.fido2?.passkeyDomain, username);
  const credential = await passkey.register(
    toBase64String(response.challenge),
    response.user.id
  );

  return await fido2CompleteCreateCredential({
    credential: {
      clientDataJSON_B64: credential.response.rawClientDataJSON,
      attestationObjectB64: credential.response.rawAttestationObject,
    },
    friendlyName,
  });
}

export async function fido2GetCredential({
  challenge,
  username,
}: {
  challenge: string;
  /**
   * Display name for the user
   */
  username: string;
}) {
  const config = configure();
  if (!config.fido2) throw new Error("FIDO2 not configured");
  const passkey = new Passkey(config.fido2.passkeyDomain, username);
  const result = await passkey.auth(toBase64String(challenge));
  return {
    credentialIdB64: result.credentialID,
    authenticatorDataB64: result.response.rawAuthenticatorData,
    clientDataJSON_B64: result.response.rawClientDataJSON,
    signatureB64: result.response.signature,
    userHandleB64: null,
  };
}

export async function loginWithFido2({
  username,
}: {
  /**
   * Username, or alias (e-mail, phone number)
   */
  username: string;
}) {
  const response = authenticateWithFido2({
    username,
    credentialGetter: ({ challenge }: { challenge: string }) => {
      return fido2GetCredential({
        username,
        challenge: toBase64String(challenge),
      });
    },
  });
  await response.signedIn;
  return response;
}

export async function getAccountDetails() {
  const tokens = await retrieveTokens();
  if (!tokens?.idToken) {
    return {};
  }
  return parseJwtPayload(tokens.idToken);
}

export const timeAgo = (now: number, date: Date) => {
  const seconds = Math.floor((now - date.getTime()) / 1000);
  const years = Math.floor(seconds / 31536000);
  const months = Math.floor(seconds / 2592000);
  const days = Math.floor(seconds / 86400);

  if (days > 548) {
    return years.toString() + " years ago";
  }
  if (days >= 320 && days <= 547) {
    return "a year ago";
  }
  if (days >= 45 && days <= 319) {
    return months.toString() + " months ago";
  }
  if (days >= 26 && days <= 45) {
    return "a month ago";
  }

  const hours = Math.floor(seconds / 3600);

  if (hours >= 36 && days <= 25) {
    return days.toString() + " days ago";
  }
  if (hours >= 22 && hours <= 35) {
    return "a day ago";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes >= 90 && hours <= 21) {
    return hours.toString() + " hours ago";
  }
  if (minutes >= 45 && minutes <= 89) {
    return "an hour ago";
  }
  if (seconds >= 90 && minutes <= 44) {
    return minutes.toString() + " minutes ago";
  }
  if (seconds >= 45 && seconds <= 89) {
    return "a minute ago";
  }
  if (seconds >= 10 && seconds <= 45) {
    return seconds.toString() + " seconds ago";
  }
  if (seconds >= 0 && seconds <= 10) {
    return "Just now";
  }
};

class RNTextDecoder {
  static throwMalformedInputError = () => {
    throw new Error("Malformed input");
  };
  // React Native implementation in plain JS, this is slow and only works for UTF-8
  public decode(arrBuf: ArrayBuffer) {
    const bytes = [...new Uint8Array(arrBuf)];
    let i = 0;
    const codePoints = [] as number[];
    const readByte = () =>
      bytes[i++] ?? RNTextDecoder.throwMalformedInputError();
    const readContinuationByte = () =>
      bytes[i++] >> 6 === 0b10
        ? bytes[i - 1]
        : RNTextDecoder.throwMalformedInputError();
    while (i < bytes.length) {
      const byte = readByte();
      if (byte >> 7 === 0) {
        codePoints.push(byte);
      } else if (byte >> 5 === 0b110) {
        codePoints.push(((byte & 0x1f) << 6) | (readContinuationByte() & 0x3f));
      } else if (byte >> 4 === 0b1110) {
        codePoints.push(
          ((byte & 0x0f) << 12) |
            ((readContinuationByte() & 0x3f) << 6) |
            (readContinuationByte() & 0x3f)
        );
      } else if (byte >> 3 === 0b11110) {
        codePoints.push(
          ((byte & 0x07) << 18) |
            ((readContinuationByte() & 0x3f) << 12) |
            ((readContinuationByte() & 0x3f) << 6) |
            (readContinuationByte() & 0x3f)
        );
      } else {
        RNTextDecoder.throwMalformedInputError();
      }
    }
    return String.fromCodePoint(...codePoints);
  }
}

if (typeof global.TextDecoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment
  global.TextDecoder = RNTextDecoder as any;
}
