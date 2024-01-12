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
import { Buffer } from "buffer";
import { useEffect } from "react";
import { Passkey } from "react-native-passkey";
import * as Linking from "expo-linking";
import {
  fido2StartCreateCredential,
  fido2CompleteCreateCredential,
  fido2ListCredentials,
  fido2UpdateCredential,
  fido2DeleteCredential,
  fido2getCredential,
} from "../fido2.js";
import {
  configure as _configure,
  Config,
  ConfigWithDefaults,
  MinimalURL,
  MinimalTextDecoder,
} from "../config.js";
import { retrieveTokens } from "../storage.js";
import { Passwordless as Component } from "./components.js";
export * from "./components.js";
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
} from "../react/hooks.js";
export { useLocalUserCache, useAwaitableState } from "../react/hooks.js";
export { PasswordlessContextProvider };
interface PasskeyConfig {
  fido2: {
    /**
     * React Native Passkey Domain. Used by iOS and Android to link your app's passkeys to your domain
     * That domain must serve the mandatory manifest json required by Apple and Google under the following paths:
     * - iOS: https://<your_passkey_domain>/.well-known/apple-app-site-association
     * - Android: https://<your_passkey_domain>/.well-known/assetlinks.json
     * More info:
     * - iOS: https://developer.apple.com/documentation/xcode/supporting-associated-domains
     * - Android: https://developer.android.com/training/sign-in/passkeys#add-support-dal
     */
    passkeyDomain: string;
    rp?: { id?: string; name?: string };
  };
}

export type ReactNativeConfig = Config & Partial<PasskeyConfig>;

export type ReactNativeConfigWithDefaults = ConfigWithDefaults & {
  fido2: { passkeyDomain: string; rp: { id: string; name: string } };
};
export function usePasswordless() {
  const hooks = _usePasswordless();
  const { reCheck } = hooks;
  const url = Linking.useURL() as string;
  const config = configure();
  useEffect(() => {
    if (url && url !== config.location.href) {
      config.location.href = url;
      reCheck();
    }
  }, [reCheck, config.location, url]);
  return {
    ...hooks,
    authenticateWithFido2: (args: {
      /**
       * Username, or alias (e-mail, phone number)
       */
      username?: string;
      credentials?: { id: string; transports?: AuthenticatorTransport[] }[];
      clientMetadata?: Record<string, string>;
      credentialGetter?: typeof fido2getCredential;
    }) =>
      hooks.authenticateWithFido2({
        ...args,
        credentialGetter: credentialGetter,
      }),
    fido2CreateCredential: (
      ...args: Parameters<typeof fido2CreateCredential>
    ) => hooks.fido2CreateCredential(fido2CreateCredential, ...args),
  };
}

export class URLParser {
  constructor(url: string) {
    const urlObject = new URL(url);
    return {
      ...urlObject,
      hash: "#" + (url.split("#")[1] || ""),
    };
  }
}

const reactNativeMinimalLocation = {
  _url: "",
  hostname: "",
  set href(url: string) {
    this._url = url;
  },
  get href(): string {
    return this._url;
  },
};

export function configure(config?: ReactNativeConfig) {
  if (config && config.fido2) {
    config.fido2.rp = {
      id: config.fido2.passkeyDomain,
      name: config.fido2.passkeyDomain,
      ...config.fido2.rp,
    };
  }
  if (config && !config.location && !config.fido2) {
    throw new Error(
      "You must provide a minimal location config or fido2 passkeyDomain"
    );
  } else if (config) {
    config.location = reactNativeMinimalLocation;
    config.location.href = config.fido2?.passkeyDomain
      ? `https://${config.fido2?.passkeyDomain}`
      : "myappdomain";
    config.history = {
      pushState: () => undefined,
    };
    config.URL = URLParser as MinimalURL;
    config.TextDecoder = RNTextDecoder as MinimalTextDecoder;
  }
  return _configure(config);
}

export const Passwordless = { configure, Component };
export const toBase64String = (base64Url: string) =>
  base64Url.replace(/-/g, "+").replace(/_/g, "/") + "==";
export const toBase64 = (input: string) =>
  Buffer.from(input, "utf-8").toString("base64");
export async function fido2CreateCredential({
  friendlyName,
}: {
  friendlyName: string | (() => string | Promise<string>);
}) {
  const config = configure();
  const response = await fido2StartCreateCredential();
  if (!config.fido2) throw new Error("FIDO2 not configured");
  const credential = await Passkey.register({
    ...response,
    rp: {
      id: config.fido2.rp!.id!,
      name: config.fido2.rp!.name!,
    },
    challenge: toBase64String(response.challenge),
  });
  friendlyName = friendlyName as string;
  return await fido2CompleteCreateCredential({
    credential: {
      clientDataJSON_B64: credential.response.clientDataJSON,
      attestationObjectB64: credential.response.attestationObject,
    },
    friendlyName,
  });
}
export async function _fido2getCredential(
  request: Parameters<typeof fido2getCredential>[0]
) {
  const config = configure();
  if (!config.fido2) throw new Error("FIDO2 not configured");
  const result = await Passkey.authenticate({
    challenge: toBase64String(request.challenge),
    rpId: request.relyingPartyId || config.fido2.rp!.id!,
  });
  return {
    credentialIdB64: result.id,
    authenticatorDataB64: result.response.authenticatorData,
    clientDataJSON_B64: result.response.clientDataJSON,
    signatureB64: result.response.signature,
    userHandleB64: toBase64(result.response.userHandle),
  };
}

export function credentialGetter(
  ...args: Parameters<typeof fido2getCredential>
) {
  if (!Passkey.isSupported()) {
    throw new Error("Passkey not supported on this device");
  }
  return _fido2getCredential(...args);
}

export async function getAccountDetails() {
  const tokens = await retrieveTokens();
  if (!tokens?.idToken) {
    return {};
  }
  return parseJwtPayload(tokens.idToken);
}

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
