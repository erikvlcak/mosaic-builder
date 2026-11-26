/** App version string, mirroring package.json `version`.
 *
 *  Do NOT edit by hand: `npm version` rewrites this via the `version`
 *  lifecycle hook (scripts/sync-version.mjs), which runs after the bump but
 *  before the commit, so both files land in the same commit.
 *  `app-version.test.ts` fails the build if they ever drift. */
export const APP_VERSION = "0.1.2";
