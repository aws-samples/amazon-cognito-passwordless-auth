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
import { View, StyleSheet, Text } from "react-native";

import {
  usePasswordless,
  Button,
  Styles,
} from "amazon-cognito-passwordless-auth";
import StepUpAuth from "./StepUpAuth";
import { useState } from "react";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#efefef",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
});

function AppComponent() {
  const {
    signOut,
    signInStatus,
    showAuthenticatorManager,
    toggleShowAuthenticatorManager,
    tokensParsed,
  } = usePasswordless();

  const [showStepUpAuth, setShowStepUpAuth] = useState(false);
  if (showStepUpAuth && signInStatus !== "SIGNED_IN") setShowStepUpAuth(false);

  return (
    <View style={styles.container}>
      <Text>This YOUR app</Text>
      <Text>Hi there {tokensParsed?.idToken.email}</Text>
      <Button
        outlined={true}
        onClick={() => {
          signOut();
        }}
      >
        <Text style={Styles.outlinedButtonText}>Sign out</Text>
      </Button>
      <Button
        onClick={() => toggleShowAuthenticatorManager()}
        disabled={showAuthenticatorManager}
      >
        <Text style={Styles.buttonText}>Manage authenticators</Text>
      </Button>
      {showStepUpAuth ? (
        <StepUpAuth />
      ) : (
        <Button onClick={() => setShowStepUpAuth(true)}>
          <Text style={Styles.buttonText}>Show Step Up Auth</Text>
        </Button>
      )}
    </View>
  );
}

export default AppComponent;
