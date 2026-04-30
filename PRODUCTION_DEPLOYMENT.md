# SecureLocker Production Deployment

## Hosting

- Frontend: Netlify, build command `npm run build`, publish directory `dist`.
- API: Render free web service, build command `npm ci && npm run build:render`, start command `npm run prisma:deploy && npm start`.
- Database: Supabase PostgreSQL. Use the Supabase pooled or direct PostgreSQL connection string in Render as `DATABASE_URL`; include `sslmode=require` when Supabase requires SSL.
- Releases: GitHub Releases. The updater remains configured at `https://github.com/amirhb259/SecureLocker/releases/latest/download/latest.json`.

## Required Render Environment Variables

Set these in Render, not in source control:

- `NODE_ENV=production`
- `API_BASE_URL=https://<your-render-service>.onrender.com`
- `FRONTEND_URL=https://<your-netlify-site>.netlify.app`
- `CORS_ORIGIN=https://<your-netlify-site>.netlify.app`
- `DATABASE_URL=<your-supabase-postgres-url>`
- `JWT_SECRET`
- `AUTH_TOKEN_PEPPER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Required Netlify Environment Variable

- `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api`

## Checks

- `npm run build:api`
- `npm run build`
- `rg "127\\.0\\.0\\.1|localhost" dist`
- `curl https://<your-render-service>.onrender.com/health`
- Run `npm run prisma:deploy` against Supabase before accepting users.
