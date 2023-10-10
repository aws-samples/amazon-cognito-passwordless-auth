/**
 * Copyright Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */
import "./StepUpAuth.css";
import {
  usePasswordless,
  useLocalUserCache,
  useAwaitableState,
} from "amazon-cognito-passwordless-auth/react";
import { useEffect, useState } from "react";

function StepUpAuth() {
  const {
    signInStatus,
    tokensParsed,
    authenticateWithFido2,
    stepUpAuthenticationWithSmsOtp,
    busy,
    fido2Credentials,
  } = usePasswordless();
  const { currentUser } = useLocalUserCache();
  const [consentId, setConsentId] = useState<string>("");
  const [lastError, setLastError] = useState<Error>();
  const [stepUpAuthIdToken, setStepUpAuthIdToken] = useState("");
  const [smsOtpPhoneNumber, setSmsOtpPhoneNumber] = useState("");
  const [isWrongSmsOtp, setIsWrongSmsOtp] = useState<boolean>(false);
  const showSmsOtpInput = !!smsOtpPhoneNumber;
  const [smsOtp, setSmsOtp] = useState("");
  const {
    awaitable: awaitableSmsOtp,
    resolve: resolveSmsOtp,
    awaited: awaitedSmsOtp,
    reject: cancelWaitingForSmsOtp,
  } = useAwaitableState(smsOtp);

  function handleStepUpAuthentication(
    stepUpAuthFn: () => Promise<{ idToken: string }>
  ) {
    setLastError(undefined);
    setStepUpAuthIdToken("");
    stepUpAuthFn()
      .then(({ idToken }) => setStepUpAuthIdToken(idToken))
      .catch(setLastError);
  }

  useEffect(() => {
    if (signInStatus !== "SIGNED_IN") {
      setLastError(undefined);
      setConsentId("");
      setSmsOtpPhoneNumber("");
      setIsWrongSmsOtp(false);
      setStepUpAuthIdToken("");
    }
  }, [signInStatus]);

  if (!tokensParsed) return null;

  return (
    <div className="step-up-auth-main">
      <div className="step-up-auth-container">
        <div className="step-up-auth-title">Step up Authentication</div>
        <div>
          Enter a Consent ID. You can make one up,
          <br /> but let's pretend there's a transaction backend that generated
          it.
          <br /> (Also see:{" "}
          <a
            href="https://github.com/aws-samples/amazon-cognito-passwordless-auth/blob/main/SMS-OTP-STEPUP.md#step-up-authentication-with-sms-one-time-password"
            target="_blank"
            rel="noreferrer"
          >
            explanation of the step up procedure
          </a>
          )
        </div>
        <input
          type={"text"}
          placeholder={"Consent ID"}
          value={consentId}
          onChange={(e) => setConsentId(e.target.value)}
          disabled={busy}
          autoFocus
        ></input>
        <div>Next, initiate Step Up authentication. Choose either method:</div>
        <div className="step-up-auth-buttons">
          <button
            title={
              !fido2Credentials?.length
                ? "To use WebAuthn, first add face or touch unlock"
                : undefined
            }
            disabled={!fido2Credentials?.length || !consentId || busy}
            onClick={() =>
              handleStepUpAuthentication(
                () =>
                  authenticateWithFido2({
                    username: tokensParsed.idToken["cognito:username"],
                    credentials: currentUser?.credentials,
                    clientMetadata: { consent_id: consentId },
                  }).signedIn
              )
            }
          >
            WebAuthn
          </button>
          <button
            disabled={!consentId || busy}
            onClick={() => {
              setIsWrongSmsOtp(false);
              handleStepUpAuthentication(() =>
                stepUpAuthenticationWithSmsOtp({
                  username: tokensParsed.idToken["cognito:username"],
                  smsMfaCode: (phoneNumber: string, attempt: number) => {
                    setSmsOtpPhoneNumber(phoneNumber);
                    setIsWrongSmsOtp(attempt > 1);
                    return awaitableSmsOtp();
                  },
                  clientMetadata: { consent_id: consentId },
                }).signedIn.finally(() => {
                  setSmsOtp("");
                  setSmsOtpPhoneNumber("");
                })
              );
            }}
          >
            SMS OTP
          </button>
        </div>
        {showSmsOtpInput && (
          <>
            <div>Enter the OTP code we've sent to {smsOtpPhoneNumber}:</div>
            <form
              className="otp-form"
              onSubmit={(e) => {
                e.preventDefault();
                setIsWrongSmsOtp(false);
                resolveSmsOtp();
              }}
            >
              <input
                id="sms-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                placeholder="OTP code"
                autoFocus
                title="OTP Code: should be 6 numbers"
                value={smsOtp}
                onChange={(e) => setSmsOtp(e.target.value)}
                disabled={!!awaitedSmsOtp && !isWrongSmsOtp}
                maxLength={6}
              ></input>
              <button
                type="submit"
                disabled={
                  smsOtp.length < 6 || (!!awaitedSmsOtp && !isWrongSmsOtp)
                }
              >
                Submit
              </button>
              <button
                disabled={!!awaitedSmsOtp && !isWrongSmsOtp}
                type="button"
                onClick={() =>
                  cancelWaitingForSmsOtp(
                    new Error("SMS OTP step up authentication cancelled")
                  )
                }
              >
                Cancel
              </button>
            </form>
          </>
        )}
        {stepUpAuthIdToken && (
          <div>
            <div>
              Good job, you stepped up authentication.
              <br />
              Your Consent ID was added to your ID-token:{" "}
              <a
                href={`https://jwtinspector.kevhak.people.aws.dev/inspect#token=${stepUpAuthIdToken}&tab=payload`}
                target="_blank"
                rel="noreferrer"
              >
                view
              </a>
            </div>
          </div>
        )}
      </div>
      <div className="step-up-auth-error">
        {!lastError && awaitedSmsOtp && isWrongSmsOtp && (
          <div>That's not the right code</div>
        )}
        {lastError && <div>{lastError.message}</div>}
      </div>
    </div>
  );
}

export default StepUpAuth;
