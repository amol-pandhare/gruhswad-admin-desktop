import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const tagArgument = process.argv.slice(2).find((argument) => argument !== "--");
const tag = tagArgument ?? process.env.GITHUB_REF_NAME;
const expectedTag = `v${packageJson.version}`;

if (!tag) {
  throw new Error(
    `Release tag is required. Pass ${expectedTag} as an argument or set GITHUB_REF_NAME.`,
  );
}

if (tag !== expectedTag) {
  throw new Error(
    `Release tag ${JSON.stringify(tag)} does not match package version ${JSON.stringify(packageJson.version)}; expected ${expectedTag}.`,
  );
}

console.log(`Release tag ${tag} matches package version ${packageJson.version}.`);
