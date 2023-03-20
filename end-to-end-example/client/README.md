## End-to-end Example - Front End

This is a sample React application that you can run to play around with this library. It allows you to sign in with magic links and FIDO2 (Face ID / Touch).

Prerequisites:

1. You have NodeJS installed
1. You have deployed the [CDK Back End](../cdk)

Steps to run the web app locally:

1. Copy file `.env` to `.env.local` and then edit `.env.local` and enter all fields. View the right values to enter here, in the Back End's CDK stack outputs.
1. Make sure to install all dependencies: `npm install`
1. Run `npm run dev`
1. The web application runs at [http://localhost:5173/](http://localhost:5173/)

Steps to deploy the web app to S3 (served by CloudFront):

1. Execute: `./deploy-spa.cjs`
1. The CloudFront URL where your web app runs is in one of the Back End's CDK stack outputs: `SpaUrl`.
