# Magic Links

This solution includes components to support signing-in with a Magic Link:

- **AWS Lambda functions** that implement the Amazon Cognito Custom Authentication flow, using **Amazon Simple E-Mail Service (SES)** to send the e-mails to users.
- For each Magic Link, cryptographic hashes are stored in an **Amazon DynamoDB** table, so that (1) we can ensure that a Magic Link can only be used once, (2) that a user can have maximally 1 unused Magic Link outstanding, and (3) that a user must wait minimally one minute before allowing him/her to request a new Magic Link. These cryptographic hashes cannot be traced to its corresponding user, except by our Lambda functions (who know the seed).
- Magic Links are signed using an **Amazon Key Management Service (KMS)** asymmetric key. Using AWS KMS (vs. storing and sending a cryptographically secure random string, i.e. an email-based OTP) allows us to store only non-sensitive data in DynamoDB, so access to the DynamoDB table doesn't allow signing in as specific users by taking OTPs from the table.
- Front End library functions, to work with this Custom Auth flow––can be used in Web, React, React Native.

<img src="./drawings/magic-link-screenshot.png" alt="Magic Link example" width="300px" style="border: 2px solid lightgray;" />

## Customizing Auth - e.g. to use your own e-mail template

If you want to do customization of this solution that goes beyond the parameters of the `Passwordless` construct, e.g. to use your own e-mail content for magic links, see [CUSTOMIZE-AUTH.md](./CUSTOMIZE-AUTH.md)

## AWS Architecture

![Magic Link Architecture](./drawings/magic-link.png)

## Request Magic Link

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant BJS as Browser JavaScript
    participant BLS as Browser Storage
    participant C as Cognito
    participant DA as DefineAuth
    participant CA as CreateAuthChallenge
    participant VA as VerifyAnswer
    participant KMS as AWS KMS
    participant SES as Amazon SES
    participant DDB as DynamoDB
    User->>BJS: Enter username + click sign-in
    activate User
    activate BJS
    BJS->>C: Initiate Auth (CUSTOM_AUTH)
    Activate C
    C->>DA: Invoke
    Activate DA
    DA->>C: Next: CUSTOM_CHALLENGE
    Deactivate DA
    C->>CA: Invoke
    Activate CA
    CA->>C: Challenge: PROVIDE_AUTH_PARAMETERS
    Deactivate CA
    C->>BJS: Session, Challenge
    Deactivate C
    BJS->>C: Respond to Auth Challenge: send link
    Activate C
    C->>VA: Invoke
    Activate VA
    VA->>C: null
    Deactivate VA
    C->>DA: Invoke
    Activate DA
    DA->>C: Next: CUSTOM_CHALLENGE
    Deactivate DA
    C->>CA: Invoke
    Activate CA
    CA->>DDB: Check prior magic link metadata
    Activate DDB
    DDB->>CA: issued-at or null
    Deactivate DDB
    CA->>CA: Check null, or issued-at is sufficiently old
    CA->>KMS: Sign message
    Activate KMS
    KMS->>CA: Signature
    Deactivate KMS
    CA->>DDB: Store magic link metadata
    Activate DDB
    DDB->>CA: OK
    Deactivate DDB
    CA->>SES: Invoke
    Activate SES
    SES->>User: Email with magic link
    SES->>CA: OK
    Deactivate SES
    CA->>C: Challenge: MAGIC_LINK
    Deactivate CA
    C->>BJS: Session, Challenge
    Deactivate C
    BJS->>BLS: Store Session
    Activate BLS
    BLS->>BJS: Ok
    Deactivate BLS
    BJS->>User: "We've emailed you a magic link"
    deactivate BJS
    deactivate User
```

## Complete Sign-in: same browser, new tab

```mermaid
sequenceDiagram
    actor User
    participant BJS as Browser JavaScript
    participant BLS as Browser Storage
    participant C as Cognito
    participant DA as DefineAuth
    participant VA as VerifyAnswer
    participant KMS as AWS KMS
    participant DDB as DynamoDB
    User->>BJS: Open magic link
    activate User
    activate BJS
    BJS->>BLS: Load session
    Activate BLS
    BLS->>BJS: Session
    Deactivate BLS
    BJS->>BLS: Delete session
    Activate BLS
    BLS->>BJS: Ok
    Deactivate BLS
    BJS->>C: Respond to Auth Challenge: secret hash
    Activate C
    C->>VA: Invoke
    Activate VA
    VA->>DDB: Delete magic-link metadata w/ condition
    Activate DDB
    DDB->>VA: Deleted record (w/ KMS Key ID), exception, or null
    Deactivate DDB
    VA->>KMS: Download public key
    Activate KMS
    KMS->>VA: Public key
    Deactivate KMS
    VA->>VA: Verify Signature
    VA->>VA: Check magic link username, expiry, issuedAt
    VA->>C: Answer correct
    Deactivate VA
    C->>DA: Invoke
    Activate DA
    DA->>C: Succeed Auth
    Deactivate DA
    C->>BJS: JWTs
    Deactivate C
    BJS->>BLS: Store JWTs
    Activate BLS
    BLS->>BJS: Ok
    Deactivate BLS
    BJS->>User: "You are signed in!"
    Deactivate User
    Deactivate BJS
```

## Complete Sign-in: different browser

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant BJS as Browser JavaScript
    participant BLS as Browser Storage
    participant C as Cognito
    participant DA as DefineAuth
    participant CA as CreateAuthChallenge
    participant VA as VerifyAnswer
    participant KMS as AWS KMS
    participant DDB as DynamoDB
    User->>BJS: Open magic link
    activate BJS
    activate User
    BJS->>BLS: Load session
    Activate BLS
    BLS->>BJS: null
    Deactivate BLS
    BJS->>C: Initiate Auth (CUSTOM_AUTH)
    Activate C
    C->>DA: Invoke
    Activate DA
    DA->>C: Next: CUSTOM_CHALLENGE
    Deactivate DA
    C->>CA: Invoke
    Activate CA
    CA->>C: Challenge: PROVIDE_AUTH_PARAMETERS
    Deactivate CA
    C->>BJS: Session, Challenge
    Deactivate C
    BJS->>C: Respond to Auth Challenge: secret hash
    Activate C
    C->>VA: Invoke
    Activate VA
    VA->>DDB: Delete magic-link metadata w/ condition
    Activate DDB
    DDB->>VA: Deleted record (w/ KMS Key ID), exception, or null
    Deactivate DDB
    VA->>KMS: Download public key
    Activate KMS
    KMS->>VA: Public key
    Deactivate KMS
    VA->>VA: Verify Signature
    VA->>VA: Check magic link username, expiry, issuedAt
    VA->>C: Answer correct
    Deactivate VA
    C->>DA: Invoke
    Activate DA
    DA->>C: Succeed Auth
    Deactivate DA
    C->>BJS: JWTs
    Deactivate C
    BJS->>BLS: Store JWTs
    Activate BLS
    BLS->>BJS: Ok
    Deactivate BLS
    BJS->>User: "You are signed in!"
    Deactivate User
    Deactivate BJS
```
