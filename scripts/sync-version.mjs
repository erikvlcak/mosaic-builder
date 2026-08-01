// Rewrites src/renderer/app-version.ts to match package.json.
//
// Wired to the `version` npm lifecycle hook, which fires after the version
// bump but before `npm version` creates its commit and tag — so the constant
// and package.json always land together. Without this, `npm version patch`
// leaves the two out of sync and app-version.test.ts fails, which is exactly
// how the v0.1.1 release build broke.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/renderer/app-version.ts");

const { version } = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);

const src = readFileSync(target, "utf8");
const next = src.replace(
  /export const APP_VERSION = "[^"]*";/,
  `export const APP_VERSION = "${version}";`,
);

if (next === src && !src.includes(`"${version}"`)) {
  console.error(
    `sync-version: could not find the APP_VERSION declaration in ${target}`,
  );
  process.exit(1);
}

writeFileSync(target, next);
console.log(`sync-version: APP_VERSION -> ${version}`);
