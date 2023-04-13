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
import "./App.css";
import {
  usePasswordless,
  Passwordless,
} from "amazon-cognito-passwordless-auth/react";
import StepUpAuth from "./StepUpAuth";
import { useState } from "react";

function App() {
  const {
    signOut,
    signInStatus,
    showAuthenticatorManager,
    toggleShowAuthenticatorManager,
    tokensParsed,
  } = usePasswordless();

  const [showStepUpAuth, setShowStepUpAuth] = useState(false);
  if (showStepUpAuth && signInStatus !== "SIGNED_IN") setShowStepUpAuth(false);

  if (signInStatus === "REFRESHING_SIGN_IN" || signInStatus === "CHECKING") {
    return (
      <div className="app">
        <div>One moment please while we verify your sign-in status</div>
      </div>
    );
  }

  if (
    signInStatus === "NOT_SIGNED_IN" ||
    signInStatus === "SIGNING_IN" ||
    !tokensParsed
  ) {
    return <Passwordless brand={{
      /* REPLACE THE LINES BELOW WITH YOUR OWN BRAND ASSETS */
      backgroundImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Manhattan_in_the_distance_%28Unsplash%29.jpg/2880px-Manhattan_in_the_distance_%28Unsplash%29.jpg',
      customerName: 'Amazon Web Services',
      customerLogoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Amazon_Web_Services_Logo.svg/1280px-Amazon_Web_Services_Logo.svg.png'
    }}/>;
  }

  return (
    <div className="app">
      <div>This YOUR app</div>
      <div>Hi there {tokensParsed.idToken.email as string}</div>
      <button
        onClick={() => {
          signOut();
        }}
      >
        Sign out
      </button>
      <button
        onClick={() => toggleShowAuthenticatorManager()}
        disabled={showAuthenticatorManager}
      >
        Manage authenticators
      </button>
      {showStepUpAuth ? (
        <StepUpAuth />
      ) : (
        <button onClick={() => setShowStepUpAuth(true)}>
          Show Step Up Auth
        </button>
      )}
    </div>
  );
}

export default App;
