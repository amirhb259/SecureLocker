import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
  AUTH_TOKEN_PEPPER: z.string().min(24),
  CORS_ORIGIN: z.string().url().default("http://127.0.0.1:1420"),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://127.0.0.1:1420"),
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

export const config = envSchema.parse(process.env);
