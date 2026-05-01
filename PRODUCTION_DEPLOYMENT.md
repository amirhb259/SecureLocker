# SecureLocker Production Deployment

SecureLocker runs without a separate paid backend host. The React frontend and Express API are deployed together on Netlify Free:

- Frontend: `https://securelocker1.netlify.app`
- API: `https://securelocker1.netlify.app/api`
- Health check: `https://securelocker1.netlify.app/api/health`
- Database: Supabase PostgreSQL Free

## Netlify

Build command:

```bash
npm run build:netlify
```

Publish directory:

```bash
dist
```

Functions directory:

```bash
netlify/functions
```

The API is exposed by `netlify/functions/api.ts`. `netlify.toml` rewrites `/api/*` to that function, so browser and desktop builds use the same public API base URL.

## Production Environment

Set these values in Netlify Environment Variables. Keep secrets in Netlify, not in Git:

```env
API_BASE_URL=https://securelocker1.netlify.app
FRONTEND_URL=https://securelocker1.netlify.app
CORS_ORIGIN=https://securelocker1.netlify.app
VITE_API_BASE_URL=https://securelocker1.netlify.app/api
DATABASE_URL=postgresql://postgres:...@...supabase.com:5432/postgres?sslmode=require
JWT_SECRET=<32+ character secret>
AUTH_TOKEN_PEPPER=<24+ character secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<production mailbox>
SMTP_PASS=<production app password>
SMTP_FROM=SecureLocker <production mailbox>
```

## Verification

After deploying, verify:

```bash
curl https://securelocker1.netlify.app/api/health
npm run build:netlify
```

The production frontend and desktop build must use:

```env
VITE_API_BASE_URL=https://securelocker1.netlify.app/api
```
