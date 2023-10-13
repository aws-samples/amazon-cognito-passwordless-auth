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
import { StyleSheet } from "react-native";

export const Palette = {
  primary: "#0972d3",
  primaryContrast: "white",
  accent: "",
  accentContrast: "",
  background: "#e9ebed",
  backgroundDark: "#9ba7b6",
};

export const Styles = StyleSheet.create({
  flex: { flex: 1 },
  gapElement: {
    margin: 16,
  },
  button: {
    height: 32,
    backgroundColor: Palette.primary,
    borderRadius: 100,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Palette.primary,
    paddingHorizontal: 16,
  },
  iconButton: {
    paddingHorizontal: 10,
  },
  buttonText: {
    fontWeight: "bold",
    lineHeight: 28,
    textAlign: "center",
    color: Palette.primaryContrast,
  },
  outlinedButton: {
    backgroundColor: "transparent",
  },
  outlinedButtonText: {
    fontWeight: "bold",
    lineHeight: 28,
    textAlign: "center",
    color: Palette.primary,
  },
  linkButtonText: {
    fontWeight: "normal",
    lineHeight: 28,
    textAlign: "center",
    color: Palette.primary,
  },
  disabled: {
    backgroundColor: Palette.background,
    borderColor: "transparent",
  },
  outlinedDisabled: {
    backgroundColor: "transparent",
    borderColor: Palette.backgroundDark,
  },
  buttonTextDisabled: {
    color: Palette.backgroundDark,
  },
  linkButton: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: Palette.backgroundDark,
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 10,
    fontSize: 16,
    lineHeight: 20,
    padding: 8,
  },
  verifiedContainer: {
    position: "absolute",
    right: 12,
    top: 18,
    display: "flex",
    flexDirection: "row",
  },
  verifiedText: {
    marginLeft: -7,
    color: Palette.primary,
  },
  passwordlessFlexColumn: {
    flexDirection: "column",
  },
  passwordlessFlexJustifyEnd: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  passwordlessFlexCenterCenter: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  passwordlessFlexStartCenter: {
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  passwordlessFlexGap: {
    gap: 10,
  },
  passwordlessFlexNoWrap: {
    flexWrap: "nowrap",
  },
  width: { width: "100%" },
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  passwordlessMainContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  passwordlessMainBackgroundImage: {
    position: "absolute",
    zIndex: -1,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  passwordlessCardContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 32,
    position: "relative",
    maxWidth: "90%",
    width: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  passwordlessCustomerLogo: {
    width: 100,
    height: 50,
  },
  passwordlessTextCenter: {
    textAlign: "center",
  },
  passwordlessCustomerName: {
    fontWeight: "normal",
    fontSize: 16,
  },
  passwordlessEmailInput: {
    borderWidth: 1,
    borderColor: "#808080",
    borderRadius: 4,
    padding: 6,
    marginVertical: 10,
  },
  passwordlessError: {
    textAlign: "center",
    marginTop: 16,
    color: "red",
  },
  passwordlessEmailTitle: {
    fontWeight: "bold",
    textAlign: "center",
  },
  passwordlessDivider: {
    flex: 1,
    height: 0.5,
    backgroundColor: "black",
  },
  passwordlessBetweenLines: {
    textTransform: "uppercase",
    fontSize: 12,
    marginRight: 36,
    marginLeft: 36,
  },
  passwordlessToast: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    padding: 16,
    paddingBottom: 6,
    alignSelf: "center",
    top: 0,
    backgroundColor: "white",
    marginTop: 26,
    width: "95%",
    borderRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowColor: "#171717",
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  passwordlessTable: {
    padding: 10,
    paddingBottom: 10,
    display: "flex",
    flexDirection: "column",
  },
  passwordlessTableHead: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  passwordlessTableHideHeaders: {
    opacity: 0,
  },
  passwordlessTableBody: {
    display: "flex",
    flexDirection: "column",
  },
  passwordlessTableBorder: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  passwordlessTableRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  passwordlessTableCell: {
    flex: 1,
    paddingVertical: 6,
  },
  passwordlessTableCellTitle: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 6,
  },
  passwordlessTableCellButton: {
    width: 40,
    paddingVertical: 6,
  },
  passwordlessBoldText: {
    fontWeight: "bold",
  },
  passwordlessTableFooter: {
    marginTop: 10,
  },
  passwordlessFriendlyNameButtonText: {
    width: "100%",
    textAlign: "left",
    paddingRight: 40,
  },
});
