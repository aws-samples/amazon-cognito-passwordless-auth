# Cognito Passwordless React Native Client

Client to use this library in React Native Applications

### Table of Contents

1. [Considerations](#1.-considerations)
2. [Pre-requisites](#2.-pre-requisites)
3. [Installation](#3.-installation)
4. [iOS Setup](#4.-ios-setup)
5. [Usage](#5.-usage)

---

#### 1. Considerations

- This library supports RN 70.6+ and to be able to use it, you must have your [environment properly setup for react native](https://reactnative.dev/docs/environment-setup).
- Passkeys are natively supported only on iOS so far (although they'll be available for [Android very soon](https://developers.google.com/identity/passkeys/faq))
- iOS Target must be 16.0+ since passkeys are not available in older versions
- In order to use passkeys in iOS, you need to enable associated domains and, therefore, you'll need a [Paid Apple Developer Subscription](https://developer.apple.com/support/compare-memberships/) to use it.

#### 2. Pre-requisites

- Make sure you have properly setup the library and deployed all required backend dependencies. [More info](../../README.md)
- Mandatory peer dependency: [react-native-passkey](https://github.com/f-23/react-native-passkey) that interacts with the native components to use passkeys
- Mandatory peer dependency: [React Native Async Storage](https://react-native-async-storage.github.io/async-storage/docs/install/) to save the state of the auth session

### 3. Installation

This library is published as a npm package under `amazon-cognito-passwordless-auth` name. Install it by running the following command:

```
npm install amazon-cognito-passwordless-auth
```

#### 4. iOS Setup

To use it in iOS you need to setup your associated domain and serve the config JSON file required for Apple from it.

##### Setting Up the associated domain

1. Open your project's XCode Workspace by navigating to the root folder of your React Native App and run `open ./ios/YOUR_APP_NAME.xcworkspace`
2. Select your target App and navigate to `Signing & Capabilities` tab
3. Scroll down until you find the `Associated Domains` section and click the button `+` to add one
4. Type `webcredentials:` followed by your naked domain (e.g.: `webcredentials:example.com`)

![Associated Domain XCode](./xcode-associated-domains.png)

##### Serving the static JSON config file

Now you just need to serve the following config file under a `GET https://<yourdomain>/.well-known/apple-app-site-association`:

```json
{
  "applinks": {},
  "webcredentials": {
    "apps": ["<YOUR_TEAM_IDENTIFIER>.<YOUR_APP_BUNDLE_ID>"]
  },
  "appclips": {}
}
```

Just replace `<YOUR_TEAM_IDENTIFIER>` for your Apple Team identifier and `<YOUR_APP_BUNDLE_ID>` for the bundle id you setup for your app.

For example if your team ID is `H123456789` and your bundle `com.example.app`, you should serve the following file:

```json
{
  "applinks": {},
  "webcredentials": {
    "apps": ["H123456789.com.example.app"]
  },
  "appclips": {}
}
```

#### 5. Usage

To use the library, you need to first import, wrap your app with the PasswordlesContextProvider and configure it, usually in your main App.js.

##### Configuration

```javascript
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PasswordlessContextProvider,
  usePasswordless,
} from "amazon-cognito-passwordless-auth";

function App() {
  const { configure } = usePasswordless();
  configure({
    cognitoIdpEndpoint: "<URL_TO_YOUR_COGNITO_PROXY_API>",
    clientId: "<COGNITO_CLIENT_ID>",
    userPoolId: "<COGNITO_USER_POOL_ID>",
    fido2: {
      baseUrl: "<URL_TO_YOUR_FIDO2_API>",
      userVerification: "required",
    },
    native: {
      passkeyDomain: "<ASSOCIATED_PASSKEY_DOMAIN>",
      passkeyAppName: "<YOUR_APPS_NAME>",
    },
    storage: AsyncStorage,
    /* BELOW PARAMETERS ARE OPTIONAL */
    proxyApiHeaders: {
      "<YOUR_HEADER_KEY_1>": "<YOUR_HEADER_VALUE_1>",
      "<YOUR_HEADER_KEY_2>": "<YOUR_HEADER_VALUE_2>",
    }, // Default to empty object
  });
  // Your original App
}

export default function AppWrapper() {
  return (
    <PasswordlessContextProvider>
      <App />
    </PasswordlessContextProvider>
  );
}
```

##### SignUp and LogIn

The first step to be able to generate and setup passkeys credentials is to Sign up and Log in to your Cognito User Pool

```javascript
import {
  signUp,
  usePasswordless,
} from 'amazon-cognito-passwordless-auth';

export default function YourComponent() {
  const {
    authenticateWithPlaintextPassword
  } = usePasswordless();

  async function signUp() {
    await signUp({
      username: 'YOUR_USER_NAME',
      password: 'YOUR_PREFERRED_PASSWORD',
      /* BELOW PARAMETERS ARE OPTIONAL */
      userAttributes: [
        {
          name: 'name',
          value: 'YOUR NAME'
        }
      ]
    });
    // userAttributes are optional and you can pass any Cognito User pool attributes
    // Read more: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html
  }

  async function logIn() {
    // MagicLink and SRP Authentication is not yet supported for React Native
    await authenticateWithPlainTextPassword({
      username: 'YOUR_USER_NAME',
      password: 'YOUR_PREFERRED_PASSWORD',
    });
  }

  return (
    // Your component's view
  );
}
```

The library automatically saves the state (ie: idToken, accessToken and others) inside your AsyncStorage so that now you can use the rest of the methods and it will remember the logged user and will perform all requests against it.

To access to them, use the `usePasswordless()` hook as follows:

```javascript
const { tokensParsed } = usePasswordless();
```

##### Create FIDO2 Credential

[Please refer to the common ReactJS usage](./README-REACT.md/#create-fido2-credential)

#### LogIn with your FIDO2 Credential

[Please refer to the common ReactJS usage](./README-REACT.md/#login-with-your-fido2-credential)

#### SignOut

[Please refer to the common ReactJS usage](./README-REACT.md/#signout)

#### Refresh user data (aka: tokensParsed)

[Please refer to the common ReactJS usage](./README-REACT.md/#refresh-user-data-aka-tokensparsed)

#### List FIDO2 Credentials

[Please refer to the common ReactJS usage](./README-REACT.md/#list-fido2-credentials)

#### Delete FIDO2 Credential

[Please refer to the common ReactJS usage](./README-REACT.md/#delete-fido2-credential)

#### Update Cognito User Attributes

[Please refer to the common ReactJS usage](./README-REACT.md/#update-cognito-user-attributes)

#### Send the user attribute verification code

[Please refer to the common ReactJS usage](./README-REACT.md/#send-the-user-attribute-verification-code)

#### Verify Cognito User Attribute

[Please refer to the common ReactJS usage](./README-REACT.md/#verify-cognito-user-attribute)

#### Helpers

[Please refer to the common ReactJS usage](./README-REACT.md/#helpers)
