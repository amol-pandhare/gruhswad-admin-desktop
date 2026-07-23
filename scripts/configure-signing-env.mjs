import { appendFileSync } from "node:fs";

const output = process.env.GITHUB_ENV;
if (!output) {
  throw new Error("GITHUB_ENV is required when configuring release signing.");
}

const entries = [
  ["CSC_LINK", process.env.RELEASE_CERTIFICATE],
  ["CSC_KEY_PASSWORD", process.env.RELEASE_CERTIFICATE_PASSWORD],
  ["APPLE_ID", process.env.RELEASE_APPLE_ID],
  ["APPLE_APP_SPECIFIC_PASSWORD", process.env.RELEASE_APPLE_APP_SPECIFIC_PASSWORD],
  ["APPLE_TEAM_ID", process.env.RELEASE_APPLE_TEAM_ID],
];

for (const [name, value] of entries) {
  if (value?.trim()) {
    appendFileSync(output, `${name}=${value.trim()}\n`, "utf8");
  }
}

appendFileSync(
  output,
  `CSC_IDENTITY_AUTO_DISCOVERY=${entries[0][1]?.trim() ? "true" : "false"}\n`,
  "utf8",
);
