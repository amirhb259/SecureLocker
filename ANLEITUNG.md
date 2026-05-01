# SecureLocker Anleitung

## Production Zielumgebung

SecureLocker wird ohne separaten Backend-Host betrieben:

- Frontend: Netlify Free unter `https://securelocker1.netlify.app`
- Backend API: Netlify Functions unter `https://securelocker1.netlify.app/api`
- Health Check: `https://securelocker1.netlify.app/api/health`
- Datenbank: Supabase PostgreSQL Free

Damit zeigen Web-App und Desktop-App auf dieselbe echte oeffentliche API. Production-Builds verwenden keine lokale API-Adresse.

## Environment Struktur

Fuer Production gelten diese Werte:

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

Secrets gehoeren in Netlify Environment Variables. Die oeffentlichen URL-Werte sind zusaetzlich in `netlify.toml` gesetzt, damit Frontend, API und Desktop-Build denselben Production-Endpunkt nutzen.

## Deployment

1. Supabase PostgreSQL Free Projekt erstellen.
2. `DATABASE_URL` mit `sslmode=require` in Netlify setzen.
3. `JWT_SECRET`, `AUTH_TOKEN_PEPPER` und SMTP-Werte in Netlify setzen.
4. Netlify Site `securelocker1` mit diesem Repository verbinden.
5. Build Command verwenden:

```bash
npm run build:netlify
```

6. Publish Directory verwenden:

```bash
dist
```

7. Deploy ausloesen.
8. Health Check pruefen:

```bash
curl https://securelocker1.netlify.app/api/health
```

Erwartete Antwort:

```json
{ "ok": true, "service": "SecureLocker API" }
```

## Desktop Build

Der Desktop-Build nutzt denselben Vite Production Build wie Netlify. Vor dem Desktop Release muss `VITE_API_BASE_URL` auf die Production API zeigen:

```env
VITE_API_BASE_URL=https://securelocker1.netlify.app/api
```

Dann bauen:

```bash
npm run release:build
```

## Checkliste

- [ ] Netlify Production Deploy ist online.
- [ ] `https://securelocker1.netlify.app/api/health` liefert JSON.
- [ ] `FRONTEND_URL` ist `https://securelocker1.netlify.app`.
- [ ] `CORS_ORIGIN` ist `https://securelocker1.netlify.app`.
- [ ] `VITE_API_BASE_URL` ist `https://securelocker1.netlify.app/api`.
- [ ] Supabase Migrationen sind angewendet.
- [ ] SMTP Production Credentials sind gesetzt.
