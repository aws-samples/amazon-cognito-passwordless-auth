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
import Config from "react-native-config";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Passwordless,
  PasswordlessContextProvider,
  retrieveTokens,
  Fido2Toast,
} from "amazon-cognito-passwordless-auth";
import AppComponent from "./App";

const App = () => {
  return (
    <PasswordlessContextProvider enableLocalUserCache={true}>
      <Passwordless.Component
        brand={{
          backgroundImageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Manhattan_in_the_distance_%28Unsplash%29.jpg/2880px-Manhattan_in_the_distance_%28Unsplash%29.jpg",
          customerName: "Amazon Web Services",
          customerLogoUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Amazon_Web_Services_Logo.svg/1280px-Amazon_Web_Services_Logo.svg.png",
        }}
      >
        <AppComponent />
      </Passwordless.Component>
      <Fido2Toast />
      <StatusBar style="dark" />
    </PasswordlessContextProvider>
  );
};

export default App;

Passwordless.configure({
  cognitoIdpEndpoint: Config.COGNITO_IDP_ENDPOINT,
  clientId: Config.CLIENT_ID,
  userPoolId: Config.USER_POOL_ID,
  fido2: {
    baseUrl: Config.FIDO2_BASE_URL,
    authenticatorSelection: {
      userVerification: "required",
    },
    passkeyDomain: Config.PASSKEY_DOMAIN,
  },
  proxyApiHeaders: {
    "x-api-key": Config.COGNITO_IDP_ENDPOINT_API_KEY,
  },
  storage: AsyncStorage,
  debug: console.debug,
  fetch: async (input, init) => {
    const targetUrl = new URL(
      input instanceof URL
        ? input.href
        : input instanceof Request
        ? input.url
        : input
    );
    if (targetUrl.href.match(Config.COGNITO_IDP_ENDPOINT) && init?.headers) {
      const headers = new Headers(init.headers);
      headers.set("x-api-key", Config.COGNITO_IDP_ENDPOINT_API_KEY);
      const { username } = (await retrieveTokens()) ?? {};
      if (username) {
        headers.set("x-username", username ?? "");
      }
      init.headers = headers;
    }
    return fetch(input, init);
  },
});
