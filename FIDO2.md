# FIDO2

This solution includes components that implement FIDO2 authentication, i.e. sign with Face, Touch, YubiKey, etc.:

- FIDO2 credentials are stored in an **Amazon DynamoDB** table, so that a virtual unlimited amount of credentials can be stored, with details such as: friendly name ("My iPhone"), last used date, how many times used, etc.
- **Amazon HTTP API** supports creating, updating and deleting FIDO2 credentials. This HTTP API is protected by a JWT authorizer, meaning you must already be signed-in via different means (e.g, using Magic Link) to register a FIDO2 credential.
- **AWS Lambda functions** that implement the Amazon Cognito Custom Authentication flow, reading FIDO2 credential public keys from the DynamoDB table.
- Front End library functions, to work with this Custom Auth flow––can be used in Web, React, React Native.
- Pre-built sample React component to add/update/delete authenticators.

<img src="./drawings/fido2-authenticators-screenshot.png" alt="FIDO2 credentials" width="500px" />

## FIDO2 Browser Support

FIDO2 (/WebAuthn) is still a relatively new standard and not all browsers support it to the fullest yet. Currently, we recommend to use Chrome, as it best supports FIDO2 in our experience.

Here are some issues in other browsers that we know of today:

- Mobile Safari on older iOS versions (seen on 16.0, no longer on 16.3) allows users to create multiple passkeys for the same username-website combination, whereby the older passkey is implicitly replaced by the newest. This can lead to confusion, as it's not possible for the FIDO2 backend of the solution here, to detect that the newer credential should replace the old one (as iOS did itself). Thus it simply stores the new credential without removing older ones. The user will then still see the older credentials in the credential list.
- Firefox support for WebAuthn is limited (seen on 102.8, said to be fixed in 109), e.g. doesn't support security keys with PIN, nor MacOS Touch.

## AWS Architecture

![FIDO2 AWS Architecture](./drawings/fido2.png)

## Registering new FIDO2 Authenticators

First you must sign-in with a magic link (or any other means). After that you can register a FIDO2 capable authenticator to log in with next time.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant BJS as Browser JavaScript
    participant BLS as Browser Storage
    participant BC as Browser WebAuthn core
    participant API as HTTP API+Lambda
    participant DB as DynamoDB
    BJS->>BLS: Query user FIDO2 enabled
    Activate BJS
    Activate BLS
    BLS->>BJS: null
    Deactivate BLS
    BJS->>User: Show enable-face-or-touch-login dialog
    Deactivate BJS
    Activate User
    User->>BJS: Click "Enable Face or Touch sign-in"
    Activate BJS
    BJS->>API: Start create-credential, include JWT (ID token)
    Activate API
    API->>API: Verify JWT
    API->>API: Generate random challenge
    API->>DB: Store challenge
    Activate DB
    DB->>API: OK
    Deactivate DB
    API->>BJS: Challenge and other FIDO2 options
    Deactivate API
    BJS->>BC: navigator.credentials.create()
    Activate BC
    BC->>User: Show register-authenticator native dialog
    User->>BC: Execute gesture (e.g. touch, face)
    BC->>BJS: FIDO2 public key response
    Deactivate BC
    BJS->>User: Show input-friendly-authenticator-name custom dialog
    User->>BJS: Friendly name
    BJS->>API: Complete create-credential
    Activate API
    API->>DB: Lookup challenge
    Activate DB
    DB->>API: Challenge
    Deactivate DB
    API->>API: Verify authenticator response
    API->>DB: Store credential
    Activate DB
    DB->>API: OK
    Deactivate DB
    API->>BJS: Credential metadata
    Deactivate API
    BJS->>BLS: Store FIDO2 enabled user
    Activate BLS
    BLS->>BJS: OK
    Deactivate BLS
    BJS->>User: "Authenticator activated successfully"
    Deactivate BJS
    Deactivate User
```

## Sign-in

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant BJS as Browser JavaScript
    participant BLS as Browser Storage
    participant BC as Browser WebAuthn core
    participant C as Cognito
    participant DA as DefineAuth
    participant CA as CreateAuthChallenge
    participant VA as VerifyAnswer
    participant DB as DynamoDB
    User->>BJS: Open web app
    Activate User
    Activate BJS
    BJS->>BLS: Query FIDO2 enabled users
    Activate BLS
    BLS->>BJS: FIDO2 Users
    Deactivate BLS
    BJS->>User: Show username sign-in buttons
    Deactivate BJS
    User->>BJS: Click "Sign-in as <username> with face or touch"
    Activate BJS
    BJS->>C: InitiateAuth
    Activate C
    C->>DA: Invoke
    Activate DA
    DA->>C: Custom challenge
    Deactivate DA
    C->>CA: Invoke
    Activate CA
    CA->>CA: Generate challenge
    CA->>DB: Query credential IDs
    Activate DB
    DB->>CA: Credential IDs
    Deactivate DB
    CA->>C: FIDO2 challenge, credential IDs, options
    Deactivate CA
    C->>BJS: FIDO2 challenge, credential IDs, options
    Deactivate C
    BJS->>BC: navigator.credentials.get()
    Activate BC
    BC->>User: Show sign-use-authenticator native dialog
    User->>BC: Execute gesture (e.g. touch, face)
    BC->>BJS: FIDO2 signature response
    Deactivate BC
    BJS->>C: RespondToAuthChallenge
    Activate C
    C->>VA: Invoke
    Activate VA
    VA->>VA: Verify client data
    VA->>DB: Get credential public key
    Activate DB
    DB->>VA: Credential public key
    Deactivate DB
    VA->>VA: Verify signature
    VA->>C: Answer correct: true
    Deactivate VA
    C->>DA: Invoke
    Activate DA
    DA->>C: Succeed Auth
    Deactivate DA
    C->> BJS: JWTs
    Deactivate C
    BJS->>BLS: Store JWTs
    Activate BLS
    BLS->>BJS: OK
    Deactivate BLS
    BJS->>User: "You are signed in"
    Deactivate BJS
    Deactivate User
```
