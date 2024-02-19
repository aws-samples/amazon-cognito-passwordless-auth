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
import { configure } from "./config.js";
import { IdleState, BusyState, TokensFromSignIn } from "./model.js";
import {
  initiateAuth,
  respondToAuthChallenge,
  assertIsChallengeResponse,
  handleAuthResponse,
} from "./cognito-api.js";
import { defaultTokensCb } from "./common.js";
import { bufferFromBase64, bufferToBase64 } from "./util.js";

let _CONSTANTS: { g: bigint; N: bigint; k: bigint } | undefined;
async function getConstants() {
  if (!_CONSTANTS) {
    const g = BigInt(2);
    const N = BigInt(
      "0x" +
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1" +
        "29024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
        "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245" +
        "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D" +
        "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
        "83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9" +
        "DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
        "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64" +
        "ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7" +
        "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6B" +
        "F12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB31" +
        "43DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF"
    );
    const { crypto } = configure();
    const k = arrayBufferToBigInt(
      await crypto.subtle.digest(
        "SHA-256",
        hexToArrayBuffer(`${padHex(N.toString(16))}${padHex(g.toString(16))}`)
      )
    );
    _CONSTANTS = {
      g,
      N,
      k,
    };
  }
  return _CONSTANTS;
}

/**
 * modulo that works on negative bases too
 */
function modulo(base: bigint, mod: bigint) {
  return ((base % mod) + mod) % mod;
}

function modPow(base: bigint, exp: bigint, mod: bigint) {
  // Calculate: (base ** exp) % mod
  let result = BigInt(1);
  let x = modulo(base, mod);
  while (exp > BigInt(0)) {
    if (modulo(exp, BigInt(2))) {
      result = modulo(result * x, mod);
    }
    exp = exp / BigInt(2);
    x = modulo(x * x, mod);
  }
  return result;
}

function padHex(hexStr: string) {
  hexStr = hexStr.length % 2 ? `0${hexStr}` : hexStr;
  hexStr = parseInt(hexStr.slice(0, 2), 16) >> 7 ? `00${hexStr}` : hexStr;
  return hexStr;
}

function generateSmallA() {
  const { crypto } = configure();
  const randomValues = new Uint8Array(128);
  crypto.getRandomValues(randomValues);
  return arrayBufferToBigInt(randomValues.buffer);
}

async function calculateLargeAHex(smallA: bigint) {
  const { g, N } = await getConstants();
  return modPow(g, smallA, N).toString(16);
}

async function calculateSrpSignature({
  smallA,
  largeAHex,
  srpBHex,
  salt,
  userPoolId,
  username,
  password,
  secretBlock,
}: {
  smallA: bigint;
  largeAHex: string;
  srpBHex: string;
  salt: string;
  userPoolId: string;
  username: string;
  password: string;
  secretBlock: string;
}) {
  const { crypto } = configure();
  const aPlusBHex = padHex(largeAHex) + padHex(srpBHex);
  const u = await crypto.subtle.digest("SHA-256", hexToArrayBuffer(aPlusBHex));
  const [, userPoolName] = userPoolId.split("_");
  const usernamePasswordHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userPoolName}${username}:${password}`)
  );

  const x = await crypto.subtle.digest(
    "SHA-256",
    await new Blob([
      hexToArrayBuffer(padHex(salt)),
      usernamePasswordHash,
    ]).arrayBuffer()
  );

  const { g, N, k } = await getConstants();
  const gModPowXN = modPow(g, arrayBufferToBigInt(x), N);
  const int = BigInt(`0x${srpBHex}`) - k * gModPowXN;
  const s = modPow(
    int,
    smallA + arrayBufferToBigInt(u) * arrayBufferToBigInt(x),
    N
  );
  const ikmHex = padHex(s.toString(16));
  const saltHkdfHex = padHex(arrayBufferToHex(u));
  const infoBits = new Uint8Array([
    ..."Caldera Derived Key".split("").map((c) => c.charCodeAt(0)),
    1,
  ]).buffer;
  const prkKey = await crypto.subtle.importKey(
    "raw",
    hexToArrayBuffer(saltHkdfHex),
    {
      name: "HMAC",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );
  const prk = await crypto.subtle.sign(
    "HMAC",
    prkKey,
    hexToArrayBuffer(ikmHex)
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    prk,
    {
      name: "HMAC",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );
  const hkdf = (await crypto.subtle.sign("HMAC", hkdfKey, infoBits)).slice(
    0,
    16
  );

  const timestamp = formatDate(new Date());
  const parts = [
    userPoolName.split("").map((c) => c.charCodeAt(0)),
    username.split("").map((c) => c.charCodeAt(0)),
    ...bufferFromBase64(secretBlock),
    timestamp.split("").map((c) => c.charCodeAt(0)),
  ].flat();

  const msg = new Uint8Array(parts).buffer;

  const signatureKey = await crypto.subtle.importKey(
    "raw",
    hkdf,
    {
      name: "HMAC",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  const signatureString = await crypto.subtle.sign("HMAC", signatureKey, msg);
  return {
    timestamp,
    passwordClaimSignature: bufferToBase64(signatureString),
  };
}

function hexToArrayBuffer(hexStr: string) {
  if (hexStr.length % 2 !== 0) {
    throw new Error("hex string should have even number of characters");
  }
  const octets = hexStr.match(/.{2}/gi)!.map((m) => parseInt(m, 16));
  return new Uint8Array(octets);
}

function arrayBufferToHex(arrBuf: ArrayBuffer) {
  return [...new Uint8Array(arrBuf)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBigInt(arrBuf: ArrayBuffer) {
  return BigInt(`0x${arrayBufferToHex(arrBuf)}`);
}

function formatDate(d: Date) {
  const parts = new Intl.DateTimeFormat("en-u-hc-h23", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    hour12: false,
  }).formatToParts(d);
  const p = (type: string) => parts.find((part) => part.type === type)?.value;
  return [
    p("weekday"),
    p("month"),
    p("day"),
    [p("hour"), p("minute"), p("second")].join(":"),
    p("timeZoneName"),
    p("year"),
  ].join(" ");
}

export function authenticateWithSRP({
  username,
  password,
  smsMfaCode,
  newPassword,
  customChallengeAnswer,
  authflow = "USER_SRP_AUTH",
  tokensCb,
  statusCb,
  clientMetadata,
}: {
  /**
   * Username, or alias (e-mail, phone number)
   */
  username: string;
  password: string;
  smsMfaCode?: () => Promise<string>;
  newPassword?: () => Promise<string>;
  customChallengeAnswer?: () => Promise<string>;
  authflow?: "USER_SRP_AUTH" | "CUSTOM_AUTH";
  tokensCb?: (tokens: TokensFromSignIn) => void | Promise<void>;
  statusCb?: (status: BusyState | IdleState) => void;
  currentStatus?: BusyState | IdleState;
  clientMetadata?: Record<string, string>;
}) {
  const { userPoolId, debug } = configure();
  if (!userPoolId) {
    throw new Error("UserPoolId must be configured");
  }
  const abort = new AbortController();
  const signedIn = (async () => {
    try {
      statusCb?.("SIGNING_IN_WITH_PASSWORD");
      const smallA = generateSmallA();
      const largeAHex = await calculateLargeAHex(smallA);
      debug?.(`Invoking initiateAuth ...`);
      const challenge = await initiateAuth({
        authflow,
        authParameters: {
          SRP_A: largeAHex,
          USERNAME: username,
          CHALLENGE_NAME: "SRP_A",
        },
        clientMetadata,
        abort: abort.signal,
      });
      debug?.(`Response from initiateAuth:`, challenge);
      assertIsChallengeResponse(challenge);
      const {
        SALT: saltHex,
        SRP_B: srpBHex,
        SECRET_BLOCK: secretBlockB64,
        USER_ID_FOR_SRP: userIdForSrp,
      } = challenge.ChallengeParameters;
      const { passwordClaimSignature, timestamp } = await calculateSrpSignature(
        {
          smallA,
          largeAHex,
          srpBHex,
          salt: saltHex,
          username: userIdForSrp,
          userPoolId,
          password,
          secretBlock: secretBlockB64,
        }
      );
      debug?.(`Invoking respondToAuthChallenge ...`);
      const authResult = await respondToAuthChallenge({
        challengeName: challenge.ChallengeName,
        challengeResponses: {
          USERNAME: username,
          PASSWORD_CLAIM_SECRET_BLOCK: secretBlockB64,
          TIMESTAMP: timestamp,
          PASSWORD_CLAIM_SIGNATURE: passwordClaimSignature,
        },
        clientMetadata,
        session: challenge.Session,
        abort: abort.signal,
      });
      debug?.(`Response from respondToAuthChallenge:`, authResult);
      const tokens = await handleAuthResponse({
        authResponse: authResult,
        username,
        smsMfaCode,
        newPassword,
        customChallengeAnswer,
        clientMetadata,
        abort: abort.signal,
      });
      tokensCb
        ? await tokensCb(tokens)
        : await defaultTokensCb({ tokens, abort: abort.signal });
      statusCb?.("SIGNED_IN_WITH_PASSWORD");
      return tokens;
    } catch (err) {
      statusCb?.("PASSWORD_SIGNIN_FAILED");
      throw err;
    }
  })();
  return {
    signedIn,
    abort: () => abort.abort(),
  };
}
