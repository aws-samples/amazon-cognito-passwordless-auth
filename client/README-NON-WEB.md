# Usage in JavaScript runtimes other than Web (e.g. in Node.js)

You can use this library also in JavaScript runtimes other than Web, for example in Node.js. In that case make sure you provide alternative implementations of some global variables that come out-of-the-box in web. Also, if you're running server-side you might want to use a client secret:

```javascript
import { Passwordless } from "amazon-cognito-passwordless-auth";

Passwordless.configure({
  ...otherConfig,
  clientSecret: "secret", // User Pool Client secret
  storage: YourStorageImplementation, // Custom storage implementation––if not provided and localStorage is undefined then MemoryStorage is used
  fetch: YourFetchImplementation, // Custom fetch implementation
  crypto: YourCryptoImplementation, // Custom crypto implementation
  location: YourLocationImplementation, // Custom location implementation
  history: YourHistoryImplementation, // Custom history implementation
});
```

After that, you can use the library as you would in Web. See [./README.md](./README.md)

You do not need to provide these implementations in all cases, so it's easiest while developing to try to use the library as you would and see if you run into a `UndefinedGlobalVariableError` and then implement that particular global. Also, you don't need to provide the full implementation of the global as exists in Web, just the pieces that this library needs: to figure out what those are it's best to check the typings in the [source code of the configure function](./config.ts).

## Examples

This works in Node.js 18 and above (but in Node.js 20 you don't need to do this as crypto has become a global, as in Web):

```typescript
import { Passwordless } from "amazon-cognito-passwordless-auth";
import { authenticateWithSRP } from "amazon-cognito-passwordless-auth/srp";
import { webcrypto } from "node:crypto";

Passwordless.configure({
  clientId: "<your client id>",
  userPoolId: "<your pool>",
  cognitoIdpEndpoint: "<your region>",
  crypto: webcrypto, // override crypto
});

const { signedIn } = authenticateWithSRP({
  username: "johndoe@example.com",
  password: "OpenSesame",
});

const tokens = await signedIn;

console.log(tokens);
```

And this:

```typescript
import { Passwordless } from "amazon-cognito-passwordless-auth";
import { signInWithLink } from "amazon-cognito-passwordless-auth/magic-link";

Passwordless.configure({
  clientId: "<your client id>",
  cognitoIdpEndpoint: "<your region>",
  // override location, let's pretend the current href is the magic link:
  location: {
    href: "https://abcdefghijk.cloudfront.net/#eyactualmagiclinkyrqfhahsv89grhz9rghrzhbvzxcvcbhzdrt4ut9qg...",
    hostname: "abcdefghijk.cloudfront.net",
  },
  // override history, mock implementation:
  history: {
    pushState: () => {},
  },
});

const { signedIn } = signInWithLink();

const tokens = await signedIn;

console.log(tokens);
```

Same example but more fancy:

```typescript
import { Passwordless } from "amazon-cognito-passwordless-auth";
import {
  MinimalLocation,
  MinimalHistory,
} from "amazon-cognito-passwordless-auth/config";
import { signInWithLink } from "amazon-cognito-passwordless-auth/magic-link";

class CustomLocation implements MinimalLocation {
  /**
   * Implement a mechanism in Node.js to acquire and provide the magic link:
   */
  get href() {
    return "https://abcdefghijk.cloudfront.net/#eyactualmagiclinkyrqfhahsv89grhz9rghrzhbvzxcvcbhzdrt4ut9qg...";
  }
  /**
   * Implement a mechanism in Node.js to provide the hostname (used as default RP ID in FIDO2, unless configured itself):
   */
  get hostname() {
    return "abcdefghijk.cloudfront.net";
  }
}

class CustomHistory implements MinimalHistory {
  /**
   * Implement a mechanism in Node.js to change the current URL (probably not applicable in CLI scripts!)
   */
  pushState() {}
}

Passwordless.configure({
  clientId: "<your client id>",
  cognitoIdpEndpoint: "<your region>",
  // override location
  location: new CustomLocation(),
  // override history
  history: new CustomHistory(),
});

const { signedIn } = signInWithLink();

const tokens = await signedIn;

console.log(tokens);
```
