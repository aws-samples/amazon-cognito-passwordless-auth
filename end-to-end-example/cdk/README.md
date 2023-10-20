## End-to-end Example - Back End

This is a sample CDK stack that you can deploy to play around with this library. After you've deployed this stack, you can use the accompanying [front end](../client/), to sign in with magic links and FIDO2 (Face ID / Touch).

Prerequisites:

1. You have cloned this repository
1. You have NodeJS installed
1. To be able to send Magic Links and FIDO2 notifications, you must have at least 1 verified e-mail address in Amazon SES. This e-mail address will be used as the FROM-address for the magic links and FIDO2 notifications. If you don't have a verified e-mail address in Amazon SES, create one now.
1. To send Magic Links to e-mail addresses that you didn't explicitly verify, you need to verify the SES domain. Alternatively, verify each e-mail address in Amazon SES explicitly.

Steps to deploy:

1. Switch to directory containing this README (end-to-end-example/cdk)
1. Copy file `.env` to `.env.local` and then edit `.env.local` and
   - enter the e-mail adress you want to send the Magic Links from.
   - define a stack name that is unique to your AWS environment
1. Run `npm install`
1. Bootstrap CDK with `npx cdk bootstrap`
1. Deploy the stack `npx cdk deploy`
1. After deploying, open the AWS console and navigate to the Cognito User Pool that's created for you, and create some test users to login with (and if you didn't verify the SES domain, make sure to verify each user's e-mail address in Amazon SES too)

Now, go and deploy the [test front end](../client/).

### Security

This end-to-end example is intended for testing and experimenting. If you want to run something like this in production, be mindful of the following:

- [Use Custom Domains](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html) for CloudFront so [you can enforce TLS 1.2](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/secure-connections-supported-viewer-protocols-ciphers.html) (the sample end-to-end example includes a CloudFront distribution––without a custom domain)
- [Enable CloudFront access logging](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/AccessLogs.html) (the sample end-to-end example includes a CloudFront distribution––without access logging)
- [Add AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/cloudfront-features.html) to the CloudFront distribution (the sample end-to-end example includes a CloudFront distribution––without WAF)
- [Add Geo restrictions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/georestrictions.html) to the CloudFront distribution (the sample end-to-end example includes a CloudFront distribution––without Geo restrictions)
- [Enable S3 Bucket Server Access Logs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html) (the sample end-to-end example includes an S3 bucket––without access logging)
