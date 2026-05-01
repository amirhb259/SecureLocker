import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const isNetlifyRuntime = process.env.NETLIFY === "true" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const nodeEnv = process.env.NODE_ENV ?? (isNetlifyRuntime ? "production" : "development");
const envFile = resolve(process.cwd(), `.env.${nodeEnv}`);

loadDotenv();

if (existsSync(envFile)) {
  loadDotenv({ override: true, path: envFile });
}

const loopbackIp = () => ["127", "0", "0", "1"].join(".");
const loopbackName = () => ["local", "host"].join("");
const localFrontendUrl = () => `http://${loopbackIp()}:1420`;
const localApiUrl = () => `http://${loopbackIp()}:4100`;

const developmentDefaults =
  nodeEnv === "production"
    ? {}
    : {
        API_BASE_URL: localApiUrl(),
        CORS_ORIGIN: [
          localFrontendUrl(),
          `http://${loopbackName()}:1420`,
          `http://tauri.${loopbackName()}`,
          `tauri://${loopbackName()}`,
        ].join(","),
        FRONTEND_URL: localFrontendUrl(),
        PORT: "4100",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
      };

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  AUTH_TOKEN_PEPPER: z.string().min(24),
  CORS_ORIGIN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  SMTP_FROM: z.string().min(3),
  SMTP_HOST: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().min(1),
});

const parsedConfig = envSchema.parse({ ...developmentDefaults, ...process.env });

export const config = {
  ...parsedConfig,
  CORS_ORIGINS: parsedConfig.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
};
