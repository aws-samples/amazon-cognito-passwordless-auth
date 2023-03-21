/* eslint-disable @typescript-eslint/no-var-requires */
const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");

const { name, version } = pkg;

const dir = process.argv[2];
const type = process.argv[3];

if (!dir) {
  throw new Error("Specify directory");
}

if (!type) {
  throw new Error("Specify type: commonjs or module");
}

fs.writeFileSync(
  path.join(__dirname, "dist", dir, "package.json"),
  JSON.stringify({
    name,
    version,
    type,
  })
);
