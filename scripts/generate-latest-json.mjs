import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readFileSync(resolve(rootDir, "VERSION.txt"), "utf8").trim();
const notesPath = resolve(rootDir, args.notes ?? `releases/notes/${version}.json`);
const outputPath = resolve(rootDir, args.output ?? "releases/latest.json");
const artifactPath = args.artifact ? resolve(rootDir, args.artifact) : null;
const signaturePath = args.signature
  ? resolve(rootDir, args.signature)
  : artifactPath
    ? resolve(rootDir, `${args.artifact}.sig`)
    : null;
const target = args.target ?? "windows-x86_64";

if (!artifactPath || !existsSync(artifactPath)) {
  throw new Error("Pass --artifact <path-to-updater-artifact>.");
}

if (!signaturePath || !existsSync(signaturePath)) {
  throw new Error("Pass --signature <path-to-signature> or keep <artifact>.sig beside the artifact.");
}

if (!existsSync(notesPath)) {
  throw new Error(`Release notes file not found: ${notesPath}`);
}

const rawReleaseNotes = JSON.parse(readFileSync(notesPath, "utf8"));
const releaseNotes = {
  bugFixes: toStringArray(rawReleaseNotes.bugFixes),
  newFeatures: toStringArray(rawReleaseNotes.newFeatures),
  newSettings: toStringArray(rawReleaseNotes.newSettings),
  releaseDate: typeof rawReleaseNotes.releaseDate === "string" ? rawReleaseNotes.releaseDate : new Date().toISOString().slice(0, 10),
  securityImprovements: toStringArray(rawReleaseNotes.securityImprovements),
};
const signature = readFileSync(signaturePath, "utf8").trim();
const artifactName = basename(artifactPath);
const artifactUrl = buildArtifactUrl(args.baseUrl, artifactName);
const flattenedNotes = [
  ...releaseNotes.newFeatures,
  ...releaseNotes.newSettings,
  ...releaseNotes.securityImprovements,
  ...releaseNotes.bugFixes,
].map((note) => `- ${note}`);

if (flattenedNotes.length === 0) {
  throw new Error(`Release notes file ${notesPath} does not contain any bullet points.`);
}

const latestJson = {
  version,
  notes: flattenedNotes.join("\n"),
  pub_date: new Date(`${releaseNotes.releaseDate}T00:00:00.000Z`).toISOString(),
  platforms: {
    [target]: {
      signature,
      url: artifactUrl,
    },
  },
  releaseNotes: {
    bugFixes: releaseNotes.bugFixes,
    newFeatures: releaseNotes.newFeatures,
    newSettings: releaseNotes.newSettings,
    securityImprovements: releaseNotes.securityImprovements,
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(latestJson, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);

function buildArtifactUrl(baseUrlOverride, artifactName) {
  if (baseUrlOverride) {
    return `${baseUrlOverride.replace(/\/$/, "")}/${artifactName}`;
  }

  const tauriConfig = JSON.parse(readFileSync(resolve(rootDir, "src-tauri", "tauri.conf.json"), "utf8"));
  const endpoint = tauriConfig.plugins?.updater?.endpoints?.[0];
  if (typeof endpoint !== "string" || !endpoint.endsWith("/latest/download/latest.json")) {
    throw new Error("Unable to derive the GitHub Releases download URL from src-tauri/tauri.conf.json.");
  }

  return `${endpoint.slice(0, -"latest.json".length)}${artifactName}`;
}

function toStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}
