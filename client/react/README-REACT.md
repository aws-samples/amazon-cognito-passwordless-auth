# Cognito Passwordless React Client

Client to use this library in React Applications:

- React hook: `usePasswordless` This hook should provide you all functionality to sign-in with Magic Links, FIDO2, SMS Step Up Auth (and passwords too should you want it)
- Sample React components––to get started quickly and for some inspiration to build your own:
  - `<Passwordless />`: sample component that renders a login page, allowing the user to choose between FIDO2 and Magic Links
  - `<Fido2Toast />`: sample component (a "toast" at the top of the page) that (1) recommends to add a FIDO2 credential if the user doesn't yet have one and (2) shows the user's registered FIDO2 credentials

The easiest way to see it in action and play around is to deploy the [end-to-end example](../../end-to-end-example) into your own AWS account. You can run the accompanying front end locally, and sign-in with magic links and FIDO2, and SMS OTP Step Up Authentication.

#### `<Passwordless />` login component. Shows the last user that was signed in on this device:

<img src="../../drawings/passwordless-signin.png" alt="Passwordless Sign In" width="500px" />

#### `<Fido2Toast />` component:

FIDO2 Recommendation. The toast appears automatically on the top right of the page, if the user signed-in using another method than FIDO2, doesn't yet have any FIDO2 credentials set up, and has a user verifying platform authenticator available:

<img src="../../drawings/fido2-recommendation-screenshot.png" alt="FIDO2 credentials" width="400px" />

Provide a friendly name for the FIDO2 credential being registered:

<img src="../../drawings/fido2-friendly-name-screenshot.png" alt="FIDO2 credentials" width="450px" />

FIDO2 activated:

<img src="../../drawings/fido2-activated-screenshot.png" alt="FIDO2 credentials" width="250px" />

Manage FIDO2 credentials. This toast appears on the top right of the page, if you call `toggleShowAuthenticatorManager()` (function made available by the `usePasswordless` hook).

<img src="../../drawings/fido2-authenticators-screenshot.png" alt="FIDO2 credentials" width="500px" />

<br />

---

## Table of Contents

1. [Considerations](#1.-considerations)
2. [Pre-requisites](#2.-pre-requisites)
3. [Installation](#3.-installation)
4. [Usage](#4.-usage)

---

### 1. Considerations

- This library supports React 17.0+ and to be able to use it, you must have your [environment properly setup for react](https://reactjs.org/docs/getting-started.html).
- As the time of writing, WebAuthn is natively supported on Chrome, Firefox, Microsoft Edge and Safari. However, browsers differ in their level of support (see also [fido2-browser-support](../../FIDO2.md#fido2-browser-support)).

### 2. Pre-requisites

- Make sure you have properly setup the library and deployed all required backend dependencies. [More info](../../README.md)
- Mandatory peer dependency: [react](https://github.com/facebook/react)

### 3. Installation

This library is published as a npm package under `amazon-cognito-passwordless-auth` name. Install it by running the following command:

```
npm install amazon-cognito-passwordless-auth
```

### 4. Usage

A great way to learn how to use this library is to look at how we use it ourselves in the end-to-end example: [end-to-end-example/client](../../end-to-end-example/client)

- In [main.tsx](../../end-to-end-example/client/src/main.tsx) we configure the library and wrap our own app with the `PasswordlesContextProvider` as well as with the `Passwordless` component. By wrapping our own app with the `Passwordless` component, our app will only show if the user is signed in, otherwise the `Passwordless` component shows to make the user sign in. Also we add the `<Fido2Toast />` container, to display the [FIDO2 "toast"](#fido2toast-component).
- In [App.tsx](../../end-to-end-example/client/src/App.tsx) we use the `usePasswordless` hook to understand the user's sign-in status, provide a button to sign out, and toggle show/hide the authenticators manager (part of the [FIDO2 "toast"](#fido2toast-component)).
- In [StepUpAuth.tsx](../../end-to-end-example/client/src/StepUpAuth.tsx) we show how to execute SMS OTP Step Up Authentication.

#### Configuration

To use the library, you need to first import and configure it, and then wrap your app with the `PasswordlesContextProvider`.

In your web app's entrypoint (e.g. `main.tsx`)

```javascript
import { Passwordless } from "amazon-cognito-passwordless-auth/react";

Passwordless.configure({
  cognitoIdpEndpoint: "<URL_TO_YOUR_COGNITO_PROXY_API>",
  clientId: "<COGNITO_CLIENT_ID>",
  userPoolId: "<COGNITO_USER_POOL_ID>",
  fido2: {
    baseUrl: "<URL_TO_YOUR_FIDO2_API>",
    userVerification: "required",
  },
  /* BELOW PARAMETERS ARE OPTIONAL */
  proxyApiHeaders: {
    "<YOUR_HEADER_KEY_1>": "<YOUR_HEADER_VALUE_1>",
    "<YOUR_HEADER_KEY_2>": "<YOUR_HEADER_VALUE_2>",
  }, // Default to empty object
  storage: window.localStorage, // Default to localStorage
});
```

Then, wrap your app with the `PasswordlessContextProvider`:

```typescript
import { PasswordlessContextProvider } from "amazon-cognito-passwordless-auth/react";

ReactDOM.createRoot(document.getElementById("root")).render(
  <PasswordlessContextProvider>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </PasswordlessContextProvider>
);
```

You can also wrap your app with the `Passwordless` component. In that case, your app will only show if the user is signed in, otherwise the `Passwordless` component shows to make the user sign in. If you're using the sample components, also include the CSS import:

```typescript
import {
  PasswordlessContextProvider,
  Passwordless as PasswordlessComponent,
} from "amazon-cognito-passwordless-auth/react";
import "amazon-cognito-passwordless-auth/passwordless.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <PasswordlessContextProvider>
    <PasswordlessComponent
      brand={{
        backgroundImageUrl: "<url>",
        customerName: "ACME corp.",
        customerLogoUrl: "<url>",
      }}
    >
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </PasswordlessComponent>
  </PasswordlessContextProvider>
);
```

Also, add the [FIDO2 "toast"](#fido2toast-component) to display the suggestion to enable FaceID/TouchID, and be able to show the authenticators manager:

```typescript
import {
  PasswordlessContextProvider,
  Passwordless as PasswordlessComponent,
  Fido2Toast,
} from "amazon-cognito-passwordless-auth/react";
import "amazon-cognito-passwordless-auth/passwordless.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <PasswordlessContextProvider>
    <PasswordlessComponent
      brand={{
        backgroundImageUrl: "<url>",
        customerName: "ACME corp.",
        customerLogoUrl: "<url>",
      }}
    >
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </PasswordlessComponent>
    <Fido2Toast />
  </PasswordlessContextProvider>
);
```

In your components, use the `usePasswordless` hook:

```typescript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

function MyComponent() {
  const { signInStatus, ... } = usePasswordless();

  return <div>Your sign in status: {signInStatus}</div>;
}
```

#### Sign In with Magic Link

```javascript
import { signUp } from "amazon-cognito-passwordless-auth/cognito-api";
import { usePasswordless } from "amazon-cognito-passwordless-auth";

export default function YourComponent() {
  const { requestSignInLink, authenticateWithSRP } = usePasswordless();

  async function logInWithMagicLink() {
    // Request a magic link to be e-mailed to the user.
    // When the user clicks on the link, your web app will open and parse the link
    // automatically (if you've loaded this library), and sign the user in
    await requestSignInLink({
      username: "Your username or alias (e.g. e-mail address)",
    });
  }

  return (
    // Your component's view
    // You would add a form or so here to collect the user's e-mail address,
    // and then invoke the logInWithMagicLink function above
    <div>Your component</div>
  );
}
```

#### Token (JWT) Storage

The library automatically saves the state (ie: idToken, accessToken and others) inside your configured storage (default: localStorage) so that now you can use the rest of the methods and it will remember the logged user and will perform all requests against it.

To access them, use the `usePasswordless()` hook as follows:

```javascript
const {
  tokens, // the raw tokens, i.e. ID, Access, Refresh token as strings
  tokensParsed, // the JSON parsed tokens
} = usePasswordless();
```

#### Create FIDO2 Credential

Once you are signed in, you can create FIDO2 (WebAuthn) credentials for your user, this will prompt the native WebAuthn dialog (e.g. Face/Touch) on your environment and set it up for your cognito user.

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  const { fido2CreateCredential } = usePasswordless();

  async function createCredential() {
    const credential = await fido2CreateCredential({
      friendlyName: "Your device name",
    });
    //  The credential object will look like this:
    //  credential = {
    //    credentialId: string;
    //    friendlyName: string;
    //    createdAt: Date;
    //    lastSignIn?: Date;
    //    signCount: number;
    //    update: (friendlyName: string) => void; // function to update the friendlyName
    //    delete: () => void; // function to delete the credential
    //  }
  }

  return (
    // Your component's view
    // You would add a form or so here to invoke the createCredential function above,
    // and ask the user to provide a friendly name for the credential
    <div>Your component</div>
  );
}
```

This will prompt the native WebAuthn dialog (e.g. Face/Touch) on your environment to create the credential.

#### LogIn with your FIDO2 Credential

If the user has registered FIDO2 credentials, use the `authenticateWithFido2()` function to let the user sign-in with them.

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  const { authenticateWithFido2 } = usePasswordless();

  async function signInWithFaceOrTouch() {
    const credential = await authenticateWithFido2({
      username: "Your username or alias (e.g. e-mail address)",
    });
  }

  return (
    // Your component's view
    // You would add a form or so here to collect the user's e-mail address,
    // and then invoke the signInWithFaceOrTouch function above
    <div>Your component</div>
  );
}
```

This will prompt the native WebAuthn dialog (e.g. Face/Touch) on your environment to perform the log in.

#### Sign In with Password

Sure you can still use passwords if you really want to :)

```javascript
import { signUp } from "amazon-cognito-passwordless-auth/cognito-api";
import { usePasswordless } from "amazon-cognito-passwordless-auth";

export default function YourComponent() {
  const { authenticateWithSRP, authenticateWithPlaintextPassword } =
    usePasswordless();

  async function logInWithPassword() {
    // You can sign in with username and password too:
    await authenticateWithSRP({
      username: "YOUR_USER_NAME",
      password: "YOUR_PREFERRED_PASSWORD",
    });

    // Or, if you don't want to use SRP (e.g. because you're using the Cognito User Migration trigger),
    // sign in using the plaintext password:
    await authenticateWithPlaintextPassword({
      username: "YOUR_USER_NAME",
      password: "YOUR_PREFERRED_PASSWORD",
    });
  }

  return (
    // Your component's view
    // You would add a form or so here to collect the user's e-mail address and password,
    // and then invoke the logInWithPassword function above
    <div>Your component</div>
  );
}
```

#### SignOut

To delete the stored tokens (JWTs), and revoke the refresh token, use the `signOut()` function.

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/signOut";

export default function YourComponent() {
  const { signOut } = usePasswordless();

  async function doSignOut() {
    await signOut();
  }

  return (
    // Your component's view
    // Add a button or so to call the doSignOut function
    <div>Your component</div>
  );
}
```

#### Sign Up

If your User Pool is enabled for self sign-up, users can sign up like so:

```javascript
import { signUp } from "amazon-cognito-passwordless-auth/cognito-api";

export default function YourComponent() {
  async function signUp() {
    await signUp({
      username: "YOUR_USER_NAME",
      password: "YOUR_PREFERRED_PASSWORD",
      /* BELOW PARAMETERS ARE OPTIONAL */
      userAttributes: [
        {
          name: "name",
          value: "YOUR NAME",
        },
      ],
    });
    // userAttributes are optional and you can pass any Cognito User pool attributes
    // Read more: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html
  }

  return (
    // Your component's view
    // You would add a form or so here to collect the user's e-mail address and password,
    // and then invoke the signUp function above
    <div>Your component</div>
  );
}
```

#### Refresh user data (aka: tokensParsed)

If you have changed attributes on your cognito user and want to refresh the tokens to include the updated data, use `refreshTokens()` function.

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  const { refreshTokens } = usePasswordless();

  async function doRefresh() {
    await refreshTokens();
  }

  return (
    // Your component's view
    // Add a button or so to call the doRefresh function
    <div>Your component</div>
  );
}
```

#### List FIDO2 Credentials

The list of FIDO2 credentials is made available via the hook:

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  // Credentials will be fetched when the app loads, initially fido2Credentials will be undefined
  const { fido2Credentials } = usePasswordless();
  // After credentials have been fetched, fido2Credentials will be an array of credentials.
  // Each credential object in the array will look like this:
  // credential = {
  //   credentialId: string;
  //   friendlyName: string;
  //   createdAt: Date;
  //   lastSignIn?: Date;
  //   signCount: number;
  //   update: (friendlyName: string) => void; // function to update the friendlyName
  //   delete: () => void; // function to delete the credential
  // }

  return (
    // Your component's view
    <div>
      {fido2Credentials === undefined
        ? "Loading FIDO2 credentials ..."
        : `You have ${fido2Credentials.length} registered credentials`}
    </div>
  );
}
```

#### Delete FIDO2 Credential

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  const { fido2Credentials } = usePasswordless();

  async function deleteCredential(index) {
    // Example: delete the 1st credential
    fido2Credentials?.at(index).delete();
  }

  return (
    // Your component's view
    // Add a button or so to call the deleteCredential function
    <div>Your component</div>
  );
}
```

#### Update FIDO2 Credential

```javascript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

export default function YourComponent() {
  const { fido2Credentials } = usePasswordless();

  async function updateCredential(index) {
    // Example: update the 1st credential
    fido2Credentials?.at(index).update({ friendlyName: "My Phone" });
  }

  return (
    // Your component's view
    // You would add a form or so here to collect the updated friendly name,
    // and then invoke the updateCredential function above
    <div>Your component</div>
  );
}
```

#### Update Cognito User Attributes

To update your Cognito User Attributes you can use the `updateUserAttributes` function:

```javascript
import { updateUserAttributes } from "amazon-cognito-passwordless-auth/cognito-api";

async function update() {
  await updateUserAttributes({
    userAttributes: [
      {
        name: "name",
        value: "YOUR NEW NAME",
      },
    ],
  });
}
```

#### Send the user attribute verification code

To receive a code via email or SMS to verify the `email` or `phone_number` respectively, use the `getUserAttributeVerificationCode` function:

```javascript
import { getUserAttributeVerificationCode } from "amazon-cognito-passwordless-auth/cognito-api";

async function getCode() {
  await getUserAttributeVerificationCode({
    attributeName: "email",
  });
  await getUserAttributeVerificationCode({
    attributeName: "phone_number",
  });
}
```

#### Verify Cognito User Attribute

To verify `email` or `phone_number` attributes, use the `verifyUserAttribute` function

```javascript
import { verifyUserAttribute } from "amazon-cognito-passwordless-auth/cognito-api";

async function provideVerificationCode() {
  await verifyUserAttribute({
    attributeName: "phone_number",
    code: "123456",
  });
}
```

#### Helpers

**timeAgo(now: number, from: Date)**

A helper function that returns a human friendly string indicating how much time passed from the `from` Date to the `now` timestamp

```javascript
import { timeAgo } from "amazon-cognito-passwordless-auth/util";

const now = timeAgo(Date.now(), new Date()); // Just now
const seconds = timeAgo(Date.now(), new Date(Date.now() - 30 * 1000)); // 30 seconds ago
const hours = timeAgo(Date.now(), newDate(Date.now() - 2 * 3600 * 1000)); // 2 hours ago
```
