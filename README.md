# SecureLocker

SecureLocker is a Windows desktop security app built with Tauri, React, TypeScript, Vite, Node.js, PostgreSQL, Prisma, Argon2, and SMTP email delivery.

## Local Setup

1. Install dependencies:

```powershell
npm install
```

2. Copy environment settings and fill in real secrets plus SMTP credentials:

```powershell
Copy-Item .env.example .env
```

3. Start PostgreSQL. If Docker is available:

```powershell
docker compose up -d postgres
```

4. Generate Prisma Client and apply migrations:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

5. Run the browser frontend with the API:

```powershell
npm run dev:all
```

6. Run the Windows desktop shell with the API:

```powershell
npm run dev:desktop
```

The desktop script starts the Node API and lets Tauri start Vite through its configured `beforeDevCommand`.

## Auth Features

- Real registration with Argon2 password hashing.
- Real login blocked until email verification is complete.
- Expiring, single-use email verification tokens.
- Resend verification email.
- Expiring, single-use password reset tokens.
- JWT-backed session creation with persisted server-side session records.
- PostgreSQL schema and Prisma migration files.
- SMTP email sending through configured credentials.
- Rate limiting and server-side validation.
- Trusted IP enforcement for verified accounts.
- New-IP login approval by real email action links.
- Single-use trust and secure-account security tokens.
- Security event history with IP, user agent, action, status, and timestamps.
- Suspicious activity account locking with active session revocation.
- Security-question setup after email verification.
- Argon2-hashed recovery answers with normalized answer comparison.
- Locked-account recovery by emailed single-use recovery token.
- Recovery attempts and account lock events with IP and device metadata.
- Seeded database-backed security question catalog.
- Branded SecureLocker logo in the auth UI, Tauri app icon set, and SMTP email templates.
