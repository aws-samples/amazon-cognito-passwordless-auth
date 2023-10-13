module.exports = {
  name: "react-native-client",
  slug: "react-native-client",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.BUNDLE_ID,
    associatedDomains: [
      `applinks:${process.env.PASSKEY_DOMAIN}`,
      `webcredentials:${process.env.PASSKEY_DOMAIN}`,
    ],
  },
  android: {
    package: process.env.BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          buildToolsVersion: "34.0.0",
        },
        ios: {
          deploymentTarget: "16.0",
        },
      },
    ],
  ],
};
