import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type JwtPayload = {
  sessionId: string;
  userId: string;
};

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(`${config.AUTH_TOKEN_PEPPER}:${token}`)
    .digest("hex");
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 3,
    type: argon2.argon2id,
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function normalizeSecurityAnswer(answer: string) {
  return answer.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function hashSecurityAnswer(answer: string) {
  return hashPassword(normalizeSecurityAnswer(answer));
}

export async function verifySecurityAnswer(hash: string, answer: string) {
  return verifyPassword(hash, normalizeSecurityAnswer(answer));
}

export function signSessionJwt(payload: JwtPayload, rememberDevice: boolean) {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: rememberDevice ? "30d" : "7d",
  });
}

export function verifySessionJwt(token: string) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
}
