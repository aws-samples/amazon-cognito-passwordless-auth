# Usage in (plain) Web

> **_Oops:_** These docs are pretty incomplete and don't explain how to sign in yet :( For now, the best we have are some useful comments in this issue: https://github.com/aws-samples/amazon-cognito-passwordless-auth/issues/1

### Configuration

To use the library, you need to first configure it:

```javascript
import { Passwordless } from "amazon-cognito-passwordless-auth/react";

Passwordless.configure({
  cognitoIdpEndpoint: "eu-west-1", // you can also use the full endpoint URL, potentially to use a proxy
  clientId: "<client id>",
  // optional, only required if you want to use FIDO2:
  fido2: {
    baseUrl: "<fido2 base url>",
    /**
     * all other FIDO2 config is optional, values below are examples only to illustrate what you might configure.
     * (this client side config is essentially an override, that's merged on top of the config received from the backend)
     */
    authenticatorSelection: {
      userVerification: "required",
      requireResidentKey: true,
      residentKey: "preferred",
      authenticatorAttachment: "platform",
    },
    rp: {
      id: "example.com",
      name: "Example",
    },
    attestation: "direct",
    extensions: {
      appid: "u2f.example.com",
      credProps: true,
      hmacCreateSecret: true,
    },
    timeout: 120000,
  },
  userPoolId: "<user pool id>", // optional, only required if you want to use USER_SRP_AUTH
  // optional, additional headers that will be sent with each request to Cognito:
  proxyApiHeaders: {
    "<header 1>": "<value 1>",
    "<header 2>": "<value 2>",
  },
  storage: localStorage, // Optional, default to localStorage
});
```

### Sign Up

If your User Pool is enabled for self sign-up, users can sign up like so:

```javascript
import { signUp } from "amazon-cognito-passwordless-auth/cognito-api";

export default function YourComponent() {
  // Sample form that allows the user to sign up
  return (
    <form
      onSubmit={(event) => {
        signUp({
          username: event.currentTarget.username.value,
          password: event.currentTarget.password.value,
          // userAttributes are optional and you can pass any Cognito User pool attributes
          // Read more: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html
          userAttributes: [
            {
              name: "name",
              value: event.currentTarget.name.value,
            },
          ],
        });
        event.preventDefault();
      }}
    >
      <input type="text" placeholder="Username" name="username" />
      <input type="password" placeholder="Password" name="password" />
      <input type="text" placeholder="Your name" name="name" />
      <input type="submit" value="Sign up" />
    </form>
  );
}
```

### Update Cognito User Attributes

To update your Cognito User Attributes you can use the `updateUserAttributes` function:

```javascript
import { updateUserAttributes } from "amazon-cognito-passwordless-auth/cognito-api";

await updateUserAttributes({
  userAttributes: [
    {
      name: "name",
      value: "YOUR NEW NAME",
    },
  ],
});
```

### Send the user attribute verification code

To receive a code via email or SMS to verify the `email` or `phone_number` respectively, use the `getUserAttributeVerificationCode` function:

```javascript
import { getUserAttributeVerificationCode } from "amazon-cognito-passwordless-auth/cognito-api";

await getUserAttributeVerificationCode({
  attributeName: "email",
});
await getUserAttributeVerificationCode({
  attributeName: "phone_number",
});
```

### Verify Cognito User Attribute

To verify `email` or `phone_number` attributes, use the `verifyUserAttribute` function

```javascript
import { verifyUserAttribute } from "amazon-cognito-passwordless-auth/cognito-api";

await verifyUserAttribute({
  attributeName: "phone_number",
  code: "123456",
});
```

### Helpers

**timeAgo(now: number, from: Date)**

A helper function that returns a human friendly string indicating how much time passed from the `from` Date to the `now` timestamp

```javascript
import { timeAgo } from "amazon-cognito-passwordless-auth/util";

const now = timeAgo(Date.now(), new Date()); // Just now
const seconds = timeAgo(Date.now(), new Date(Date.now() - 30 * 1000)); // 30 seconds ago
const hours = timeAgo(Date.now(), newDate(Date.now() - 2 * 3600 * 1000)); // 2 hours ago
```
