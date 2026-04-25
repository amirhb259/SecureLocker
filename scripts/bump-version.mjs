import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextVersion = process.argv[2];

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  throw new Error("Usage: npm run version:bump -- <major.minor.patch>");
}

const packageJsonPath = resolve(rootDir, "package.json");
const tauriConfigPath = resolve(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = resolve(rootDir, "src-tauri", "Cargo.toml");
const versionTxtPath = resolve(rootDir, "VERSION.txt");
const releaseNotesDir = resolve(rootDir, "releases", "notes");
const releaseNotesPath = resolve(releaseNotesDir, `${nextVersion}.json`);

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = nextVersion;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoToml = readFileSync(cargoTomlPath, "utf8").replace(/^version = ".*"$/m, `version = "${nextVersion}"`);
writeFileSync(cargoTomlPath, cargoToml);

writeFileSync(versionTxtPath, `${nextVersion}\n`);

mkdirSync(releaseNotesDir, { recursive: true });
if (!existsSync(releaseNotesPath)) {
  writeFileSync(
    releaseNotesPath,
    `${JSON.stringify(
      {
        version: nextVersion,
        releaseDate: new Date().toISOString().slice(0, 10),
        newFeatures: [],
        newSettings: [],
        securityImprovements: [],
        bugFixes: [],
      },
      null,
      2,
    )}\n`,
  );
}

console.log(`SecureLocker version updated to ${nextVersion}`);
