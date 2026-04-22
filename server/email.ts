import path from "node:path";
import nodemailer from "nodemailer";
import { config } from "./config.js";

const logoCid = "securelocker-logo@securelocker";
const logoPath = path.resolve(process.cwd(), "src/assets/securelocker-logo.png");

const transport = nodemailer.createTransport({
  auth: {
    pass: config.SMTP_PASS,
    user: config.SMTP_USER,
  },
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
});

type EmailAction = {
  label: string;
  url: string;
  tone?: "primary" | "danger";
};

type SecureEmail = {
  actions: EmailAction[];
  details?: Array<{ label: string; value?: string | null }>;
  intro: string;
  subject: string;
  title: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlEmail(email: SecureEmail) {
  const details = email.details
    ?.filter((item) => item.value)
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;color:#8ca2b7;font-size:13px;">${escapeHtml(item.label)}</td><td style="padding:8px 0;color:#eef9ff;font-size:13px;text-align:right;">${escapeHtml(item.value ?? "")}</td></tr>`,
    )
    .join("");
  const actions = email.actions
    .map((action) => {
      const danger = action.tone === "danger";
      return `<a href="${escapeHtml(action.url)}" style="display:block;margin-top:14px;padding:13px 18px;border-radius:12px;text-align:center;text-decoration:none;font-weight:800;color:${danger ? "#fff3f5" : "#041217"};background:${danger ? "#d94d68" : "linear-gradient(135deg,#6df6de,#92b7ff)"};">${escapeHtml(action.label)}</a>`;
    })
    .join("");
  const fallbackLinks = email.actions
    .map(
      (action) =>
        `<p style="margin:12px 0 0;color:#8ca2b7;font-size:12px;line-height:1.5;">${escapeHtml(action.label)}: <br /><span style="color:#bed0dc;word-break:break-all;">${escapeHtml(action.url)}</span></p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#04070d;font-family:Inter,Segoe UI,Arial,sans-serif;color:#eef9ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:radial-gradient(circle at 80% 0%,rgba(109,246,222,.16),transparent 30%),#04070d;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(142,232,255,.18);border-radius:22px;background:linear-gradient(145deg,rgba(12,27,46,.96),rgba(6,11,20,.94));box-shadow:0 28px 80px rgba(0,0,0,.45);overflow:hidden;">
        <tr><td style="padding:30px 30px 18px;">
          <img src="cid:${logoCid}" width="54" height="54" alt="SecureLocker" style="display:block;width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 0 14px rgba(109,246,222,.32));" />
          <p style="margin:16px 0 8px;color:#6df6de;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">SecureLocker</p>
          <h1 style="margin:0;color:#eef9ff;font-size:26px;line-height:1.15;font-weight:800;">${escapeHtml(email.title)}</h1>
          <p style="margin:14px 0 0;color:#bed0dc;font-size:15px;line-height:1.65;">${escapeHtml(email.intro)}</p>
          ${details ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-top:1px solid rgba(142,232,255,.16);border-bottom:1px solid rgba(142,232,255,.16);">${details}</table>` : ""}
          ${actions}
          ${fallbackLinks}
          <p style="margin:24px 0 0;color:#8ca2b7;font-size:12px;line-height:1.5;">If you did not request this SecureLocker message, secure your account immediately.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderTextEmail(email: SecureEmail) {
  const details = email.details
    ?.filter((item) => item.value)
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");
  const actions = email.actions.map((action) => `${action.label}: ${action.url}`).join("\n");

  return [`SecureLocker`, email.title, email.intro, details, actions, "If you did not request this SecureLocker message, secure your account immediately."]
    .filter(Boolean)
    .join("\n\n");
}

async function sendSecureMail(to: string, email: SecureEmail) {
  await transport.verify();
  await transport.sendMail({
    attachments: [
      {
        cid: logoCid,
        contentDisposition: "inline",
        contentType: "image/png",
        filename: "securelocker-logo.png",
        path: logoPath,
      },
    ],
    from: config.SMTP_FROM,
    html: renderHtmlEmail(email),
    subject: email.subject,
    text: renderTextEmail(email),
    to,
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = `${config.API_BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendSecureMail(to, {
    actions: [{ label: "Verify account", url: verifyUrl }],
    intro: "Confirm this email address to activate your SecureLocker identity. This link expires in 30 minutes.",
    subject: "Verify your SecureLocker account",
    title: "Verify your SecureLocker account",
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = `${config.FRONTEND_URL}/?resetToken=${encodeURIComponent(token)}`;
  await sendSecureMail(to, {
    actions: [{ label: "Reset password", url: resetUrl }],
    intro: "Use this secure link to set a new SecureLocker password. This link expires in 20 minutes.",
    subject: "Reset your SecureLocker password",
    title: "Reset your password",
  });
}

type SecurityLoginEmail = {
  ipAddress: string;
  secureToken: string;
  trustToken: string;
  userAgent?: string | null;
};

export async function sendNewIpSecurityEmail(to: string, details: SecurityLoginEmail) {
  const trustUrl = `${config.API_BASE_URL}/api/security/trust-ip?token=${encodeURIComponent(details.trustToken)}`;
  const secureUrl = `${config.API_BASE_URL}/api/security/secure-account?token=${encodeURIComponent(details.secureToken)}`;
  await sendSecureMail(to, {
    actions: [
      { label: "This was me - trust this IP", url: trustUrl },
      { label: "This was not me - secure account", tone: "danger", url: secureUrl },
    ],
    details: [
      { label: "IP address", value: details.ipAddress },
      { label: "Device", value: details.userAgent },
    ],
    intro: "A valid sign-in attempt came from a new IP address. Confirm it before SecureLocker allows access from this location.",
    subject: "SecureLocker security check: new sign-in location",
    title: "New sign-in location",
  });
}

export async function sendAccountLockedEmail(to: string, ipAddress: string, userAgent?: string | null) {
  await sendSecureMail(to, {
    actions: [{ label: "Open SecureLocker recovery", url: config.FRONTEND_URL }],
    details: [
      { label: "IP address", value: ipAddress },
      { label: "Device", value: userAgent },
    ],
    intro: "SecureLocker locked this account after suspicious access activity. Recover the account before signing in again.",
    subject: "SecureLocker account locked",
    title: "Account locked",
  });
}

export async function sendSecurityQuestionSetupEmail(to: string, token: string) {
  const setupUrl = `${config.FRONTEND_URL}/?questionSetupToken=${encodeURIComponent(token)}`;
  await sendSecureMail(to, {
    actions: [{ label: "Set recovery questions", url: setupUrl }],
    intro: "Your email is verified. Set up three recovery questions before protected sign-in is enabled. This link expires in 45 minutes.",
    subject: "Set up SecureLocker recovery questions",
    title: "Set recovery questions",
  });
}

export async function sendAccountRecoveryEmail(to: string, token: string) {
  const recoveryUrl = `${config.FRONTEND_URL}/?recoveryToken=${encodeURIComponent(token)}`;
  await sendSecureMail(to, {
    actions: [{ label: "Recover account", url: recoveryUrl }],
    intro: "Use this secure recovery link to answer your selected security questions. This link expires in 20 minutes.",
    subject: "Recover your SecureLocker account",
    title: "Recover your account",
  });
}

export async function sendRecoverySuccessEmail(to: string, ipAddress: string, userAgent?: string | null) {
  await sendSecureMail(to, {
    actions: [{ label: "Open SecureLocker", url: config.FRONTEND_URL }],
    details: [
      { label: "IP address", value: ipAddress },
      { label: "Device", value: userAgent },
    ],
    intro: "Your account was unlocked through security-question recovery. If this was not you, reset your password immediately.",
    subject: "SecureLocker account recovered",
    title: "Account recovered",
  });
}
