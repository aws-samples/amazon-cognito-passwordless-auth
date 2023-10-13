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
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Device from "expo-device";
import { Passkey } from "react-native-passkey";
import { Styles as _Styles, Palette as _Palette } from "./styles.js";
import { useLocalUserCache } from "../react/hooks.js";
import { SvgXml } from "react-native-svg";
import { configure, usePasswordless } from "./index.js";

export const Styles = _Styles;
export const Palette = _Palette;

interface CustomBrand {
  backgroundImageUrl?: string;
  customerName?: string;
  customerLogoUrl?: string;
}

interface Styles {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void | Promise<void>;
  onClick?: () => void | Promise<void>;
  outlined?: boolean;
  disabled?: boolean;
  link?: boolean;
  style?: Styles;
}

export function Button({ children, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      {...props}
      onPress={props.onPress || props.onClick}
      style={[
        Styles.button,
        props.outlined ? Styles.outlinedButton : null,
        props.disabled ? Styles.disabled : null,
        props.outlined && props.disabled ? Styles.outlinedDisabled : null,
        props.link ? Styles.linkButton : null,
        props.style,
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}

export function Input(props: { style: Styles; verified?: boolean }) {
  return (
    <View>
      <TextInput
        placeholderTextColor={Palette.backgroundDark}
        {...props}
        style={[Styles.input, props.style]}
      />
      {props.verified ? (
        <View style={Styles.verifiedContainer}>
          <Text style={Styles.verifiedText}>✓</Text>
          <Text style={Styles.verifiedText}>✓</Text>
        </View>
      ) : null}
    </View>
  );
}
const FlexContainer = (props: {
  children: React.ReactNode;
  brand: CustomBrand;
}) => {
  return (
    <View style={Styles.passwordlessMainContainer}>
      {props.brand?.backgroundImageUrl && (
        <Image
          source={{ uri: props.brand.backgroundImageUrl }}
          style={Styles.passwordlessMainBackgroundImage}
        />
      )}
      <View style={Styles.passwordlessCardContainer}>
        {props.brand?.customerLogoUrl && (
          <Image
            source={{ uri: props.brand.customerLogoUrl }}
            style={Styles.passwordlessCustomerLogo}
            resizeMode="contain"
          />
        )}
        {props.brand?.customerName && (
          <Text
            style={[
              Styles.passwordlessTextCenter,
              Styles.passwordlessCustomerName,
            ]}
          >
            {props.brand.customerName}
          </Text>
        )}
        <View style={Styles.width}>{props.children}</View>
      </View>
    </View>
  );
};

export function Passwordless({
  brand,
  children,
}: {
  brand: CustomBrand;
  children: React.ReactNode;
}) {
  const {
    requestSignInLink,
    lastError,
    authenticateWithFido2,
    busy,
    signInStatus,
    signingInStatus,
    tokens,
  } = usePasswordless();

  const [newUsername, setNewUsername] = useState("");
  const [showSignInOptionsForUser, setShowSignInOptionsForUser] =
    useState("LAST_USER");
  const { lastSignedInUsers } = useLocalUserCache();
  const showFido2AuthOption = !!configure().fido2;

  function signInWithMagicLinkOrFido2(username: string) {
    if (showFido2AuthOption) {
      setShowSignInOptionsForUser("NEW_USER");
    } else {
      requestSignInLink({ username });
    }
  }

  if (signInStatus === "SIGNED_IN") {
    // reset state fields for entering new username
    if (newUsername) {
      setNewUsername("");
    }
    if (showSignInOptionsForUser !== "LAST_USER") {
      setShowSignInOptionsForUser("LAST_USER");
    }
  }

  if (signInStatus === "REFRESHING_SIGN_IN" && children) {
    return <>{children}</>;
  }

  if (
    signInStatus === "CHECKING" ||
    signInStatus === "REFRESHING_SIGN_IN" ||
    !lastSignedInUsers
  ) {
    return (
      <FlexContainer brand={brand}>
        <View
          style={[
            Styles.passwordlessFlexCenterCenter,
            Styles.passwordlessFlexColumn,
            Styles.passwordlessFlexGap,
          ]}
        >
          <ActivityIndicator />
          <Text>Checking your sign-in status...</Text>
        </View>
      </FlexContainer>
    );
  }

  if (signingInStatus === "SIGNING_IN_WITH_LINK") {
    return (
      <FlexContainer brand={brand}>
        <View
          style={[
            Styles.passwordlessFlexCenterCenter,
            Styles.passwordlessFlexColumn,
            Styles.passwordlessFlexGap,
          ]}
        >
          <ActivityIndicator />
          <Text>Checking the sign-in link...</Text>
        </View>
      </FlexContainer>
    );
  }

  if (signingInStatus === "SIGNING_OUT") {
    return (
      <FlexContainer brand={brand}>
        <View
          style={[
            Styles.passwordlessFlexCenterCenter,
            Styles.passwordlessFlexColumn,
            Styles.passwordlessFlexGap,
          ]}
        >
          <ActivityIndicator />
          <Text>Signing out, please wait...</Text>
        </View>
      </FlexContainer>
    );
  }

  if (signingInStatus === "SIGNIN_LINK_REQUESTED") {
    return (
      <FlexContainer brand={brand}>
        <View
          style={[
            Styles.passwordlessFlexCenterCenter,
            Styles.passwordlessFlexColumn,
            Styles.passwordlessFlexGap,
          ]}
        >
          <SvgXml
            xml={`
            <svg
              width="24px"
              height="20px"
              viewBox="0 0 24 20"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M1.8,17.4 L1.8,3.23906256 L12,13.4402345 L22.2,3.23906256 L22.2,17.5195313 L1.8,17.5195313 L1.8,17.4 Z M21,1.8 L12,10.8 L3,1.8 L21,1.8 Z M0,0 L0,19.2 L24,19.2 L24,0 L0,0 Z"></path>
            </svg>
          `}
          />
          <Text>Please check your email.</Text>
          <Text>We&apos;ve emailed you a secret sign-in link</Text>
        </View>
      </FlexContainer>
    );
  }

  if (signInStatus === "SIGNED_IN" && tokens) {
    return <>{children}</>;
  }

  const lastUser = lastSignedInUsers.at(0);
  const user: typeof lastUser =
    newUsername && showSignInOptionsForUser === "NEW_USER"
      ? {
          email: newUsername,
          username: newUsername,
          useFido:
            showFido2AuthOption && Passkey.isSupported()
              ? "YES" // Presume the user might want to use FIDO2
              : "NO",
        }
      : showSignInOptionsForUser === "LAST_USER"
      ? lastUser
      : undefined;

  return (
    <FlexContainer brand={brand}>
      {signInStatus === "NOT_SIGNED_IN" && user && (
        <View>
          <View style={Styles.passwordlessFlexGap}>
            <Text style={Styles.passwordlessEmailTitle}>{user.email}</Text>
            <View style={Styles.passwordlessFlexGap}>
              {showFido2AuthOption && user.useFido === "YES" && (
                <Button
                  onClick={() => {
                    authenticateWithFido2({
                      username: user.username,
                      credentials: user.credentials,
                    });
                  }}
                  disabled={busy}
                >
                  <View
                    style={[
                      Styles.passwordlessFlexCenterCenter,
                      Styles.passwordlessFlexGap,
                    ]}
                  >
                    <SvgXml
                      xml={`
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24px"
                        height="24px"
                        fill="${Styles.buttonText.color}"
                      >
                        <path d="M3.1,9.4 C3.03333333,9.36666667 3,9.3125 3,9.2375 C3,9.1625 3.01666667,9.09166667 3.05,9.025 C4.08333333,7.59166667 5.39166667,6.48333333 6.975,5.7 C8.55833333,4.91666667 10.25,4.525 12.05,4.525 C13.85,4.525 15.5458333,4.90833333 17.1375,5.675 C18.7291667,6.44166667 20.05,7.54166667 21.1,8.975 C21.15,9.05833333 21.1708333,9.125 21.1625,9.175 C21.1541667,9.225 21.125,9.275 21.075,9.325 C21.025,9.375 20.9625,9.4 20.8875,9.4 C20.8125,9.4 20.7416667,9.35833333 20.675,9.275 C19.6916667,7.90833333 18.4375,6.85833333 16.9125,6.125 C15.3875,5.39166667 13.7666667,5.025 12.05,5.025 C10.3333333,5.025 8.725,5.39583333 7.225,6.1375 C5.725,6.87916667 4.475,7.925 3.475,9.275 C3.40833333,9.35833333 3.34583333,9.40833333 3.2875,9.425 C3.22916667,9.44166667 3.16666667,9.43333333 3.1,9.4 Z M15.025,21.975 C13.3083333,21.5416667 11.8958333,20.6833333 10.7875,19.4 C9.67916667,18.1166667 9.125,16.5583333 9.125,14.725 C9.125,13.9416667 9.4125,13.2833333 9.9875,12.75 C10.5625,12.2166667 11.25,11.95 12.05,11.95 C12.85,11.95 13.5375,12.2166667 14.1125,12.75 C14.6875,13.2833333 14.975,13.9416667 14.975,14.725 C14.975,15.3583333 15.2208333,15.8916667 15.7125,16.325 C16.2041667,16.7583333 16.775,16.975 17.425,16.975 C18.0583333,16.975 18.6125,16.7583333 19.0875,16.325 C19.5625,15.8916667 19.8,15.3583333 19.8,14.725 C19.8,12.675 19.0375,10.9583333 17.5125,9.575 C15.9875,8.19166667 14.1666667,7.5 12.05,7.5 C9.93333333,7.5 8.1125,8.19166667 6.5875,9.575 C5.0625,10.9583333 4.3,12.675 4.3,14.725 C4.3,15.125 4.34583333,15.6458333 4.4375,16.2875 C4.52916667,16.9291667 4.725,17.6583333 5.025,18.475 C5.05833333,18.5583333 5.05833333,18.6208333 5.025,18.6625 C4.99166667,18.7041667 4.95,18.7416667 4.9,18.775 C4.83333333,18.8083333 4.7625,18.8166667 4.6875,18.8 C4.6125,18.7833333 4.55833333,18.7333333 4.525,18.65 C4.30833333,18.0166667 4.1375,17.3708333 4.0125,16.7125 C3.8875,16.0541667 3.825,15.3916667 3.825,14.725 C3.825,12.575 4.64166667,10.7375 6.275,9.2125 C7.90833333,7.6875 9.83333333,6.925 12.05,6.925 C14.3166667,6.925 16.2625,7.675 17.8875,9.175 C19.5125,10.675 20.325,12.525 20.325,14.725 C20.325,15.4916667 20.0416667,16.1416667 19.475,16.675 C18.9083333,17.2083333 18.225,17.475 17.425,17.475 C16.6083333,17.475 15.9083333,17.2083333 15.325,16.675 C14.7416667,16.1416667 14.45,15.4916667 14.45,14.725 C14.45,14.075 14.2125,13.5333333 13.7375,13.1 C13.2625,12.6666667 12.7,12.45 12.05,12.45 C11.4,12.45 10.8333333,12.6666667 10.35,13.1 C9.86666667,13.5333333 9.625,14.075 9.625,14.725 C9.625,16.4583333 10.15,17.9041667 11.2,19.0625 C12.25,20.2208333 13.5583333,21.0333333 15.125,21.5 C15.225,21.5333333 15.2875,21.575 15.3125,21.625 C15.3375,21.675 15.3416667,21.7333333 15.325,21.8 C15.3083333,21.8833333 15.275,21.9416667 15.225,21.975 C15.175,22.0083333 15.1083333,22.0083333 15.025,21.975 Z M6.2,3.975 C6.11666667,4.00833333 6.05416667,4.0125 6.0125,3.9875 C5.97083333,3.9625 5.93333333,3.925 5.9,3.875 C5.86666667,3.84166667 5.85,3.79166667 5.85,3.725 C5.85,3.65833333 5.875,3.60833333 5.925,3.575 C6.875,3.05833333 7.87083333,2.66666667 8.9125,2.4 C9.95416667,2.13333333 11,2 12.05,2 C13.1333333,2 14.1958333,2.13333333 15.2375,2.4 C16.2791667,2.66666667 17.275,3.04166667 18.225,3.525 C18.3083333,3.55833333 18.3541667,3.60833333 18.3625,3.675 C18.3708333,3.74166667 18.3583333,3.8 18.325,3.85 C18.2916667,3.9 18.2458333,3.94166667 18.1875,3.975 C18.1291667,4.00833333 18.0583333,4.00833333 17.975,3.975 C17.0583333,3.525 16.1,3.17083333 15.1,2.9125 C14.1,2.65416667 13.0833333,2.525 12.05,2.525 C11.0166667,2.525 10.0083333,2.64583333 9.025,2.8875 C8.04166667,3.12916667 7.1,3.49166667 6.2,3.975 L6.2,3.975 Z M9.55,21.7 C8.58333333,20.7 7.82916667,19.65 7.2875,18.55 C6.74583333,17.45 6.475,16.175 6.475,14.725 C6.475,13.2416667 7.02083333,11.9916667 8.1125,10.975 C9.20416667,9.95833333 10.5166667,9.45 12.05,9.45 C13.5833333,9.45 14.9041667,9.95833333 16.0125,10.975 C17.1208333,11.9916667 17.675,13.2416667 17.675,14.725 C17.675,14.8083333 17.6541667,14.8708333 17.6125,14.9125 C17.5708333,14.9541667 17.5083333,14.975 17.425,14.975 C17.3416667,14.975 17.275,14.9541667 17.225,14.9125 C17.175,14.8708333 17.15,14.8083333 17.15,14.725 C17.15,13.375 16.6458333,12.2416667 15.6375,11.325 C14.6291667,10.4083333 13.4333333,9.95 12.05,9.95 C10.6666667,9.95 9.47916667,10.4083333 8.4875,11.325 C7.49583333,12.2416667 7,13.375 7,14.725 C7,16.1416667 7.24583333,17.35 7.7375,18.35 C8.22916667,19.35 8.95833333,20.35 9.925,21.35 C9.99166667,21.4166667 10.0208333,21.4791667 10.0125,21.5375 C10.0041667,21.5958333 9.975,21.65 9.925,21.7 C9.89166667,21.7333333 9.8375,21.7625 9.7625,21.7875 C9.6875,21.8125 9.61666667,21.7833333 9.55,21.7 Z M17.2,19.875 C15.7333333,19.875 14.4625,19.3875 13.3875,18.4125 C12.3125,17.4375 11.775,16.2083333 11.775,14.725 C11.775,14.6416667 11.7958333,14.575 11.8375,14.525 C11.8791667,14.475 11.9416667,14.45 12.025,14.45 C12.1083333,14.45 12.1708333,14.475 12.2125,14.525 C12.2541667,14.575 12.275,14.6416667 12.275,14.725 C12.275,16.075 12.7708333,17.1875 13.7625,18.0625 C14.7541667,18.9375 15.9,19.375 17.2,19.375 C17.3333333,19.375 17.4916667,19.3666667 17.675,19.35 C17.8583333,19.3333333 18.0583333,19.3083333 18.275,19.275 C18.3583333,19.2583333 18.425,19.2708333 18.475,19.3125 C18.525,19.3541667 18.5583333,19.4 18.575,19.45 C18.5916667,19.5166667 18.5875,19.575 18.5625,19.625 C18.5375,19.675 18.4833333,19.7083333 18.4,19.725 C18.1,19.8083333 17.8375,19.8541667 17.6125,19.8625 C17.3875,19.8708333 17.25,19.875 17.2,19.875 Z"></path>
                      </svg>
                    `}
                    />
                    <Text
                      style={[
                        Styles.buttonText,
                        busy ? Styles.buttonTextDisabled : null,
                      ]}
                    >
                      Sign in with face or touch
                    </Text>
                  </View>
                </Button>
              )}
              <Button
                outlined={showFido2AuthOption && user.useFido === "YES"}
                onClick={() => {
                  requestSignInLink({ username: user.username });
                }}
                disabled={busy}
              >
                <View
                  style={[
                    Styles.passwordlessFlexCenterCenter,
                    Styles.passwordlessFlexGap,
                  ]}
                >
                  <SvgXml
                    xml={`
                    <svg width="24px" height="20px" fill="${Styles.outlinedButtonText.color}">
                      <path d="M1.8,17.4 L1.8,3.23906256 L12,13.4402345 L22.2,3.23906256 L22.2,17.5195313 L1.8,17.5195313 L1.8,17.4 Z M21,1.8 L12,10.8 L3,1.8 L21,1.8 Z M0,0 L0,19.2 L24,19.2 L24,0 L0,0 Z"></path>
                    </svg>

                  `}
                  />
                  <Text style={[Styles.buttonText, Styles.outlinedButtonText]}>
                    Sign in with magic link
                  </Text>
                </View>
              </Button>
            </View>
          </View>
          <Button
            link
            onClick={() => setShowSignInOptionsForUser("NEW_USER_ENTRY")}
          >
            <Text style={[Styles.linkButtonText]}>Sign in as another user</Text>
          </Button>
          {/*
          <View
            style={[Styles.passwordlessFlexJustifyEnd, Styles.passwordlessFlexColumn]}
          >
            <Text>
              Enter your e-mail address to sign in:
            </Text>
            <TextInput
              style={Styles.passwordlessEmailInput}
              value={newUsername}
              onChangeText={(value) => setNewUsername(value)}
              placeholder="E-mail"
              keyboardType="email-address"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              disabled={busy}
              autoFocus
            />
            <Button
              type="submit"
              disabled={busy || !newUsername?.match(/^\S+@\S+\.\S+$/)}
              onClick={() => signInWithMagicLinkOrFido2(newUsername)}
            >
              <Text style={[Styles.buttonText,  busy || !newUsername?.match(/^\S+@\S+\.\S+$/) ? Styles.buttonTextDisabled : null]}>Sign in</Text>
            </Button>
          </View>
          */}
        </View>
      )}
      {signInStatus === "NOT_SIGNED_IN" && !user && (
        <>
          {showFido2AuthOption && (
            <>
              <Button
                onClick={() => {
                  authenticateWithFido2({});
                }}
                disabled={busy}
              >
                <View
                  style={[
                    Styles.passwordlessFlexJustifyEnd,
                    Styles.passwordlessFlexGap,
                  ]}
                >
                  <SvgXml
                    xml={`
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24px"
                      height="24px"
                      fill="${
                        busy
                          ? Styles.buttonTextDisabled.color
                          : Styles.buttonText.color
                      }"
                    >
                      <path d="M3.1,9.4 C3.03333333,9.36666667 3,9.3125 3,9.2375 C3,9.1625 3.01666667,9.09166667 3.05,9.025 C4.08333333,7.59166667 5.39166667,6.48333333 6.975,5.7 C8.55833333,4.91666667 10.25,4.525 12.05,4.525 C13.85,4.525 15.5458333,4.90833333 17.1375,5.675 C18.7291667,6.44166667 20.05,7.54166667 21.1,8.975 C21.15,9.05833333 21.1708333,9.125 21.1625,9.175 C21.1541667,9.225 21.125,9.275 21.075,9.325 C21.025,9.375 20.9625,9.4 20.8875,9.4 C20.8125,9.4 20.7416667,9.35833333 20.675,9.275 C19.6916667,7.90833333 18.4375,6.85833333 16.9125,6.125 C15.3875,5.39166667 13.7666667,5.025 12.05,5.025 C10.3333333,5.025 8.725,5.39583333 7.225,6.1375 C5.725,6.87916667 4.475,7.925 3.475,9.275 C3.40833333,9.35833333 3.34583333,9.40833333 3.2875,9.425 C3.22916667,9.44166667 3.16666667,9.43333333 3.1,9.4 Z M15.025,21.975 C13.3083333,21.5416667 11.8958333,20.6833333 10.7875,19.4 C9.67916667,18.1166667 9.125,16.5583333 9.125,14.725 C9.125,13.9416667 9.4125,13.2833333 9.9875,12.75 C10.5625,12.2166667 11.25,11.95 12.05,11.95 C12.85,11.95 13.5375,12.2166667 14.1125,12.75 C14.6875,13.2833333 14.975,13.9416667 14.975,14.725 C14.975,15.3583333 15.2208333,15.8916667 15.7125,16.325 C16.2041667,16.7583333 16.775,16.975 17.425,16.975 C18.0583333,16.975 18.6125,16.7583333 19.0875,16.325 C19.5625,15.8916667 19.8,15.3583333 19.8,14.725 C19.8,12.675 19.0375,10.9583333 17.5125,9.575 C15.9875,8.19166667 14.1666667,7.5 12.05,7.5 C9.93333333,7.5 8.1125,8.19166667 6.5875,9.575 C5.0625,10.9583333 4.3,12.675 4.3,14.725 C4.3,15.125 4.34583333,15.6458333 4.4375,16.2875 C4.52916667,16.9291667 4.725,17.6583333 5.025,18.475 C5.05833333,18.5583333 5.05833333,18.6208333 5.025,18.6625 C4.99166667,18.7041667 4.95,18.7416667 4.9,18.775 C4.83333333,18.8083333 4.7625,18.8166667 4.6875,18.8 C4.6125,18.7833333 4.55833333,18.7333333 4.525,18.65 C4.30833333,18.0166667 4.1375,17.3708333 4.0125,16.7125 C3.8875,16.0541667 3.825,15.3916667 3.825,14.725 C3.825,12.575 4.64166667,10.7375 6.275,9.2125 C7.90833333,7.6875 9.83333333,6.925 12.05,6.925 C14.3166667,6.925 16.2625,7.675 17.8875,9.175 C19.5125,10.675 20.325,12.525 20.325,14.725 C20.325,15.4916667 20.0416667,16.1416667 19.475,16.675 C18.9083333,17.2083333 18.225,17.475 17.425,17.475 C16.6083333,17.475 15.9083333,17.2083333 15.325,16.675 C14.7416667,16.1416667 14.45,15.4916667 14.45,14.725 C14.45,14.075 14.2125,13.5333333 13.7375,13.1 C13.2625,12.6666667 12.7,12.45 12.05,12.45 C11.4,12.45 10.8333333,12.6666667 10.35,13.1 C9.86666667,13.5333333 9.625,14.075 9.625,14.725 C9.625,16.4583333 10.15,17.9041667 11.2,19.0625 C12.25,20.2208333 13.5583333,21.0333333 15.125,21.5 C15.225,21.5333333 15.2875,21.575 15.3125,21.625 C15.3375,21.675 15.3416667,21.7333333 15.325,21.8 C15.3083333,21.8833333 15.275,21.9416667 15.225,21.975 C15.175,22.0083333 15.1083333,22.0083333 15.025,21.975 Z M6.2,3.975 C6.11666667,4.00833333 6.05416667,4.0125 6.0125,3.9875 C5.97083333,3.9625 5.93333333,3.925 5.9,3.875 C5.86666667,3.84166667 5.85,3.79166667 5.85,3.725 C5.85,3.65833333 5.875,3.60833333 5.925,3.575 C6.875,3.05833333 7.87083333,2.66666667 8.9125,2.4 C9.95416667,2.13333333 11,2 12.05,2 C13.1333333,2 14.1958333,2.13333333 15.2375,2.4 C16.2791667,2.66666667 17.275,3.04166667 18.225,3.525 C18.3083333,3.55833333 18.3541667,3.60833333 18.3625,3.675 C18.3708333,3.74166667 18.3583333,3.8 18.325,3.85 C18.2916667,3.9 18.2458333,3.94166667 18.1875,3.975 C18.1291667,4.00833333 18.0583333,4.00833333 17.975,3.975 C17.0583333,3.525 16.1,3.17083333 15.1,2.9125 C14.1,2.65416667 13.0833333,2.525 12.05,2.525 C11.0166667,2.525 10.0083333,2.64583333 9.025,2.8875 C8.04166667,3.12916667 7.1,3.49166667 6.2,3.975 L6.2,3.975 Z M9.55,21.7 C8.58333333,20.7 7.82916667,19.65 7.2875,18.55 C6.74583333,17.45 6.475,16.175 6.475,14.725 C6.475,13.2416667 7.02083333,11.9916667 8.1125,10.975 C9.20416667,9.95833333 10.5166667,9.45 12.05,9.45 C13.5833333,9.45 14.9041667,9.95833333 16.0125,10.975 C17.1208333,11.9916667 17.675,13.2416667 17.675,14.725 C17.675,14.8083333 17.6541667,14.8708333 17.6125,14.9125 C17.5708333,14.9541667 17.5083333,14.975 17.425,14.975 C17.3416667,14.975 17.275,14.9541667 17.225,14.9125 C17.175,14.8708333 17.15,14.8083333 17.15,14.725 C17.15,13.375 16.6458333,12.2416667 15.6375,11.325 C14.6291667,10.4083333 13.4333333,9.95 12.05,9.95 C10.6666667,9.95 9.47916667,10.4083333 8.4875,11.325 C7.49583333,12.2416667 7,13.375 7,14.725 C7,16.1416667 7.24583333,17.35 7.7375,18.35 C8.22916667,19.35 8.95833333,20.35 9.925,21.35 C9.99166667,21.4166667 10.0208333,21.4791667 10.0125,21.5375 C10.0041667,21.5958333 9.975,21.65 9.925,21.7 C9.89166667,21.7333333 9.8375,21.7625 9.7625,21.7875 C9.6875,21.8125 9.61666667,21.7833333 9.55,21.7 Z M17.2,19.875 C15.7333333,19.875 14.4625,19.3875 13.3875,18.4125 C12.3125,17.4375 11.775,16.2083333 11.775,14.725 C11.775,14.6416667 11.7958333,14.575 11.8375,14.525 C11.8791667,14.475 11.9416667,14.45 12.025,14.45 C12.1083333,14.45 12.1708333,14.475 12.2125,14.525 C12.2541667,14.575 12.275,14.6416667 12.275,14.725 C12.275,16.075 12.7708333,17.1875 13.7625,18.0625 C14.7541667,18.9375 15.9,19.375 17.2,19.375 C17.3333333,19.375 17.4916667,19.3666667 17.675,19.35 C17.8583333,19.3333333 18.0583333,19.3083333 18.275,19.275 C18.3583333,19.2583333 18.425,19.2708333 18.475,19.3125 C18.525,19.3541667 18.5583333,19.4 18.575,19.45 C18.5916667,19.5166667 18.5875,19.575 18.5625,19.625 C18.5375,19.675 18.4833333,19.7083333 18.4,19.725 C18.1,19.8083333 17.8375,19.8541667 17.6125,19.8625 C17.3875,19.8708333 17.25,19.875 17.2,19.875 Z"></path>
                    </svg>
                  `}
                    height="100%"
                  />
                  <Text
                    style={[
                      Styles.buttonText,
                      busy ? Styles.buttonTextDisabled : null,
                    ]}
                  >
                    Sign in with passkey
                  </Text>
                </View>
              </Button>
              <View
                style={[Styles.passwordlessFlexCenterCenter, Styles.gapElement]}
              >
                <View style={Styles.passwordlessDivider} />
                <Text style={Styles.passwordlessBetweenLines}>or</Text>
                <View style={Styles.passwordlessDivider} />
              </View>
            </>
          )}
          <View>
            <Text>Enter your e-mail address to sign in:</Text>
            <TextInput
              style={Styles.passwordlessEmailInput}
              value={newUsername}
              onChangeText={(value) => setNewUsername(value)}
              placeholder="E-mail"
              keyboardType="email-address"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoFocus
            />
            <View style={Styles.passwordlessFlexJustifyEnd}>
              <Button
                disabled={busy || !newUsername?.match(/^\S+@\S+\.\S+$/)}
                onClick={() => signInWithMagicLinkOrFido2(newUsername)}
              >
                <View
                  style={[
                    Styles.passwordlessFlexJustifyEnd,
                    Styles.passwordlessFlexGap,
                  ]}
                >
                  <Text
                    style={[
                      Styles.buttonText,
                      busy || !newUsername?.match(/^\S+@\S+\.\S+$/)
                        ? Styles.buttonTextDisabled
                        : null,
                    ]}
                  >
                    Next
                  </Text>
                  <SvgXml
                    xml={`
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    height="18px"
                    width="18px"
                    fill="${
                      busy || !newUsername?.match(/^\S+@\S+\.\S+$/)
                        ? Styles.buttonTextDisabled.color
                        : Styles.buttonText.color
                    }"
                  >
                    <polygon
                      id="Path"
                      points="14.1015625 6.08091905 19.1386718 11.2357642 2 11.2357642 2 12.7642358 19.1386718 12.7642358 14.0996094 17.9190808 15.1582031 19 22 12.000999 15.1582031 5"
                    ></polygon>
                  </svg>

                `}
                    height="100%"
                  />
                </View>
              </Button>
            </View>
          </View>
        </>
      )}
      <View>
        {signingInStatus === "SIGNIN_LINK_EXPIRED" && (
          <View>
            <View>
              <Text>Authentication error.</Text>
              <Text>The sign-in link you tried to use is no longer valid</Text>
            </View>
          </View>
        )}
        {signingInStatus === "REQUESTING_SIGNIN_LINK" && (
          <View
            style={[
              Styles.passwordlessFlexCenterCenter,
              Styles.passwordlessFlexColumn,
            ]}
          >
            <ActivityIndicator />
            <Text style={Styles.passwordlessTextCenter}>
              Starting sign-in...
            </Text>
          </View>
        )}
        {signingInStatus === "STARTING_SIGN_IN_WITH_FIDO2" && (
          <View
            style={[
              Styles.passwordlessFlexCenterCenter,
              Styles.passwordlessFlexColumn,
            ]}
          >
            <ActivityIndicator />
            <Text style={Styles.passwordlessTextCenter}>
              Starting sign-in...
            </Text>
          </View>
        )}
        {signingInStatus === "COMPLETING_SIGN_IN_WITH_FIDO2" && (
          <View
            style={[
              Styles.passwordlessFlexCenterCenter,
              Styles.passwordlessFlexColumn,
            ]}
          >
            <ActivityIndicator />
            <Text>Completing your sign-in...</Text>
          </View>
        )}
        {lastError && (
          <Text style={Styles.passwordlessError}>{lastError.message}</Text>
        )}
      </View>
    </FlexContainer>
  );
}

function Fido2Recommendation() {
  const { fido2CreateCredential, showAuthenticatorManager, signInStatus } =
    usePasswordless();
  const { currentUser, updateFidoPreference } = useLocalUserCache();
  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState("IDLE");
  useEffect(() => {
    if (status !== "COMPLETED") return;
    const i = setTimeout(reset, 10000);
    return () => clearTimeout(i);
  }, [status]);
  const [friendlyName, setFriendlyName] = useState("");
  const mobileDeviceName = Device.deviceName;
  function reset() {
    setError(undefined);
    setStatus("IDLE");
    setFriendlyName("");
  }
  useEffect(() => {
    if (showAuthenticatorManager) {
      reset();
    }
  }, [showAuthenticatorManager]);
  if (showAuthenticatorManager) return null;
  const show =
    signInStatus === "SIGNED_IN" &&
    currentUser &&
    (currentUser.useFido === "ASK" || status === "COMPLETED");
  if (!show) return null;
  return (
    <View style={Styles.passwordlessToast}>
      {(status === "IDLE" || status === "STARTING") && (
        <View style={Styles.passwordlessFlexGap}>
          <Text>
            We recommend increasing the security of your account by adding face
            or touch unlock for this website.
          </Text>
          <Button
            disabled={status === "STARTING"}
            onClick={() => {
              setStatus("STARTING");
              fido2CreateCredential({
                friendlyName: mobileDeviceName as string,
              })
                .then(() => {
                  updateFidoPreference({ useFido: "YES" });
                })
                .catch(setError)
                .finally(() => setStatus("COMPLETED"));
            }}
          >
            <Text
              style={[
                Styles.buttonText,
                status === "STARTING" ? Styles.buttonTextDisabled : null,
              ]}
            >
              Add face or touch unlock
            </Text>
          </Button>
          <Button
            link
            onClick={() => {
              updateFidoPreference({ useFido: "NO" });
              reset();
            }}
          >
            <Text style={Styles.linkButtonText}>Close</Text>
          </Button>
        </View>
      )}
      {status === "COMPLETED" && (
        <>
          <Text>
            {error
              ? `Failed to activate face or touch unlock: ${error.message}`
              : "Face or touch unlock activated successfully"}
          </Text>
          <Button link onClick={reset}>
            <Text style={Styles.linkButtonText}>Close</Text>
          </Button>
        </>
      )}
    </View>
  );
}

function AuthenticatorsManager() {
  const {
    fido2CreateCredential,
    fido2Credentials,
    showAuthenticatorManager,
    toggleShowAuthenticatorManager,
    signInStatus,
  } = usePasswordless();
  const { updateFidoPreference } = useLocalUserCache();
  const [error, setError] = useState<Error>();
  const [addingAuthenticatorStatus, setAddingAuthenticatorStatus] =
    useState("IDLE");
  const [confirmDeleteRowIndex, setConfirmDeleteRowIndex] = useState(-1);
  const [friendlyName, setFriendlyName] = useState("");
  const [editFriendlyNameRowIndex, setEditFriendlyNameRowIndex] = useState(-1);
  const [editedFriendlyName, setEditedFriendlyName] = useState("");
  const mobileDeviceName = Device.deviceName;
  function reset() {
    setError(undefined);
    setConfirmDeleteRowIndex(-1);
    setEditFriendlyNameRowIndex(-1);
    setAddingAuthenticatorStatus("IDLE");
    setFriendlyName("");
    setEditedFriendlyName("");
  }
  useEffect(() => {
    if (showAuthenticatorManager) {
      reset();
    }
  }, [showAuthenticatorManager]);
  useEffect(() => {
    if (showAuthenticatorManager && signInStatus === "NOT_SIGNED_IN") {
      toggleShowAuthenticatorManager();
    }
  }, [signInStatus, showAuthenticatorManager, toggleShowAuthenticatorManager]);
  /*
  useEffect(() => {
    const intervalId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);
  */
  if (!showAuthenticatorManager) return null;
  const status = {
    isAddingAuthenticator: addingAuthenticatorStatus !== "IDLE",
    isDeletingAuthenticator: confirmDeleteRowIndex !== -1,
    isEditingAuthenticator: editFriendlyNameRowIndex !== -1,
  };
  return (
    <View style={[Styles.passwordlessToast, Styles.passwordlessTable]}>
      {(addingAuthenticatorStatus === "IDLE" ||
        addingAuthenticatorStatus === "STARTING") && (
        <>
          {fido2Credentials?.length === 0 && (
            <View
              style={[Styles.gapElement, Styles.passwordlessFlexStartCenter]}
            >
              <Text>You don&apos;t have any authenticators yet.</Text>
              <View
                style={[
                  Styles.passwordlessTableRow,
                  Styles.passwordlessFlexStartCenter,
                ]}
              >
                <Text>Press the button</Text>
                <Text style={Styles.passwordlessBoldText}>
                  &quot;Register new authenticator&quot;
                </Text>
                <Text>to get started</Text>
              </View>
            </View>
          )}
          {!!fido2Credentials?.length && (
            <View>
              <View style={Styles.passwordlessTableHead}>
                <View style={Styles.passwordlessTableCellTitle} />
                <Text style={Styles.passwordlessTableCell}>
                  {editFriendlyNameRowIndex !== -1 ||
                  confirmDeleteRowIndex !== -1
                    ? ""
                    : "Created at"}
                </Text>
                <View style={Styles.passwordlessTableCellButton} />
              </View>
              <View style={Styles.passwordlessTableBody}>
                {fido2Credentials.map((credential, index) =>
                  editFriendlyNameRowIndex === index ? (
                    <View key={credential.credentialId}>
                      <View style={Styles.passwordlessTableCellTitle}>
                        <View>
                          <TextInput
                            style={Styles.input}
                            value={editedFriendlyName}
                            onChangeText={(e) => setEditedFriendlyName(e)}
                          />
                          <View
                            style={[
                              Styles.passwordlessTableRow,
                              Styles.passwordlessFlexJustifyEnd,
                              Styles.passwordlessFlexGap,
                            ]}
                          >
                            <Button
                              onClick={() => {
                                setError(undefined);
                                credential
                                  .update({
                                    friendlyName: editedFriendlyName,
                                  })
                                  .then(reset)
                                  .catch(setError);
                              }}
                              disabled={
                                credential.busy ||
                                !editedFriendlyName ||
                                editedFriendlyName === credential.friendlyName
                              }
                            >
                              <Text
                                style={[
                                  Styles.buttonText,
                                  credential.busy ||
                                  !editedFriendlyName ||
                                  editedFriendlyName === credential.friendlyName
                                    ? Styles.buttonTextDisabled
                                    : null,
                                ]}
                              >
                                Save
                              </Text>
                            </Button>
                            <Button
                              onClick={() => setEditFriendlyNameRowIndex(-1)}
                              disabled={credential.busy}
                            >
                              <Text
                                style={[
                                  Styles.buttonText,
                                  credential.busy
                                    ? Styles.buttonTextDisabled
                                    : null,
                                ]}
                              >
                                Cancel
                              </Text>
                            </Button>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : confirmDeleteRowIndex === index ? (
                    <View
                      style={Styles.passwordlessTableRow}
                      key={credential.credentialId}
                    >
                      <View style={Styles.passwordlessTableCell}>
                        <View>
                          <View
                            style={[
                              Styles.passwordlessTableRow,
                              Styles.passwordlessFlexStartCenter,
                            ]}
                          >
                            <Text>
                              Are you sure you want to delete your device named
                            </Text>
                            <Text style={Styles.passwordlessBoldText}>
                              &quot;{credential.friendlyName}&quot;
                            </Text>
                            <Text>?</Text>
                          </View>
                          <View
                            style={[
                              Styles.passwordlessTableRow,
                              Styles.passwordlessFlexJustifyEnd,
                              Styles.passwordlessFlexGap,
                            ]}
                          >
                            <Button
                              onClick={() => {
                                setError(undefined);
                                credential.delete().then(reset).catch(setError);
                              }}
                              disabled={credential.busy}
                            >
                              <Text
                                style={[
                                  Styles.buttonText,
                                  credential.busy
                                    ? Styles.buttonTextDisabled
                                    : null,
                                ]}
                              >
                                Yes
                              </Text>
                            </Button>
                            <Button
                              onClick={() => {
                                setError(undefined);
                                setConfirmDeleteRowIndex(-1);
                              }}
                              disabled={credential.busy}
                            >
                              <Text
                                style={[
                                  Styles.buttonText,
                                  credential.busy
                                    ? Styles.buttonTextDisabled
                                    : null,
                                ]}
                              >
                                No
                              </Text>
                            </Button>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View
                      style={Styles.passwordlessTableRow}
                      key={credential.credentialId}
                    >
                      <View
                        style={[
                          Styles.passwordlessTableCellTitle,
                          Styles.passwordlessFlexStartCenter,
                        ]}
                      >
                        <Button
                          style={{ paddingHorizontal: 0 }}
                          link
                          onClick={() => {
                            setEditFriendlyNameRowIndex(index);
                            setEditedFriendlyName(credential.friendlyName);
                          }}
                          disabled={
                            credential.busy ||
                            status.isAddingAuthenticator ||
                            status.isEditingAuthenticator ||
                            status.isDeletingAuthenticator
                          }
                        >
                          <View
                            style={[
                              Styles.passwordlessTableRow,
                              Styles.passwordlessFlexStartCenter,
                              Styles.passwordlessFlexGap,
                              Styles.passwordlessFlexNoWrap,
                            ]}
                          >
                            <SvgXml
                              xml={`
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24px"
                                height="24px"
                                viewBox="0 0 24 24"
                                fill="${Styles.linkButtonText.color}"
                              >
                                <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
                              </svg>
                            `}
                              width="10%"
                            />
                            <Text
                              style={[
                                Styles.linkButtonText,
                                Styles.passwordlessFriendlyNameButtonText,
                                credential.busy
                                  ? Styles.buttonTextDisabled
                                  : null,
                              ]}
                              numberOfLines={1}
                            >
                              {credential.friendlyName}
                            </Text>
                          </View>
                        </Button>
                      </View>
                      <Text style={Styles.passwordlessTableCell}>
                        {credential.createdAt.toISOString()}
                      </Text>
                      <View style={Styles.passwordlessTableCellButton}>
                        <Button
                          outlined
                          onClick={() => {
                            setError(undefined);
                            setConfirmDeleteRowIndex(index);
                          }}
                          disabled={
                            credential.busy ||
                            status.isAddingAuthenticator ||
                            status.isEditingAuthenticator ||
                            status.isDeletingAuthenticator
                          }
                        >
                          <SvgXml
                            xml={`
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24px"
                                height="24px"
                                viewBox="0 0 24 24"
                                fill="${
                                  credential.busy ||
                                  status.isAddingAuthenticator ||
                                  status.isEditingAuthenticator ||
                                  status.isDeletingAuthenticator
                                    ? Styles.buttonTextDisabled.color
                                    : Styles.outlinedButtonText.color
                                }"
                              >
                                <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M9,8H11V17H9V8M13,8H15V17H13V8Z" />
                              </svg>
                            `}
                            height="100%"
                          />
                        </Button>
                      </View>
                    </View>
                  )
                )}
              </View>
            </View>
          )}
        </>
      )}
      <View
        style={[
          Styles.passwordlessFlexGap,
          Styles.passwordlessTableRow,
          Styles.passwordlessTableFooter,
        ]}
      >
        {(addingAuthenticatorStatus === "IDLE" ||
          addingAuthenticatorStatus === "STARTING") && (
          <Button
            onClick={() => {
              setAddingAuthenticatorStatus("STARTING");
              setError(undefined);
              fido2CreateCredential({
                friendlyName: mobileDeviceName as string,
              })
                .then(() => {
                  updateFidoPreference({ useFido: "YES" });
                  reset();
                })
                .catch(setError)
                .finally(() => setAddingAuthenticatorStatus("IDLE"));
            }}
            disabled={
              addingAuthenticatorStatus === "STARTING" ||
              status.isEditingAuthenticator ||
              status.isDeletingAuthenticator
            }
          >
            <Text
              style={[
                Styles.buttonText,
                addingAuthenticatorStatus === "STARTING" ||
                status.isEditingAuthenticator ||
                status.isDeletingAuthenticator
                  ? Styles.buttonTextDisabled
                  : null,
              ]}
            >
              Register new authenticator
            </Text>
          </Button>
        )}
        {(addingAuthenticatorStatus === "INPUT_NAME" ||
          addingAuthenticatorStatus === "COMPLETING") && (
          <View>
            <Text>
              Provide a name for this authenticator, so you can recognize it
              easily later
            </Text>
            <TextInput
              autoFocus
              placeholder="authenticator name"
              value={friendlyName}
              onChangeText={(e) => setFriendlyName(e)}
            />
            <Button
              onClick={() => {
                setAddingAuthenticatorStatus("COMPLETING");
              }}
              disabled={
                !friendlyName || addingAuthenticatorStatus === "COMPLETING"
              }
            >
              Finish
            </Button>
          </View>
        )}
        <Button link onClick={() => toggleShowAuthenticatorManager()}>
          <Text style={Styles.linkButtonText}>Close</Text>
        </Button>
      </View>
      {error && <Text style={Styles.passwordlessError}>{error.message}</Text>}
    </View>
  );
}

export function Fido2Toast() {
  return (
    <>
      <Fido2Recommendation />
      <AuthenticatorsManager />
    </>
  );
}
