# SecureLocker Update Guide

SecureLocker uses the real Tauri updater configured in `src-tauri/tauri.conf.json`. Production update checks read `latest.json` from `https://github.com/amirhb259/SecureLocker/releases/latest/download/latest.json`, validate the configured minisign public key, and only install signed updater artifacts.

The GitHub repo is currently empty, so first release will only work after pushing the project and uploading the first signed release assets.

## Bump the version

1. Run `npm run version:bump -- 0.1.2`.
2. Edit the new notes file created in `releases/notes/0.1.2.json`.
3. Commit the synchronized version changes in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `VERSION.txt`.

## Build the release

1. Run `npm run release:build`.
2. Tauri builds the desktop app and creates updater artifacts because `bundle.createUpdaterArtifacts` is enabled.
3. For the current Windows x64 workflow, keep the updater artifact and its `.sig` file together.

## Sign the update

1. Generate the signing key once with `npm run tauri signer generate -- -w ~/.tauri/securelocker.key`.
2. Store the private key safely and keep the public key already configured in `src-tauri/tauri.conf.json`.
3. Build signed updater artifacts with the normal Tauri release build while the signing key is available to the CLI.

## Generate latest.json

1. Run `npm run release:latest-json -- --artifact <path-to-updater-artifact>`.
2. If the signature file is not next to the artifact, also pass `--signature <path-to-signature>`.
3. The script writes `releases/latest.json`, pulls the version from `VERSION.txt`, pulls notes from `releases/notes/<version>.json`, derives the GitHub release download URL from the updater endpoint in `tauri.conf.json`, and embeds the real signature.

## Upload the release

1. Create a GitHub release for the same version tag.
2. Upload the signed updater artifact, its `.sig` file, and the generated `releases/latest.json`.
3. Publish the release so `releases/latest/download/latest.json` points to the current metadata.

## Edit changelog notes

1. Keep the release notes for each version in `releases/notes/<version>.json`.
2. Fill all four arrays: `newFeatures`, `newSettings`, `securityImprovements`, and `bugFixes`.
3. The generator flattens those entries into updater notes for the in-app changelog overlay and `latest.json`.

## Test locally

1. Build a signed updater artifact for a newer version than the one currently installed.
2. Generate a local `latest.json` with `npm run release:latest-json -- --artifact <path> --baseUrl http://127.0.0.1:8787`.
3. Serve the generated `releases/latest.json`, artifact, and signature from a local static server.
4. Use a local Tauri config override that points the updater endpoint at that local server when running a desktop build for update testing.
5. Verify the app reports `You are up to date.` when versions match, installs only when the served version is higher, and shows the changelog overlay once after restart.
