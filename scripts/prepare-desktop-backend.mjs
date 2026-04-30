import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = join(rootDir, "src-tauri", "resources", "backend");
const rootPackage = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const backendDependencies = [
  "@prisma/client",
  "argon2",
  "cors",
  "dotenv",
  "express",
  "express-rate-limit",
  "helmet",
  "jsonwebtoken",
  "nodemailer",
  "prisma",
  "zod",
];

if (!existsSync(join(rootDir, "dist", "server", "index.js"))) {
  throw new Error("Missing dist/server/index.js. Run npm run build:api before preparing the desktop backend.");
}

rmSync(backendDir, { force: true, recursive: true });
mkdirSync(backendDir, { recursive: true });

copyFileSync(process.execPath, join(backendDir, "node.exe"));
cpSync(join(rootDir, "dist", "server"), join(backendDir, "server"), { recursive: true });
cpSync(join(rootDir, "prisma"), join(backendDir, "prisma"), { recursive: true });

if (existsSync(join(rootDir, ".env"))) {
  copyFileSync(join(rootDir, ".env"), join(backendDir, ".env"));
}

writeFileSync(
  join(backendDir, "package.json"),
  `${JSON.stringify(
    {
      name: "securelocker-backend",
      private: true,
      type: "module",
      dependencies: Object.fromEntries(
        backendDependencies.map((name) => [name, rootPackage.dependencies[name] ?? rootPackage.devDependencies[name]]),
      ),
    },
    null,
    2,
  )}\n`,
);

const install = spawnSync("npm install --omit=dev --package-lock=false", {
  cwd: backendDir,
  shell: true,
  stdio: "inherit",
});

if (install.status !== 0) {
  throw new Error(
    `Failed to install production backend dependencies in ${backendDir}: ${install.error?.message ?? `exit ${install.status}`}`,
  );
}

const generate = spawnSync("npx prisma generate --schema prisma/schema.prisma", {
  cwd: backendDir,
  shell: true,
  stdio: "inherit",
});

if (generate.status !== 0) {
  throw new Error(
    `Failed to generate the packaged Prisma client in ${backendDir}: ${generate.error?.message ?? `exit ${generate.status}`}`,
  );
}
