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

interface Headers {
  [key: string]: string;
}

export interface Config {
  /**
   * The Amazon Cognito IDP endpoint.
   * Either provide just the region, e.g. "eu-west-1",
   * or provide a full URL (e.g. if you are using a proxy API)
   */
  cognitoIdpEndpoint: string;
  /** The Amazon Cognito Client ID */
  clientId: string;
  /** The Amazon Cognito Client Secret (optional: don't use this in Web clients, use when running server side) */
  clientSecret?: string;
  /** The Amazon Cognito User Pool ID */
  userPoolId?: string;
  /** FIDO2 (WebAuthn) configuration */
  fido2?: {
    /** The base URL (i.e. the URL with path "/") of your FIDO2 API */
    baseUrl: string;
    /**
     * FIDO2 authenticator selection criteria:
     *
     * - authenticatorAttachment: platform, or cross-platform
     * - residentKey (aka Passkey, discoverable credential): discouraged, preferred, or required
     * - userVerification: discouraged, preferred, or required
     */
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    /** Configuration of the Relying Party */
    rp?: {
      name?: string;
      id?: string;
    };
    /** FIDO2 Attestation Conveyance Preference you want to use */
    attestation?: AttestationConveyancePreference;
    /** FIDO2 extensions you want to use */
    extensions?: AuthenticationExtensionsClientInputs;
    /**
     * FIDO2 timeout. This sets the timeout for native FIDO dialogs,
     * i.e. when creating a new credential and when signing in
     */
    timeout?: number;
  };
  /**
   * Function that will be called with debug information,
   * e.g. you can use `console.debug` here.
   */
  debug?: (...args: unknown[]) => unknown;
  /** The storage object to use. E.g. `localStorage` */
  storage?: CustomStorage;
  /**
   * If you use a custom proxy in front of Amazon Cognito,
   * you may want to pass additional HTTP headers.
   */
  proxyApiHeaders?: Headers;
  /**
   * Overriding fetch implementation. Default: globalThis.fetch
   */
  fetch?: MinimalFetch;
  /**
   * Overriding crypto implementation. Default: globalThis.crypto
   */
  crypto?: MinimalCrypto;
  /**
   * Overriding location implementation. Default: globalThis.location
   */
  location?: MinimalLocation;
  /**
   * Overriding history implementation. Default: globalThis.history
   */
  history?: MinimalHistory;
}

export type ConfigWithDefaults = Config &
  Required<
    Pick<Config, "storage" | "crypto" | "fetch" | "location" | "history">
  >;

let config_: ConfigWithDefaults | undefined = undefined;
export function configure(config?: Config) {
  if (config) {
    config_ = {
      ...config,
      crypto: config.crypto ?? Defaults.crypto,
      storage: config.storage ?? Defaults.storage,
      fetch: config.fetch ?? Defaults.fetch,
      location: config.location ?? Defaults.location,
      history: config.history ?? Defaults.history,
    };
    config_.debug?.("Configuration loaded:", config);
  } else {
    if (!config_) {
      throw new Error("Call configure(config) first");
    }
  }
  return config_;
}

type Maybe<T> = T | undefined | null;

export interface CustomStorage {
  getItem: (key: string) => Maybe<string> | Promise<Maybe<string>>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export function configureFromAmplify(
  amplifyConfig: AmplifyAuthConfig | AmplifyConfig
) {
  const { region, userPoolId, userPoolWebClientId } = isAmplifyConfig(
    amplifyConfig
  )
    ? amplifyConfig.Auth
    : amplifyConfig;
  if (typeof region !== "string") {
    throw new Error(
      "Invalid Amplify configuration provided: invalid or missing region"
    );
  }
  if (typeof userPoolId !== "string") {
    throw new Error(
      "Invalid Amplify configuration provided: invalid or missing userPoolId"
    );
  }
  if (typeof userPoolWebClientId !== "string") {
    throw new Error(
      "Invalid Amplify configuration provided: invalid or missing userPoolWebClientId"
    );
  }
  configure({
    cognitoIdpEndpoint: region,
    userPoolId,
    clientId: userPoolWebClientId,
  });
  return {
    with: (
      config: Omit<Config, "cognitoIdpEndpoint" | "userPoolId" | "clientId">
    ) => {
      return configure({
        cognitoIdpEndpoint: region,
        userPoolId,
        clientId: userPoolWebClientId,
        ...config,
      });
    },
  };
}

interface AmplifyAuthConfig {
  region?: unknown;
  userPoolId?: unknown;
  userPoolWebClientId?: unknown;
}

interface AmplifyConfig {
  Auth: AmplifyAuthConfig;
}

function isAmplifyConfig(c: unknown): c is AmplifyConfig {
  return !!c && typeof c === "object" && "Auth" in c;
}

class MemoryStorage {
  private memory: Map<string, string>;
  constructor() {
    this.memory = new Map();
  }
  getItem(key: string) {
    return this.memory.get(key);
  }
  setItem(key: string, value: string) {
    this.memory.set(key, value);
  }
  removeItem(key: string) {
    this.memory.delete(key);
  }
}

export class UndefinedGlobalVariableError extends Error {}

class Defaults {
  static getFailingProxy(expected: string) {
    const message = `"${expected}" is not available as a global variable in your JavaScript runtime, so you must configure it explicitly with Passwordless.configure()`;
    return new Proxy((() => undefined) as object, {
      apply() {
        throw new UndefinedGlobalVariableError(message);
      },
      get() {
        throw new UndefinedGlobalVariableError(message);
      },
    });
  }
  static get storage() {
    return typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : new MemoryStorage();
  }
  static get crypto(): MinimalCrypto {
    if (typeof globalThis.crypto !== "undefined") return globalThis.crypto;
    return Defaults.getFailingProxy("crypto") as MinimalCrypto;
  }
  static get fetch(): MinimalFetch {
    if (typeof globalThis.fetch !== "undefined") return globalThis.fetch;
    return Defaults.getFailingProxy("fetch") as MinimalFetch;
  }
  static get location(): MinimalLocation {
    if (typeof globalThis.location !== "undefined") return globalThis.location;
    return Defaults.getFailingProxy("location") as MinimalLocation;
  }
  static get history(): MinimalHistory {
    if (typeof globalThis.history !== "undefined") return globalThis.history;
    return Defaults.getFailingProxy("history") as MinimalHistory;
  }
}

export interface MinimalResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

export interface MinimalLocation {
  href: string;
  hostname: string;
}

export type MinimalFetch = (
  input: string | URL,
  init?:
    | {
        signal?: AbortSignal;
        headers?: Record<string, string>;
        method?: string;
        body?: string;
      }
    | undefined
) => Promise<MinimalResponse>;

export interface MinimalHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface MinimalCrypto {
  getRandomValues: Crypto["getRandomValues"];
  subtle: {
    digest: Crypto["subtle"]["digest"];
    importKey: Crypto["subtle"]["importKey"];
    sign: Crypto["subtle"]["sign"];
  };
}
