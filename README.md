# Amazon Cognito Passwordless Auth

_**AWS Solution to implement Passwordless authenticaton with Amazon Cognito**_

Passwordless authentication improves security, reduces friction and provides better user experience for end-users of customer facing applications. Amazon Cognito provides features to implement custom authentication flows, which can be used to expand authentication factors for your application. This solution demonstrates several patterns to support passwordless authentication and provides reference implementations for these methods:

- **FIDO2**: aka **WebAuthn**, i.e. sign in with Face, Touch, YubiKey, etc. This includes support for **Passkeys**.
- **Magic Link Sign In**: sign in with a one-time-use secret link that's emailed to you (and works across browsers).
- **SMS based Step-Up auth**: let an already signed-in user verify their identity again with a SMS One-Time-Password (OTP) without requiring them to type in their password.

The reference implementation of each of these auth methods uses several AWS resources. This solution contains both **CDK** code (TypeScript) for the back-end, as well as front-end code (TypeScript) to use in **Web**, **React** and **React Native** to help developers understand the building blocks needed and expand/adjust the solution as necessary.

**IMPORTANT**: This AWS Solution is for demonstration purposes and uses several AWS resources, it is intended for developers with moderate to advanced AWS knowledge. If you plan to use these methods in production, you need to review, adjust and extend the sample code as necessary for your requirements.

## Video Introduction

Here's a short (11m41s) video that explains and demonstrates the solution:

[![Solution Intro on YouTube](https://img.youtube.com/vi/hY54Zy-l6hc/0.jpg)](https://www.youtube.com/watch?v=hY54Zy-l6hc)

## Self-paced Workshop

The self-paced workshop (expected duration: 60 min.) will walk you through all the steps to set up and use this solution: [Implement Passwordless authentication with Amazon Cognito and WebAuthn](https://catalog.workshops.aws/cognito-webauthn-passwordless/en-US)

## FIDO2 / WebAuthn

This solution includes components that implement FIDO2 authentication, i.e. sign with Face, Touch, YubiKey, etc. This includes support for Passkeys:

![FIDO2 AWS Architecture](./drawings/fido2.png)

Included sample React component, for adding/changing/deleting authenticators:

<img src="./drawings/fido2-authenticators-screenshot.png" alt="FIDO2 credentials" width="500px" />

For more details, see [FIDO2](./FIDO2.md)

## Magic Link Sign In

This solution includes components to support signing-in with a Magic Link:

![Magic Link Architecture](./drawings/magic-link.png)

Example e-mail:

<img src="./drawings/magic-link-screenshot.png" alt="Magic Link example" width="300px" style="border: 2px solid lightgray;" />

For more details, see [Magic Links](./MAGIC-LINKS.md)

## SMS based Step-Up auth

This solution includes components to support step-up auth, using SMS One-Time-Password (OTP):

![SMS OTP Step Up AWS Architecture](./drawings/sms-otp-stepup.png)

Example SMS:

<img src="./drawings/sms-otp-stepup-screenshot.png" alt="SMS OTP code" width="300px" />

For more details, see [SMS OTP Step up](./SMS-OTP-STEPUP.md)

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Basic Usage](#basic-usage)
- [React](#react)
- [Features](#features)
- [Security](#security)
- [Usage with AWS Amplify](#usage-with-aws-amplify)
- [Usage in (plain) Web](#usage-in-plain-web)
- [Usage in React](#usage-in-react)
- [Usage in React Native](#usage-in-react-native)
- [FAQ - Frequently Asked Questions](#faq---frequently-asked-questions)
- [License](#license)

## Installation

We've wrapped the sample code in a NPM package for convenient installation and use:

```shell
npm install amazon-cognito-passwordless-auth
```

<details>
  <summary>If you run into ERESOLVE error</summary>
  <blockquote>
If you get the error `ERESOLVE unable to resolve dependency tree` while installing, this may mean that your current AWS CDK project uses an older version of `aws-cdk-lib` than the latest available. This may lead to issues with installing the latest versions of the alpha API Gateway constructs, that are pinned to the latest CDK version.

Options to work around:

1. update `aws-cdk-lib` first: `npm i aws-cdk-lib@latest constructs@latest`
1. install with the `--force` flag: `npm install amazon-cognito-passwordless-auth --force`
1. install the correct matching API Gateway construct versions first, see below.

```shell
# Install matching API Gateway construct versions
# Say you have version 2.83.1 of aws-cdk-lib, then:
npm install @aws-cdk/aws-apigatewayv2-alpha@2.83.1-alpha.0
npm install @aws-cdk/aws-apigatewayv2-authorizers-alpha@2.83.1-alpha.0
npm install @aws-cdk/aws-apigatewayv2-integrations-alpha@2.83.1-alpha.0

# now this works
npm install amazon-cognito-passwordless-auth
```

  </blockquote>
</details>

## Getting Started

To play around with the solution, you can deploy the [end-to-end example](./end-to-end-example/) into your own AWS account. You can run the accompanying front end locally, and sign-in with magic links and FIDO2 (WebAuthn), and try SMS OTP Step Up authentication.

For FIDO2 (WebAuthn) and Magic Links, the self-paced workshop (expected duration: 60 min.) provides a guided experience. It will walk you through all the steps to set up and use this solution: [Implement Passwordless authentication with Amazon Cognito and WebAuthn](https://catalog.workshops.aws/cognito-webauthn-passwordless/en-US)

## Basic Usage

First, deploy a CDK stack and instantiate the `Passwordless` construct:

```typescript
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Passwordless } from "amazon-cognito-passwordless-auth/cdk";

class SampleTestStack extends cdk.Stack {
  constructor(scope?: Construct, id?: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const passwordless = new Passwordless(this, "Passwordless", {
      allowedOrigins: [
        "http://localhost:5173", // Mention all URLs you're exposing the web app on
      ],
      magicLink: {
        sesFromAddress: "no-reply@auth.example.com", // must be a verified domain or identity in Amazon SES
      },
      fido2: {
        allowedRelyingPartyIds: [
          "localhost", // Domain names that you wish to use as RP ID
        ],
      },
      smsOtpStepUp: {}, // leave this out to disable SMS OTP Step Up Auth. Likewise for magicLink and fido2
    });

    new cdk.CfnOutput(this, "ClientId", {
      value: passwordless.userPoolClients!.at(0)!.userPoolClientId,
    });
    new cdk.CfnOutput(this, "Fido2Url", {
      value: passwordless.fido2Api!.url!,
    });
  }
}
```

Then, in your web app's entrypoint (e.g. `main.tsx`):

```typescript
import { Passwordless } from "amazon-cognito-passwordless-auth";

Passwordless.configure({
  cognitoIdpEndpoint:
    "<AWS region where the CDK stack was deployed to, e.g. eu-west-1>",
  clientId:
    "<Cognito User Pool Client ID, one of the outputs of the CDK stack>",
  fido2: {
    baseUrl:
      "<The base URL to the FIDO2 API, one of the outputs of the CDK stack>",
  },
  debug: console.debug, // Optional: adds logging
});
```

Now you're ready to use the library! E.g. in your web app you can do:

```typescript
import {
  authenticateWithFido2,
  fido2CreateCredential,
} from "amazon-cognito-passwordless-auth/fido2";

// Register a new credential (e.g. Face ID / Touch) for use with this Relying Party
const { credentialId } = await fido2CreateCredential({
  friendlyName: "My iPhone",
});

// Initiate FIDO2 authentication
const { signedIn, abort } = authenticateWithFido2({ username: "alice" });

const { idToken, accessToken, refreshToken } = await signedIn;
```

## React

For React we recommend you use the Passwordless hook for all your interactions with the library. E.g. the hook tracks the sign-in status (`signInStatus`) and gives easy access to the user's JWTs (`tokens`, `tokensParsed`).

To use the React hook, first wrap your app with the Passwordless context provider in your app's entrypoint (e.g. `main.tsx`):

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

Then, inside your components, use the Passwordless hook:

```typescript
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";

function MyComponent() {
  const { tokensParsed, authenticateWithFido2, signInStatus, lastError, busy } =
    usePasswordless();

  if (signInStatus === "NOT_SIGNED_IN" || signInStatus === "SIGNING_IN") {
    return (
      <>
        <form
          onSubmit={(event) => {
            authenticateWithFido2({
              username: event.currentTarget.username.value,
            });
            event.preventDefault();
          }}
        >
          <input
            type="text"
            placeholder="username"
            name="username"
            disabled={busy}
          />
          <input type="submit" disabled={busy} />
        </form>
        {lastError && <p>{lastError.message}</p>}
      </>
    );
  }

  if (signInStatus !== "SIGNED_IN") {
    return <p>One moment please ...</p>;
  }

  return <p>Welcome, {tokensParsed?.idToken["cognito:username"]}!</p>;
}
```

This solution also includes sample React components, e.g. a prefab sample sign-in page. See examples and documentation here: [README-REACT.md](./client/react/README-REACT.md)

## Features

This library includes:

- A **CDK** construct that deploys an **Amazon Cognito User Pool** with Custom Authorization configured to support the passwordless authentication flows (includes other AWS Services needed, notably **DynamoDB** and **HTTP API**).
- **Web** functions to use in your Web Apps, to help implement the corresponding front-end.
- **React** and **React Native** **hooks**, to make it even easier to use passwordless authentication in React and React Native.
- **React** prebuilt **components** that you can drop into your webapp to get started with something that works quickly, as a basis for further development.

Other noteworthy features:

- This library is built from the ground up in **plain TypeScript** and has **very few dependencies** besides `aws-sdk` and `aws-cdk-lib`. Most batteries are included:
  - The **Magic Link** back-end implementation has no dependencies
  - The **FIDO2** back-end implementation only depends on `cbor`
  - The **SMS Step-Up Auth** back-end implementation only depends on `aws-jwt-verify`
  - The (plain) **Web client** implementation has no dependencies
  - The **React** Web client implementation only has a peer dependency on `react` itself
  - The **React Native** client implementation only depends on `react-native-passkey`
- This library is **fully compatible** with **AWS Amplify** (JS library, `aws-amplify`), however it does **_not_** require AWS Amplify. If you just need Auth, this library should be all you need, but you can use AWS Amplify at the same time for any other features (and even for Auth too, as they can co-operate). See [Usage with AWS Amplify](#usage-with-aws-amplify).
- The custom authentication implementations are also exported as separate functions, so you can **reuse** the code, **configure** them and **tailor** them in your own Custom Auth Functions. For example, you can use a custom JavaScript function to generate the HTML and Text contents of the e-mail with the Magic Links.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

### Keep Dependencies Up-to-date

This sample solution defines several peer dependencies that you must install yourself (e.g. AWS CDK, React). You must make sure to keep these dependencies updated, to account for any security issues that may be found (and solved) for these dependencies.

### Token (JWT) Storage

By default, `localStorage` is used to store tokens (JWTs). This is similar to how e.g. AmplifyJS does it, and is [subject to the same concerns](https://github.com/aws-amplify/amplify-js/issues/3436). You may want to store tokens elsewhere, perhaps in memory only. You can do so by configuring a custom storage class, e.g.:

```javascript
import { Passwordless } from "amazon-cognito-passwordless-auth";

class MemoryStorage {
  constructor() {
    this.memory = new Map();
  }
  getItem(key) {
    return this.memory.get(key);
  }
  setItem(key, value) {
    this.memory.set(key, value);
  }
  removeItem(key) {
    this.memory.delete(key);
  }
}

Passwordless.configure({
  ..., // other config
  storage: new MemoryStorage(),
});
```

### Other Security Best Practices

This sample solution is secure by default. However, you should consider matching the security posture to your requirements, that might be stricter than the defaults:

- [Enable KMS encryption on DynamoDB tables](https://aws.amazon.com/blogs/database/bring-your-own-encryption-keys-to-amazon-dynamodb/) (default: uses DynamoDB default encryption)
- [Set CloudWatch log retention](https://docs.aws.amazon.com/managedservices/latest/userguide/log-customize-retention.html) in accordance to your requirements (default: logs never expire)

## Usage with AWS Amplify

This library by default uses the same token storage as Amplify uses by default, and thus is able to co-exist and co-operate with Amplify. That means that you can use this library to manage authentication, and use Amplify for other operations (e.g. Storage, PubSub).

After the user signed-in with this library, Amplify will recognize that sign-in as if it had managed the sign-in itself.

If you're using Amplify and this library together, you can use the following convenience methods to configure this library from Amplify configuration:

```typescript
import { Passwordless } from "amazon-cognito-passwordless-auth";
import { Amplify } from "aws-amplify";

// Configure Amplify:
Amplify.configure({
  ...
})

// Next, configure Passwordless from Amplify:
Passwordless.configureFromAmplify(Amplify.configure());

// Or, to be able able to provide additional Passwordless configuration, do:
Passwordless.configureFromAmplify(Amplify.configure()).with({
  fido2: {
    baseUrl: "...",
  },
});
```

## Usage in (plain) Web

See [README.md](./client/README.md)

## Usage in React

See [README-REACT.md](./client/react/README-REACT.md)

## Usage in React Native

See [README-REACT-NATIVE.md](./client/react/README-REACT-NATIVE.md)

## FAQ - Frequently Asked Questions

### Who created this library?

The AWS Industries Prototyping team. We created this library initially to use in our own prototypes, that we build for customers. We thought it would benefit many customers, so we decided to spend the effort to open-source it.

Since we use this library ourselves, we'll probably keep it up-to-date and evolve it further. That being said, we consider this **_sample code_**: if you use it, be prepared to own your own fork of it.

### Why is this on `aws-samples`, and not `awslabs`?

Having this repository be on `aws-samples` communicates most clearly that it is sample code. Users may run it as-is, but should be prepared to "own" it themselves.

We are considering to move it to `awslabs` in the future (which is why we released this under `Apache-2.0` license, instead of `MIT-0` which is common on `aws-samples`).

### How have you tested the security posture of this solution?

If you use this solution, YOU must review it and be your own judge of its security posture.

Having said that, you should know that this solution was written by Amazon Cognito experts from AWS. We have run it through multiple internal reviews. We've used it for several of our projects. Amazon's application security team has reviewed and pentested it.

### Can you also support other Infrastructure as Code tools than CDK?

This is currently out of scope, to keep maintenance effort manageable. However we'd like to track such requests: leave us a GitHub issue.

### Can you also support other Client technologies such as VueJS, Angular, Ionic, etc?

This is currently out of scope, to keep maintenance effort manageable. However we'd like to track such requests: leave us a GitHub issue.

### Can you also support other languages than JavaScript / TypeScript?

This is currently out of scope, to keep maintenance effort manageable. However we'd like to track such requests: leave us a GitHub issue.

## License

This project is licensed under the Apache-2.0 License.
