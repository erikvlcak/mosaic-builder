# Mosaic Builder

Standalone, fully-offline desktop application for assembling publication-quality
multi-panel scientific image figures.

## Development

Requirements: Node 22, pnpm 10.

```sh
pnpm install
pnpm dev        # launch Electron with HMR
pnpm typecheck  # tsc -b
pnpm test       # Vitest
pnpm lint       # ESLint
```

## Packaging

```sh
pnpm gen:icons   # regenerate icns/ico/png from resources/icon.png (run once)
pnpm package     # current OS only → release/
pnpm package:mac # mac-only build (requires macOS host)
pnpm package:win # windows build (cross-build from any host via electron-builder)
pnpm package:linux
```

### Mac code-signing (optional)

To produce a signed and notarized `.dmg`, set these env vars before
running `pnpm package:mac`:

```sh
export CSC_LINK=/path/to/Developer-ID-Application.p12
export CSC_KEY_PASSWORD=<p12 password>
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCD1234
```

Without these set, the `.dmg` is built unsigned — fine for internal
testing but Gatekeeper will warn end users.

Status: M1 (skeleton). See `.claude/plans/` for milestone plans.
