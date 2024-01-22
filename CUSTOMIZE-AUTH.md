# Customize Auth

This solution uses [Custom authentication challenge Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html) to implement passwordless authentication for your Amazon Cognito User Pool.

You can override many pieces of configuration by specifying the right property values while instantiating the `Passwordless` CDK construct. At some point you'll probably need to go further and customize the Lambda triggers, e.g. to achieve one of the following:

- Use your own template for magic link e-mails
- Use another e-mail provider than Amazon SES for sending magic link e-mails
- Use your own template for One-Time-Password (OTP) SMS messages
- Use custom FIDO2 challenges, to e.g. implement transaction signing.

In such cases you can still use the Lambda function code from this solution: the custom auth implementations (FIDO2, Magic Links, SMS OTP) have a `configure()` method that you can use to add pieces of your own logic. Here's how that works, there's 2 steps to it:

### 1. Create your own Lambda function logic, using this library, and call `configure()`

As an example, suppose you want to use your own template for magic link e-mails. In that case you can override the `contentCreator` config like so:

```typescript
import { magicLink } from "amazon-cognito-passwordless-auth/custom-auth";

// Export the solution's handler to be the handler of YOUR Lambda function too:
export { createAuthChallengeHandler as handler } from "amazon-cognito-passwordless-auth/custom-auth";

// Calling configure() without arguments retrieves the current configuration:
const defaultConfig = magicLink.configure();

// Add your own logic:
magicLink.configure({
  async contentCreator({ secretLoginLink }) {
    return {
      html: {
        data: `<html><body><p>Your secret sign-in link: <a href="${secretLoginLink}">sign in</a></p>This link is valid for ${Math.floor(
          defaultConfig.secondsUntilExpiry / 60
        )} minutes<p></p></body></html>`,
        charSet: "UTF-8",
      },
      text: {
        data: `Your secret sign-in link: ${secretLoginLink}`,
        charSet: "UTF-8",
      },
      subject: {
        data: "Your secret sign-in link",
        charSet: "UTF-8",
      },
    };
  },
});
```

There is no need to create a Lambda function construct in this case. Next, the code above will be merged with `createAuthChallenge` function from this library.

### 2. Configure the Passwordless solution to use YOUR custom Lambda function logic

Use the `functionProps` parameter to add your own Lambda function code. The Lambda functions used by this solution are defined as [NodejsFunction](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.NodejsFunction.html) and you can override all of the properties that are used in their instantiation. The final properties will be the ones set by this solution, with the properties you specify in `functionProps` merged on top:

```typescript
const passwordless = new Passwordless(this, "Passwordless", {
  ...other,
  functionProps: {
    createAuthChallenge: {
      // Override entry, to point to your custom code:
      entry: join(__dirname, "create-auth-challenge/index.ts"),
      bundling: {
        // Solves `Dynamic require of "stream" is not supported"` error:
        banner:
          "import{createRequire}from 'module';const require=createRequire(import.meta.url);",
      },
    },
  },
});
```

The `createAuthChallenge` Lambda function deployed will contain this library logic and your custom logic.

## Supported Customizations

Best look at the definition of the `config` variable and the `configure()` function in the source code:

- Magic links: [cdk/custom-auth/magic-link.ts](cdk/custom-auth/magic-link.ts)
- FIDO2 (WebAuthn): [cdk/custom-auth/fido2.ts](cdk/custom-auth/fido2.ts)
- SMS OTP Step Up: [cdk/custom-auth/sms-otp-stepup.ts](cdk/custom-auth/sms-otp-stepup.ts)

Note: configuration sourced from environment variables (you'll see `process.env.SOME_KEY` in the source code) can be supplied while instantiating the `Passwordless` CDK construct, and don't require you to override the Lambda function used.

## Other examples

### Using another provider for sending e-mails than Amazon SES

Create your own Lambda function, use this library, and override the `emailSender` function:

```typescript
import { magicLink } from "amazon-cognito-passwordless-auth/custom-auth";
export { createAuthChallengeHandler as handler } from "amazon-cognito-passwordless-auth/custom-auth";
import sendEmail from "your-email-provider-sdk";

magicLink.configure({
  async emailSender({ emailAddress, content }) {
    return sendEmail({
      email: emailAddress,
      subject: content.subject.data,
      message: content.html.data,
    });
  },
});
```

Then, configure the Passwordless solution's CDK construct to use YOUR custom Lambda function, as decribed above.
